use async_trait::async_trait;
use russh::client::{self, Msg};
use russh::keys::decode_secret_key;
use russh::keys::key::PublicKey;
use russh::{Channel, ChannelMsg};
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct ClientHandler {
    expected_fingerprint: Option<String>,
    observed_fingerprint: Arc<Mutex<Option<String>>>,
    mismatch: Arc<Mutex<bool>>,
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint();
        *self.observed_fingerprint.lock().unwrap() = Some(fingerprint.clone());

        match &self.expected_fingerprint {
            // First time we've ever connected to this saved connection — trust
            // and pin. Any later mismatch against this pinned value is rejected.
            None => Ok(true),
            Some(expected) if expected == &fingerprint => Ok(true),
            Some(_) => {
                *self.mismatch.lock().unwrap() = true;
                Ok(false)
            }
        }
    }
}

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_status: u32,
    pub host_fingerprint: String,
}

#[derive(serde::Deserialize)]
struct PrivateKeySecret {
    key: String,
    #[serde(default)]
    passphrase: String,
}

async fn open_session(
    host: &str,
    port: u16,
    username: &str,
    auth_kind: &str,
    secret: &str,
    known_host_fingerprint: Option<String>,
) -> Result<(client::Handle<ClientHandler>, String), String> {
    let config = Arc::new(client::Config::default());

    let observed_fingerprint = Arc::new(Mutex::new(None));
    let mismatch = Arc::new(Mutex::new(false));
    let handler = ClientHandler {
        expected_fingerprint: known_host_fingerprint,
        observed_fingerprint: observed_fingerprint.clone(),
        mismatch: mismatch.clone(),
    };

    let connect_result = tokio::time::timeout(
        Duration::from_secs(10),
        client::connect(config, (host, port), handler),
    )
    .await
    .map_err(|_| format!("Timed out connecting to {host}:{port}"))?;

    let mut session = connect_result.map_err(|e| {
        if *mismatch.lock().unwrap() {
            "Host key does not match the key saved for this connection. The \
             server may have been reinstalled or rekeyed, or this could be a \
             man-in-the-middle attempt — verify the new key out-of-band before \
             trusting it again."
                .to_string()
        } else {
            e.to_string()
        }
    })?;

    let fingerprint = observed_fingerprint.lock().unwrap().clone().unwrap_or_default();

    let authenticated = match auth_kind {
        "ssh_private_key" => {
            // New credentials store {"key": "...", "passphrase": "..."} as JSON.
            // Credentials created before passphrase support stored the raw key
            // string directly — fall back to treating the whole secret as an
            // unencrypted key so existing connections keep working unchanged.
            let (key_content, passphrase) = match serde_json::from_str::<PrivateKeySecret>(secret)
            {
                Ok(parsed) => {
                    let pass = if parsed.passphrase.is_empty() {
                        None
                    } else {
                        Some(parsed.passphrase)
                    };
                    (parsed.key, pass)
                }
                Err(_) => (secret.to_string(), None),
            };

            let key_pair = decode_secret_key(&key_content, passphrase.as_deref())
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

    Ok((session, fingerprint))
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
        host_fingerprint: String::new(),
    })
}

#[tauri::command]
pub async fn ssh_exec(
    host: String,
    port: u16,
    username: String,
    credential_kind: String,
    secret: String,
    known_host_fingerprint: Option<String>,
    command: String,
) -> Result<ExecResult, String> {
    let (session, fingerprint) = open_session(
        &host,
        port,
        &username,
        &credential_kind,
        &secret,
        known_host_fingerprint,
    )
    .await?;
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    let result = run_command(&mut channel, &command).await?;
    Ok(ExecResult {
        host_fingerprint: fingerprint,
        ..result
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    pub systemd: bool,
    pub docker: bool,
    pub podman: bool,
    pub passwordless_sudo: bool,
    pub host_fingerprint: String,
}

#[tauri::command]
pub async fn ssh_discover(
    host: String,
    port: u16,
    username: String,
    credential_kind: String,
    secret: String,
    known_host_fingerprint: Option<String>,
) -> Result<DiscoveryResult, String> {
    let (session, fingerprint) = open_session(
        &host,
        port,
        &username,
        &credential_kind,
        &secret,
        known_host_fingerprint,
    )
    .await?;

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
        host_fingerprint: fingerprint,
    })
}
