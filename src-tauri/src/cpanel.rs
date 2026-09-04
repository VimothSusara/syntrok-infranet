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

// cPanel API 2 ("cpanel_jsonapi") — a distinct, older calling convention
// still used internally by cPanel's own File Manager UI for some Fileman
// operations (confirmed via a real captured request: op=trash) that UAPI's
// documented Fileman::trash_file either doesn't cover or behaves
// differently for. Different endpoint (/json-api/cpanel, not
// /execute/{module}/{function}), different query-param shape
// (cpanel_jsonapi_module/func/apiversion instead of a path), and a
// different response envelope ({cpanelresult: {...}}) — kept as a
// separate command rather than folded into cpanel_call above. Same
// `Authorization: cpanel user:token` header works across both API
// generations.
#[tauri::command]
pub async fn cpanel_call_legacy(
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

    let mut query: Vec<(String, String)> = vec![
        ("cpanel_jsonapi_apiversion".to_string(), "2".to_string()),
        ("cpanel_jsonapi_module".to_string(), module),
        ("cpanel_jsonapi_func".to_string(), function),
    ];
    query.extend(params);

    let response = client
        .get(format!("https://{host}:{port}/json-api/cpanel"))
        .query(&query)
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
