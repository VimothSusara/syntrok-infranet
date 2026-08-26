use serde::Serialize;
use sha2::{Digest, Sha384};
use sqlx::{sqlite::SqlitePoolOptions, Row};
use tauri::{AppHandle, Manager, Runtime};

const DB_FILENAME: &str = "infranet.db";

// Mirrors the exact migration list registered in lib.rs. Kept as its own
// source of truth here (not shared code, deliberately) so this repair
// path can never silently apply a migration or drift from what actually
// ships — if a future migration is added, it must be added here too, or
// this command simply won't know about it and will leave it untouched,
// which is the safe default.
fn expected_migrations() -> [(i64, &'static str); 4] {
    [
        (1, include_str!("../migrations/0001_initial.sql")),
        (2, include_str!("../migrations/0002_host_key_pinning.sql")),
        (3, include_str!("../migrations/0003_whm_connector.sql")),
        (4, include_str!("../migrations/0004_cpanel_connector.sql")),
    ]
}

#[derive(Serialize)]
pub struct RepairResult {
    pub repaired_versions: Vec<i64>,
    pub message: String,
}

/// Repairs a migration-checksum-only mismatch (sqlx's "was previously
/// applied but has been modified" error) — the failure mode behind a real
/// production incident where a release's compiled-in migration bytes
/// drifted from what an earlier install had already recorded as applied.
///
/// Deliberately narrow, on purpose: this never runs any migration SQL,
/// never inserts a row for a migration that never actually ran, and never
/// touches a migration recorded as dirty/failed. It only re-syncs sqlx's
/// own bookkeeping checksum for a migration this exact build recognizes
/// AND that's already recorded as successfully applied — so it can't mask
/// a genuine schema problem, only a byte-level metadata mismatch.
#[tauri::command]
pub async fn repair_migration_checksums<R: Runtime>(app: AppHandle<R>) -> Result<RepairResult, String> {
    // Must match tauri-plugin-sql's own path resolution exactly (app
    // config dir + filename) or this would repair a different file than
    // the one the app actually loads.
    let app_path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let db_path = app_path.join(DB_FILENAME);
    if !db_path.exists() {
        return Err("No local database file found to repair.".into());
    }

    let url = format!("sqlite:{}", db_path.to_str().ok_or("Invalid database path")?);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let mut repaired_versions = Vec::new();

    for (version, sql) in expected_migrations() {
        let row = sqlx::query("SELECT checksum, success FROM _sqlx_migrations WHERE version = ?")
            .bind(version)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let Some(row) = row else { continue };

        let success: bool = row.try_get("success").map_err(|e| e.to_string())?;
        if !success {
            continue;
        }

        let stored: Vec<u8> = row.try_get("checksum").map_err(|e| e.to_string())?;
        let expected = Sha384::digest(sql.as_bytes()).to_vec();

        if stored != expected {
            sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = ?")
                .bind(&expected)
                .bind(version)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            repaired_versions.push(version);
        }
    }

    pool.close().await;

    let message = if repaired_versions.is_empty() {
        "No checksum mismatches were found — the problem may be something else.".to_string()
    } else {
        format!(
            "Repaired {} migration checksum(s). Restarting…",
            repaired_versions.len()
        )
    };

    Ok(RepairResult { repaired_versions, message })
}
