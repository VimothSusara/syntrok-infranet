import { getDb } from '../lib/db';
import { cleanupOrphanedCredential } from './connections';
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

export async function renameProject(projectId: string, name: string): Promise<void> {
    const db = await getDb();
    await db.execute('UPDATE project SET name = $1 WHERE id = $2', [name, projectId]);
}

// Everything under a project (environments, connections, resources) cascades
// via the schema's ON DELETE CASCADE — but that cascade is a raw SQL-level
// delete, so it won't run the credential-cleanup a normal connection removal
// does. Capture which credentials are about to be orphaned first, delete the
// project, then clean those up explicitly.
export async function deleteProject(projectId: string): Promise<void> {
    const db = await getDb();
    const credentialRows = await db.select<{ credential_id: string }[]>(
        `SELECT DISTINCT connection.credential_id
         FROM connection
         JOIN environment ON environment.id = connection.environment_id
         WHERE environment.project_id = $1`,
        [projectId],
    );

    await db.execute('DELETE FROM project WHERE id = $1', [projectId]);

    for (const { credential_id } of credentialRows) {
        await cleanupOrphanedCredential(credential_id);
    }
}

// Used to size the confirmation warning before deleting.
export async function getProjectDeleteImpact(projectId: string): Promise<{ environments: number; connections: number }> {
    const db = await getDb();
    const [{ environments }] = await db.select<{ environments: number }[]>(
        'SELECT COUNT(*) as environments FROM environment WHERE project_id = $1',
        [projectId],
    );
    const [{ connections }] = await db.select<{ connections: number }[]>(
        `SELECT COUNT(*) as connections FROM connection
         JOIN environment ON environment.id = connection.environment_id
         WHERE environment.project_id = $1`,
        [projectId],
    );
    return { environments, connections };
}
