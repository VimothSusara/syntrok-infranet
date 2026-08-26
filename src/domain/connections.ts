import { getDb } from '../lib/db';
import { createSshCredential, createWhmCredential, createCpanelCredential, type SshCredentialKind } from "./credentials";
import { recordAudit } from "./audit";
import type { Connection } from './types';
import { invoke } from "@tauri-apps/api/core";

export interface ConnectionDetails extends Connection {
    credentialUsername: string;
    credentialKind: string;
    projectId: string;
    projectName: string;
    environmentId: string;
    environmentName: string;
}

export async function listConnections(environmentId: string): Promise<Connection[]> {
    const db = await getDb();
    return db.select<Connection[]>(
        'SELECT * FROM connection WHERE environment_id = $1 ORDER BY host',
        [environmentId],
    );
}

export type CredentialInput =
    | { mode: "new"; authKind: SshCredentialKind; username: string; secret: string; passphrase?: string }
    | { mode: "existing"; credentialId: string };

async function insertConnectionAndResource(
    environmentId: string,
    kind: "ssh" | "whm" | "cpanel",
    host: string,
    port: number,
    credentialId: string,
): Promise<string> {
    const db = await getDb();
    const id = crypto.randomUUID();
    await db.execute(
        "INSERT INTO connection (id, environment_id, kind, host, port, credential_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, environmentId, kind, host, port, credentialId],
    );
    await db.execute(
        "INSERT INTO resource (id, connection_id, kind, label) VALUES ($1, $2, 'server', $3)",
        [crypto.randomUUID(), id, host],
    );
    return id;
}

export async function addSshConnection(
    environmentId: string,
    host: string,
    port: number,
    credential: CredentialInput,
): Promise<string> {
    const credentialId =
        credential.mode === "new"
            ? await createSshCredential(
                credential.authKind,
                `${credential.username}@${host}`,
                credential.username,
                credential.secret,
                credential.passphrase,
            )
            : credential.credentialId;

    return insertConnectionAndResource(environmentId, "ssh", host, port, credentialId);
}

export type WhmCredentialInput =
    | { mode: "new"; username: string; apiToken: string }
    | { mode: "existing"; credentialId: string };

export async function addWhmConnection(
    environmentId: string,
    host: string,
    port: number,
    credential: WhmCredentialInput,
): Promise<string> {
    const credentialId =
        credential.mode === "new"
            ? await createWhmCredential(`${credential.username}@${host}`, credential.username, credential.apiToken)
            : credential.credentialId;

    return insertConnectionAndResource(environmentId, "whm", host, port, credentialId);
}

// Called after any successful SSH operation with the fingerprint the server
// presented. Safe to call unconditionally: if nothing is pinned yet this pins
// it; if something is already pinned, Rust would have already rejected the
// connection on a mismatch, so this only ever re-writes the same value.
export async function persistHostFingerprint(connectionId: string, fingerprint: string): Promise<void> {
    if (!fingerprint) return;
    const db = await getDb();
    await db.execute(
        "UPDATE connection SET known_host_fingerprint = $1 WHERE id = $2 AND (known_host_fingerprint IS NULL OR known_host_fingerprint = $1)",
        [fingerprint, connectionId],
    );
}

export async function clearHostFingerprint(connectionId: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE connection SET known_host_fingerprint = NULL WHERE id = $1",
        [connectionId],
    );
}

export async function getResourceForConnection(connectionId: string) {
    const db = await getDb();
    const rows = await db.select<{ id: string; metadata: string | null }[]>(
        'SELECT id, metadata FROM resource WHERE connection_id = $1 LIMIT 1',
        [connectionId],
    );
    return rows[0] ?? null;
}

export async function getConnectionById(connectionId: string): Promise<ConnectionDetails | null> {
    const db = await getDb();
    const rows = await db.select<ConnectionDetails[]>(
        `SELECT connection.*,
            credential.username as credentialUsername,
            credential.kind as credentialKind,
            project.id as projectId,
            project.name as projectName,
            environment.id as environmentId,
            environment.name as environmentName
     FROM connection
     JOIN credential ON credential.id = connection.credential_id
     JOIN environment ON environment.id = connection.environment_id
     JOIN project ON project.id = environment.project_id
     WHERE connection.id = $1`,
        [connectionId],
    );
    return rows[0] ?? null;
}

// Deletes a credential only if no connection references it anymore. Safe to
// call after any delete that might have just cascaded away that credential's
// last remaining connection (a direct connection delete, or a project/
// environment delete that took a bunch of connections down with it).
export async function cleanupOrphanedCredential(credentialId: string): Promise<void> {
    const db = await getDb();
    const [{ count }] = await db.select<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM connection WHERE credential_id = $1",
        [credentialId],
    );
    if (count === 0) {
        await db.execute("DELETE FROM credential WHERE id = $1", [credentialId]);
        // tolerate a keychain entry that's already missing — this is exactly the
        // desync state you're in right now, deletion should clean up regardless
        await invoke("keychain_delete", { credentialId }).catch(() => { });
    }
}

export async function deleteConnection(connectionId: string): Promise<void> {
    const db = await getDb();
    const rows = await db.select<{ credential_id: string }[]>(
        "SELECT credential_id FROM connection WHERE id = $1",
        [connectionId],
    );
    const credentialId = rows[0]?.credential_id;

    await db.execute("DELETE FROM connection WHERE id = $1", [connectionId]);

    if (credentialId) {
        await cleanupOrphanedCredential(credentialId);
    }
}
async function applyConnectionUpdate(
    connectionId: string,
    existing: { credential_id: string; host: string; port: number },
    newHost: string,
    newPort: number,
    newCredentialId: string,
): Promise<void> {
    const db = await getDb();
    const oldCredentialId = existing.credential_id;
    const hostOrPortChanged = existing.host !== newHost || existing.port !== newPort;
    const credentialChanged = newCredentialId !== oldCredentialId;

    if (hostOrPortChanged || credentialChanged) {
        await db.execute(
            hostOrPortChanged
                ? "UPDATE connection SET host = $1, port = $2, credential_id = $3, last_verified_at = NULL, known_host_fingerprint = NULL WHERE id = $4"
                : "UPDATE connection SET host = $1, port = $2, credential_id = $3, last_verified_at = NULL WHERE id = $4",
            [newHost, newPort, newCredentialId, connectionId],
        );
        await db.execute("UPDATE resource SET metadata = NULL WHERE connection_id = $1", [connectionId]);

        const changes: string[] = [];
        if (hostOrPortChanged) {
            changes.push(`address changed to ${newHost}:${newPort} (was ${existing.host}:${existing.port})`);
        }
        if (credentialChanged) changes.push("credential changed");
        await recordAudit({
            connectionId,
            resourceId: null,
            action: "connection.update",
            detail: changes.join("; "),
            result: "success",
        });
    }

    if (hostOrPortChanged) {
        await db.execute("UPDATE resource SET label = $1 WHERE connection_id = $2", [newHost, connectionId]);
    }

    if (credentialChanged) {
        await cleanupOrphanedCredential(oldCredentialId);
    }
}

async function getConnectionForUpdate(connectionId: string) {
    const db = await getDb();
    const rows = await db.select<{ credential_id: string; host: string; port: number }[]>(
        "SELECT credential_id, host, port FROM connection WHERE id = $1",
        [connectionId],
    );
    const existing = rows[0];
    if (!existing) throw new Error("Connection not found");
    return existing;
}

export async function updateConnection(
    connectionId: string,
    input: { host: string; port: number; credential: CredentialInput },
): Promise<void> {
    const existing = await getConnectionForUpdate(connectionId);

    const newCredentialId =
        input.credential.mode === "new"
            ? await createSshCredential(
                input.credential.authKind,
                `${input.credential.username}@${input.host}`,
                input.credential.username,
                input.credential.secret,
                input.credential.passphrase,
            )
            : input.credential.credentialId;

    await applyConnectionUpdate(connectionId, existing, input.host, input.port, newCredentialId);
}

export async function updateWhmConnection(
    connectionId: string,
    input: { host: string; port: number; credential: WhmCredentialInput },
): Promise<void> {
    const existing = await getConnectionForUpdate(connectionId);

    const newCredentialId =
        input.credential.mode === "new"
            ? await createWhmCredential(`${input.credential.username}@${input.host}`, input.credential.username, input.credential.apiToken)
            : input.credential.credentialId;

    await applyConnectionUpdate(connectionId, existing, input.host, input.port, newCredentialId);
}


export type CpanelCredentialInput =
    | { mode: "new"; username: string; apiToken: string }
    | { mode: "existing"; credentialId: string };

export async function addCpanelConnection(
    environmentId: string,
    host: string,
    port: number,
    credential: CpanelCredentialInput,
): Promise<string> {
    const credentialId =
        credential.mode === "new"
            ? await createCpanelCredential(`${credential.username}@${host}`, credential.username, credential.apiToken)
            : credential.credentialId;

    return insertConnectionAndResource(environmentId, "cpanel", host, port, credentialId);
}

export async function updateCpanelConnection(
    connectionId: string,
    input: { host: string; port: number; credential: CpanelCredentialInput },
): Promise<void> {
    const existing = await getConnectionForUpdate(connectionId);

    const newCredentialId =
        input.credential.mode === "new"
            ? await createCpanelCredential(`${input.credential.username}@${input.host}`, input.credential.username, input.credential.apiToken)
            : input.credential.credentialId;

    await applyConnectionUpdate(connectionId, existing, input.host, input.port, newCredentialId);
}
