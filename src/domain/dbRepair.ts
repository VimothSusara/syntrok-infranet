import { invoke } from "@tauri-apps/api/core";

export interface RepairResult {
    repairedVersions: number[];
    message: string;
}

// Detects sqlx's specific "checksum drift" wording (see
// src-tauri/src/db_repair.rs) so the "Could not start the app" screen only
// offers the repair action when it could plausibly help — never for an
// unrelated startup failure.
export function isMigrationChecksumError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /previously applied but has been modified/i.test(message);
}

export async function repairMigrationChecksums(): Promise<RepairResult> {
    const result = await invoke<{ repaired_versions: number[]; message: string }>(
        "repair_migration_checksums",
    );
    return { repairedVersions: result.repaired_versions, message: result.message };
}
