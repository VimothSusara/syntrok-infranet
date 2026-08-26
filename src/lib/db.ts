import Database from '@tauri-apps/plugin-sql';

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
    if (!dbPromise) {
        dbPromise = (async () => {
            const db = await Database.load('sqlite:infranet.db');
            await db.execute('PRAGMA foreign_keys = ON;');
            await db.execute('PRAGMA journal_mode = WAL;');
            return db;
        })();
    }
    return dbPromise;
}
