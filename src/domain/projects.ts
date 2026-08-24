import { getDb } from '../lib/db';
import type { Project } from './types';

export async function listProjects(workspaceId: string): Promise<Project[]> {
    const db = await getDb();
    return db.select<Project[]>(
        'SELECT * FROM project WHERE workspace_id = $1 ORDER BY name',
        [workspaceId],
    );
}

export async function createProject(workspaceId: string, name: string): Promise<string> {
    const db = await getDb();
    const id = crypto.randomUUID();
    await db.execute(
        'INSERT INTO project (id, workspace_id, name) VALUES ($1, $2, $3)',
        [id, workspaceId, name],
    );
    return id;
}

export async function getProjectById(projectId: string): Promise<Project | null> {
    const db = await getDb();
    const rows = await db.select<Project[]>("SELECT * FROM project WHERE id = $1", [projectId]);
    return rows[0] ?? null;
}