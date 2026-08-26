import { getDb } from '../lib/db';
import { createSshCredential, type SshCredentialKind } from "./credentials";
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

type CredentialInput =
    | { mode: "new"; authKind: SshCredentialKind; username: string; secret: string }
    | { mode: "existing"; credentialId: string };

export async function addSshConnection(
    environmentId: string,
    host: string,
    port: number,
    credential: CredentialInput,
): Promise<string> {
    const credentialId =
        credential.mode === "new"
            ? await createSshCredential(credential.authKind, `${credential.username}@${host}`, credential.username, credential.secret)
            : credential.credentialId;

    const db = await getDb();
    const id = crypto.randomUUID();
    await db.execute(
        "INSERT INTO connection (id, environment_id, kind, host, port, credential_id) VALUES ($1, $2, 'ssh', $3, $4, $5)",
        [id, environmentId, host, port, credentialId],
    );
    await db.execute(
        "INSERT INTO resource (id, connection_id, kind, label) VALUES ($1, $2, 'server', $3)",
        [crypto.randomUUID(), id, host],
    );

    return id;
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

export async function deleteConnection(connectionId: string): Promise<void> {
    const db = await getDb();
    const rows = await db.select<{ credential_id: string }[]>(
        "SELECT credential_id FROM connection WHERE id = $1",
        [connectionId],
    );
    const credentialId = rows[0]?.credential_id;

    await db.execute("DELETE FROM connection WHERE id = $1", [connectionId]);

    if (credentialId) {
        await db.execute("DELETE FROM credential WHERE id = $1", [credentialId]);
        // tolerate a keychain entry that's already missing — this is exactly the
        // desync state you're in right now, deletion should clean up regardless
        await invoke("keychain_delete", { credentialId }).catch(() => { });
    }
}
