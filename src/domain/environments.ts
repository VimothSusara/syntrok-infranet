import { getDb } from '../lib/db';
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
