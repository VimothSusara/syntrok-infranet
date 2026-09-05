import { invoke } from "@tauri-apps/api/core";

export function backupDatabase(destination: string): Promise<void> {
    return invoke("backup_database", { destination });
}

export function restoreDatabase(source: string): Promise<void> {
    return invoke("restore_database", { source });
}
