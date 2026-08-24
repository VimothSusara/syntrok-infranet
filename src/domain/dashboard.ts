import { getDb } from "../lib/db";
import type { Connection, AuditEvent } from "./types";

export interface DashboardStats {
    projectCount: number;
    serverCount: number;
    unverifiedCount: number;
}

export async function getDashboardStats(workspaceId: string): Promise<DashboardStats> {
    const db = await getDb();

    const [{ projectCount }] = await db.select<{ projectCount: number }[]>(
        "SELECT COUNT(*) as projectCount FROM project WHERE workspace_id = $1",
        [workspaceId],
    );

    const [{ serverCount, unverifiedCount }] = await db.select<
        { serverCount: number; unverifiedCount: number }[]
    >(
        `SELECT COUNT(*) as serverCount,
            SUM(CASE WHEN connection.last_verified_at IS NULL THEN 1 ELSE 0 END) as unverifiedCount
     FROM connection
     JOIN environment ON environment.id = connection.environment_id
     JOIN project ON project.id = environment.project_id
     WHERE project.workspace_id = $1`,
        [workspaceId],
    );

    return { projectCount, serverCount, unverifiedCount: unverifiedCount ?? 0 };
}

export interface UnverifiedConnection extends Connection {
    projectName: string;
    environmentName: string;
}

export async function listUnverifiedConnections(workspaceId: string): Promise<UnverifiedConnection[]> {
    const db = await getDb();
    return db.select<UnverifiedConnection[]>(
        `SELECT connection.*, project.name as projectName, environment.name as environmentName
     FROM connection
     JOIN environment ON environment.id = connection.environment_id
     JOIN project ON project.id = environment.project_id
     WHERE project.workspace_id = $1 AND connection.last_verified_at IS NULL
     ORDER BY connection.created_at DESC`,
        [workspaceId],
    );
}

export interface RecentAuditEvent extends AuditEvent {
    projectName: string | null;
    connectionHost: string | null;
}

export async function listRecentAuditEvents(limit = 8): Promise<RecentAuditEvent[]> {
    // No workspace filter here: V1 is single-workspace, and audit_event.connection_id
    // can be SET NULL if its connection is later deleted — filtering by workspace
    // through that chain would silently drop exactly the rows the audit trail
    // exists to preserve. Revisit this if multi-workspace ever ships.
    const db = await getDb();
    return db.select<RecentAuditEvent[]>(
        `SELECT audit_event.*, project.name as projectName, connection.host as connectionHost
     FROM audit_event
     LEFT JOIN connection ON connection.id = audit_event.connection_id
     LEFT JOIN environment ON environment.id = connection.environment_id
     LEFT JOIN project ON project.id = environment.project_id
     ORDER BY audit_event.created_at DESC
     LIMIT $1`,
        [limit],
    );
}
