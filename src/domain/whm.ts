import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";
import { getCredentialSecret } from "./credentials";
import { recordAudit } from "./audit";
import type { Connection } from "./types";

interface WhmCallResult {
    metadata: {
        command?: string;
        result: number;
        reason: string;
        version?: number;
    };
    data?: any;
}

export interface WhmServerInfo {
    hostname: string | null;
    whmVersion: string | null;
    loadAverage: { one: number; five: number; fifteen: number } | null;
    raw: unknown;
}

export interface WhmAccount {
    user: string;
    domain: string;
    diskUsed: string;
    diskLimit: string;
    suspended: boolean;
    suspendReason: string | null;
}

async function withWhmCredentials(connection: Connection) {
    const db = await getDb();
    const rows = await db.select<{ username: string }[]>(
        "SELECT username FROM credential WHERE id = $1",
        [connection.credential_id],
    );
    const credential = rows[0];
    if (!credential) throw new Error("Credential not found for this connection");

    const apiToken = await getCredentialSecret(connection.credential_id);

    return {
        host: connection.host,
        port: connection.port,
        username: credential.username,
        apiToken,
    };
}

async function callWhm(
    creds: { host: string; port: number; username: string; apiToken: string },
    fn: string,
    params: Record<string, string> = {},
): Promise<WhmCallResult> {
    return invoke<WhmCallResult>("whm_call", { ...creds, function: fn, params });
}

export async function testWhmConnection(connection: Connection, resourceId: string): Promise<WhmServerInfo> {
    const creds = await withWhmCredentials(connection);
    try {
        const [version, hostname] = await Promise.all([
            callWhm(creds, "version"),
            callWhm(creds, "gethostname"),
        ]);
        if (version.metadata.result !== 1) {
            throw new Error(version.metadata.reason || "Authentication failed");
        }

        const info: WhmServerInfo = {
            whmVersion: version.data?.version ?? null,
            hostname: hostname.data?.hostname ?? null,
            loadAverage: null,
            raw: { version, hostname },
        };

        const db = await getDb();
        await db.execute(
            "UPDATE connection SET last_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1",
            [connection.id],
        );
        await db.execute("UPDATE resource SET metadata = $1 WHERE id = $2", [JSON.stringify(info), resourceId]);

        await recordAudit({ connectionId: connection.id, resourceId, action: "connection.test", detail: null, result: "success" });
        return info;
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action: "connection.test", detail: String(err), result: "failure" });
        throw err;
    }
}

export async function getWhmServerInfo(connection: Connection): Promise<WhmServerInfo> {
    const creds = await withWhmCredentials(connection);
    const [version, hostname, loadavg] = await Promise.all([
        callWhm(creds, "version"),
        callWhm(creds, "gethostname"),
        callWhm(creds, "loadavg"),
    ]);

    return {
        whmVersion: version.data?.version ?? null,
        hostname: hostname.data?.hostname ?? null,
        loadAverage:
            loadavg.metadata.result === 1 && loadavg.data
                ? {
                    one: Number(loadavg.data.one ?? 0),
                    five: Number(loadavg.data.five ?? 0),
                    fifteen: Number(loadavg.data.fifteen ?? 0),
                }
                : null,
        raw: { version, hostname, loadavg },
    };
}

export async function listWhmAccounts(connection: Connection): Promise<WhmAccount[]> {
    const creds = await withWhmCredentials(connection);
    const result = await callWhm(creds, "listaccts");
    if (result.metadata.result !== 1) {
        throw new Error(result.metadata.reason || "Failed to list accounts");
    }
    const accounts = (result.data?.acct ?? []) as any[];
    return accounts.map((a) => ({
        user: String(a.user),
        domain: String(a.domain),
        diskUsed: String(a.diskused),
        diskLimit: String(a.disklimit),
        suspended: Number(a.suspended) === 1,
        suspendReason: a.suspendreason || null,
    }));
}

async function setAccountSuspension(
    connection: Connection,
    resourceId: string,
    user: string,
    suspend: boolean,
    reason: string | undefined,
    action: "account.suspend" | "account.unsuspend",
): Promise<void> {
    const creds = await withWhmCredentials(connection);
    let result: WhmCallResult;
    try {
        result = await callWhm(
            creds,
            suspend ? "suspendacct" : "unsuspendacct",
            suspend && reason ? { user, reason } : { user },
        );
    } catch (err) {
        await recordAudit({ connectionId: connection.id, resourceId, action, detail: `${user}: ${String(err)}`, result: "failure" });
        throw err;
    }

    const ok = result.metadata.result === 1;
    await recordAudit({
        connectionId: connection.id,
        resourceId,
        action,
        detail: ok ? user : `${user}: ${result.metadata.reason}`,
        result: ok ? "success" : "failure",
    });
    if (!ok) throw new Error(result.metadata.reason || "Request failed");
}

export function suspendWhmAccount(connection: Connection, resourceId: string, user: string, reason?: string): Promise<void> {
    return setAccountSuspension(connection, resourceId, user, true, reason, "account.suspend");
}

export function unsuspendWhmAccount(connection: Connection, resourceId: string, user: string): Promise<void> {
    return setAccountSuspension(connection, resourceId, user, false, undefined, "account.unsuspend");
}
