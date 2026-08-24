import { getDb } from '../lib/db';
import type { Workspace } from './types';

export async function ensureDefaultWorkspace(): Promise<Workspace> {
    const db = await getDb();
    const existing = await db.select<Workspace[]>('SELECT * FROM workspace LIMIT 1');
    if (existing.length > 0) return existing[0];

    const id = crypto.randomUUID();
    await db.execute('INSERT INTO workspace (id, name) VALUES ($1, $2)', [id, 'My Workspace']);
    return { id, name: 'My Workspace', created_at: new Date().toISOString() };
}
