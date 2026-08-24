import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../lib/db';
import { getCredentialSecret } from './credentials';
import { recordAudit } from './audit';
import type { Connection } from './types';

interface ExecResult {
    stdout: string;
    stderr: string;
    exit_status: number;
}

interface DiscoveryResult {
    systemd: boolean;
    docker: boolean;
    podman: boolean;
}

export async function withCredentials(connection: Connection) {
    const db = await getDb();
    const rows = await db.select<{ username: string; kind: string }[]>(
        "SELECT username, kind FROM credential WHERE id = $1",
        [connection.credential_id],
    );
    const credential = rows[0];
    if (!credential) throw new Error("Credential not found for this connection");

    const secret = await getCredentialSecret(connection.credential_id);

    return {
        host: connection.host,
        port: connection.port,
        username: credential.username,
        credentialKind: credential.kind,
        secret,
    };
}

export async function testConnection(connection: Connection, resourceId: string): Promise<DiscoveryResult> {
    const creds = await withCredentials(connection);
    try {
        const discovery = await invoke<DiscoveryResult>("ssh_discover", creds);

        const db = await getDb();
        await db.execute(
            "UPDATE connection SET last_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1",
            [connection.id],
        );
        await db.execute("UPDATE resource SET metadata = $1 WHERE id = $2", [JSON.stringify(discovery), resourceId]);

        await recordAudit({ connectionId: connection.id, resourceId, action: "connection.test", detail: null, result: "success" });
        return discovery;
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "connection.test", detail: String(err), result: "failure" });
        throw err;
    }
}

export async function listServices(connection: Connection): Promise<string[]> {
    const creds = await withCredentials(connection);
    const command = "systemctl list-units --type=service --state=running --no-legend --no-pager";
    const result = await invoke<ExecResult>("ssh_exec", { ...creds, command });
    return result.stdout
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((name) => name.length > 0);
}

export function describeRestartFailure(result: ExecResult): string {
    const stderr = result.stderr.toLowerCase();
    if (stderr.includes("a password is required") || stderr.includes("no tty present")) {
        return "This user doesn't have passwordless sudo configured for this command.";
    }
    return result.stderr || `exited with status ${result.exit_status}`;
}

export async function restartService(connection: Connection, resourceId: string, serviceName: string): Promise<ExecResult> {
    const creds = await withCredentials(connection);
    const command = `sudo systemctl restart ${serviceName}`;

    let result: ExecResult;
    try {
        result = await invoke<ExecResult>("ssh_exec", { ...creds, command });
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "service.restart", detail: `${serviceName}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const detail = result.exit_status === 0 ? serviceName : `${serviceName}: ${describeRestartFailure(result)}`;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action: "service.restart",
        detail,
        result: result.exit_status === 0 ? "success" : "failure",
    });

    return result;
}
