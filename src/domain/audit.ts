import { getDb } from '../lib/db';
import type { AuditEvent } from './types';
import { normalizeListParams, type ListParams, type ListResult } from "./listQuery";

export interface AuditEventWithContext extends AuditEvent {
    projectName: string | null;
    connectionHost: string | null;
}

export interface AuditListParams extends ListParams {
    result?: "all" | "success" | "failure";
}

export async function recordAudit(params: {
    connectionId: string | null;
    resourceId: string | null;
    action: string;
    detail: string | null;
    result: 'success' | 'failure';
}): Promise<void> {
    const db = await getDb();
    await db.execute(
        'INSERT INTO audit_event (id, connection_id, resource_id, action, detail, result) VALUES ($1, $2, $3, $4, $5, $6)',
        [crypto.randomUUID(), params.connectionId, params.resourceId, params.action, params.detail, params.result],
    );
}

export async function listAuditEvents(connectionId: string): Promise<AuditEvent[]> {
    const db = await getDb();
    return db.select<AuditEvent[]>(
        'SELECT * FROM audit_event WHERE connection_id = $1 ORDER BY created_at DESC',
        [connectionId],
    );
}

export async function listAllAuditEvents(params: AuditListParams): Promise<ListResult<AuditEventWithContext>> {
    const { page, pageSize, offset } = normalizeListParams(params);
    const resultFilter = params.result ?? "all";
    const search = params.search?.trim();

    const conditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (resultFilter !== "all") {
        sqlParams.push(resultFilter);
        conditions.push(`audit_event.result = $${sqlParams.length}`);
    }
    if (search) {
        sqlParams.push(`%${search}%`);
        conditions.push(`(audit_event.action LIKE $${sqlParams.length} OR connection.host LIKE $${sqlParams.length} OR project.name LIKE $${sqlParams.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const fromClause = `
    FROM audit_event
    LEFT JOIN connection ON connection.id = audit_event.connection_id
    LEFT JOIN environment ON environment.id = connection.environment_id
    LEFT JOIN project ON project.id = environment.project_id
    ${whereClause}`;

    const db = await getDb();

    const [{ total }] = await db.select<{ total: number }[]>(`SELECT COUNT(*) as total ${fromClause}`, sqlParams);

    const items = await db.select<AuditEventWithContext[]>(
        `SELECT audit_event.*, project.name as projectName, connection.host as connectionHost
     ${fromClause}
     ORDER BY audit_event.created_at DESC
     LIMIT $${sqlParams.length + 1} OFFSET $${sqlParams.length + 2}`,
        [...sqlParams, pageSize, offset],
    );

    return { items, total, page, pageSize };
}