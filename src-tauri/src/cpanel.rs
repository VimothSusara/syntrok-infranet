use std::collections::HashMap;
use std::time::Duration;

#[tauri::command]
pub async fn cpanel_call(
    host: String,
    port: u16,
    username: String,
    api_token: String,
    module: String,
    function: String,
    params: HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(format!("https://{host}:{port}/execute/{module}/{function}"))
        .query(&params)
        .header("Authorization", format!("cpanel {username}:{api_token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    serde_json::from_str(&body).map_err(|_| {
        format!(
            "cPanel returned a non-JSON response (HTTP {status}): {}",
            body.chars().take(200).collect::<String>()
        )
    })
}
