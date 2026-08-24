import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
    if (!dbInstance) {
        dbInstance = await Database.load('sqlite:infranet.db');
        await dbInstance.execute('PRAGMA foreign_keys = ON;');
        await dbInstance.execute('PRAGMA journal_mode = WAL;');
    }
    return dbInstance;
}