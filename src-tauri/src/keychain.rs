use keyring::Entry;

const SERVICE: &str = "com.syntrok.infranet";

#[tauri::command]
pub fn keychain_set(credential_id: String, secret: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &credential_id).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_get(credential_id: String) -> Result<String, String> {
    let entry = Entry::new(SERVICE, &credential_id).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_delete(credential_id: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &credential_id).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}
