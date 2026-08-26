import { getDb } from '../lib/db';
import { cleanupOrphanedCredential } from './connections';
import type { Environment } from './types';

export async function listEnvironments(projectId: string): Promise<Environment[]> {
    const db = await getDb();
    return db.select<Environment[]>(
        'SELECT * FROM environment WHERE project_id = $1 ORDER BY name',
        [projectId],
    );
}

export async function createEnvironment(projectId: string, name: string): Promise<string> {
    const db = await getDb();
    const id = crypto.randomUUID();
    await db.execute(
        'INSERT INTO environment (id, project_id, name) VALUES ($1, $2, $3)',
        [id, projectId, name],
    );
    return id;
}

export async function getEnvironmentById(environmentId: string): Promise<Environment | null> {
    const db = await getDb();
    const rows = await db.select<Environment[]>("SELECT * FROM environment WHERE id = $1", [environmentId]);
    return rows[0] ?? null;
}

export async function renameEnvironment(environmentId: string, name: string): Promise<void> {
    const db = await getDb();
    await db.execute('UPDATE environment SET name = $1 WHERE id = $2', [name, environmentId]);
}

export async function deleteEnvironment(environmentId: string): Promise<void> {
    const db = await getDb();
    const credentialRows = await db.select<{ credential_id: string }[]>(
        'SELECT DISTINCT credential_id FROM connection WHERE environment_id = $1',
        [environmentId],
    );

    await db.execute('DELETE FROM environment WHERE id = $1', [environmentId]);

    for (const { credential_id } of credentialRows) {
        await cleanupOrphanedCredential(credential_id);
    }
}

export async function getEnvironmentDeleteImpact(environmentId: string): Promise<{ connections: number }> {
    const db = await getDb();
    const [{ connections }] = await db.select<{ connections: number }[]>(
        'SELECT COUNT(*) as connections FROM connection WHERE environment_id = $1',
        [environmentId],
    );
    return { connections };
}