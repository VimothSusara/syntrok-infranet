mod cpanel;
mod keychain;
mod ssh;
mod whm;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "host_key_pinning",
            sql: include_str!("../migrations/0002_host_key_pinning.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "whm_connector",
            sql: include_str!("../migrations/0003_whm_connector.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "cpanel_connector",
            sql: include_str!("../migrations/0004_cpanel_connector.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:infranet.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            ssh::ssh_exec,
            ssh::ssh_discover,
            whm::whm_call,
            cpanel::cpanel_call,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
