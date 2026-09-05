use sqlx::sqlite::SqlitePoolOptions;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

const DB_FILENAME: &str = "infranet.db";

fn db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    // Must match tauri-plugin-sql's own path resolution exactly (app
    // config dir + filename), same requirement already documented in
    // db_repair.rs — a mismatch here would operate on the wrong file.
    let app_path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(app_path.join(DB_FILENAME))
}

/// Writes a complete, consistent snapshot of the live database to
/// `destination`. Uses `VACUUM INTO` rather than a plain file copy: the
/// app runs SQLite in WAL mode (see src/lib/db.ts), so data can be
/// durable but still sitting in a separate `-wal` file — a naive copy of
/// just `infranet.db` can silently miss it. `VACUUM INTO` is SQLite's own
/// documented mechanism for a single-file, always-consistent snapshot
/// regardless of WAL state.
#[tauri::command]
pub async fn backup_database<R: Runtime>(app: AppHandle<R>, destination: String) -> Result<(), String> {
    let source = db_path(&app)?;
    if !source.exists() {
        return Err("No local database file found to back up.".into());
    }

    let url = format!("sqlite:{}", source.to_str().ok_or("Invalid database path")?);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("VACUUM INTO ?")
        .bind(&destination)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    pool.close().await;
    Ok(())
}

/// Overwrites the live database file with `source`, clearing any stale
/// WAL/SHM sidecar files so the app doesn't replay old WAL frames against
/// the newly-restored main file on next open. Never attempts this while
/// the app's own tauri-plugin-sql connection is live — the caller must
/// relaunch the app immediately after this succeeds, the same pattern
/// already used by repair_migration_checksums for the identical reason.
#[tauri::command]
pub async fn restore_database<R: Runtime>(app: AppHandle<R>, source: String) -> Result<(), String> {
    let dest = db_path(&app)?;
    let source_path = PathBuf::from(&source);
    if !source_path.exists() {
        return Err("Backup file not found.".into());
    }

    std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;

    for suffix in ["-wal", "-shm"] {
        let mut stale = dest.clone().into_os_string();
        stale.push(suffix);
        let stale_path = PathBuf::from(stale);
        if stale_path.exists() {
            std::fs::remove_file(&stale_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
