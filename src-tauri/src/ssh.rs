use async_trait::async_trait;
use russh::client::{self, Msg};
use russh::keys::decode_secret_key;
use russh::keys::key::PublicKey;
use russh::{Channel, ChannelMsg};
use std::sync::Arc;
use std::time::Duration;

struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // V1: accept-on-first-connect. See the host-key pinning note in the
        // architecture plan before this is used against anything but your own
        // test servers.
        Ok(true)
    }
}

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_status: u32,
}

async fn open_session(
    host: &str,
    port: u16,
    username: &str,
    auth_kind: &str,
    secret: &str,
) -> Result<client::Handle<ClientHandler>, String> {
    let config = Arc::new(client::Config::default());

    let connect_result = tokio::time::timeout(
        Duration::from_secs(10),
        client::connect(config, (host, port), ClientHandler),
    )
    .await
    .map_err(|_| format!("Timed out connecting to {host}:{port}"))?;

    let mut session = connect_result.map_err(|e| e.to_string())?;

    let authenticated = match auth_kind {
        "ssh_private_key" => {
            let key_pair = decode_secret_key(secret, None)
                .map_err(|e| format!("Could not read private key: {e}"))?;
            session
                .authenticate_publickey(username, Arc::new(key_pair))
                .await
                .map_err(|e| e.to_string())?
        }
        _ => session
            .authenticate_password(username, secret)
            .await
            .map_err(|e| e.to_string())?,
    };

    if !authenticated {
        return Err("Authentication failed".into());
    }

    Ok(session)
}

async fn run_command(channel: &mut Channel<Msg>, command: &str) -> Result<ExecResult, String> {
    channel
        .exec(true, command)
        .await
        .map_err(|e| e.to_string())?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status = 0u32;

    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
            ChannelMsg::ExtendedData { data, .. } => stderr.extend_from_slice(&data),
            ChannelMsg::ExitStatus { exit_status: s } => exit_status = s,
            _ => {}
        }
    }

    Ok(ExecResult {
        stdout: String::from_utf8_lossy(&stdout).to_string(),
        stderr: String::from_utf8_lossy(&stderr).to_string(),
        exit_status,
    })
}

#[tauri::command]
pub async fn ssh_exec(
    host: String,
    port: u16,
    username: String,
    credential_kind: String,
    secret: String,
    command: String,
) -> Result<ExecResult, String> {
    let session = open_session(&host, port, &username, &credential_kind, &secret).await?;
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    run_command(&mut channel, &command).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    pub systemd: bool,
    pub docker: bool,
    pub podman: bool,
    pub passwordless_sudo: bool,
}

#[tauri::command]
pub async fn ssh_discover(
    host: String,
    port: u16,
    username: String,
    credential_kind: String,
    secret: String,
) -> Result<DiscoveryResult, String> {
    let session = open_session(&host, port, &username, &credential_kind, &secret).await?;

    let check = |name: &'static str| {
        let command = format!("command -v {name} >/dev/null 2>&1 && echo yes || echo no");
        (name, command)
    };

    let checks: [(&'static str, String); 4] = [
        check("systemctl"),
        check("docker"),
        check("podman"),
        (
            "passwordless_sudo",
            "sudo -n true 2>/dev/null && echo yes || echo no".to_string(),
        ),
    ];

    let mut results = std::collections::HashMap::new();
    for (name, command) in checks {
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;
        let result = run_command(&mut channel, &command).await?;
        results.insert(name, result.stdout.trim() == "yes");
    }

    Ok(DiscoveryResult {
        systemd: *results.get("systemctl").unwrap_or(&false),
        docker: *results.get("docker").unwrap_or(&false),
        podman: *results.get("podman").unwrap_or(&false),
        passwordless_sudo: *results.get("passwordless_sudo").unwrap_or(&false),
    })
}
