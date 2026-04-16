use crate::{
    models::{
        DiscordOAuthState, DiscordOAuthTokenResponse, DiscordRpcAuthenticateData,
        DiscordUserInfo, DiscordVoiceInfo, DiscordVoiceMember, OAuthCallbackQuery,
        RpcDiscordUser, RpcPan, RpcSelectedVoiceChannel, RpcVoiceStateEntry, StoredToken,
    },
    state::{DISCORD_CACHE, DISCORD_OAUTH, DISCORD_VOICE_CACHE},
    token::{check_token, save_token},
};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use reqwest::Client;
use serde_json::{json, Value};
use std::{
    env,
    process::Command,
    sync::{Arc, RwLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use urlencoding::encode;

pub fn make_oauth_state() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{now}", std::process::id())
}

pub fn discord_redirect_uri() -> String {
    env::var("DISCORD_REDIRECT_URI").unwrap_or_else(|_| {
        "http://127.0.0.1:3000/api/v1/discord/oauth/callback".to_string()
    })
}

pub fn discord_authorize_url(state: &str) -> String {
    let client_id = env::var("DISCORD_CLIENT_ID").unwrap_or_default();
    let redirect_uri = discord_redirect_uri();
    let scope = "identify messages.read rpc rpc.voice.read rpc.voice.write rpc.video.read rpc.video.write rpc.activities.write rpc.screenshare.read rpc.screenshare.write rpc.notifications.read";

    format!(
        "https://discord.com/oauth2/authorize?response_type=code&client_id={}&state={}&prompt=consent&redirect_uri={}&scope={}",
        encode(&client_id),
        encode(state),
        encode(&redirect_uri),
        encode(scope),
    )
}

pub async fn discord_oauth_start() -> impl axum::response::IntoResponse {
    let state = make_oauth_state();

    if let Ok(mut guard) = DISCORD_OAUTH.write() {
        guard.state = Some(state.clone());
        guard.last_error = None;
    }

    axum::response::Redirect::temporary(&discord_authorize_url(&state))
}

pub async fn discord_oauth_callback(
    axum::extract::Query(query): axum::extract::Query<OAuthCallbackQuery>,
) -> impl axum::response::IntoResponse {
    if let Some(err) = query.error {
        let desc = query.error_description.unwrap_or_default();
        if let Ok(mut guard) = DISCORD_OAUTH.write() {
            guard.last_error = Some(format!("{err}: {desc}"));
        }
        return (axum::http::StatusCode::BAD_REQUEST, format!("OAuth error: {err} {desc}"));
    }

    let code = match query.code {
        Some(code) => code,
        None => return (axum::http::StatusCode::BAD_REQUEST, "missing code".to_string()),
    };

    let returned_state = query.state.unwrap_or_default();
    let expected_state = DISCORD_OAUTH
        .read()
        .ok()
        .and_then(|g| g.state.clone())
        .unwrap_or_default();

    if returned_state != expected_state {
        return (axum::http::StatusCode::BAD_REQUEST, "state mismatch".to_string());
    }

    let client_id = match env::var("DISCORD_CLIENT_ID") {
        Ok(v) => v,
        Err(_) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "missing DISCORD_CLIENT_ID".to_string(),
            )
        }
    };

    let client_secret = match env::var("DISCORD_CLIENT_SECRET") {
        Ok(v) => v,
        Err(_) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "missing DISCORD_CLIENT_SECRET".to_string(),
            )
        }
    };

    let redirect_uri = discord_redirect_uri();

    let http = Client::new();
    let resp = http
        .post("https://discord.com/api/oauth2/token")
        .basic_auth(client_id, Some(client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            if let Ok(mut guard) = DISCORD_OAUTH.write() {
                guard.last_error = Some(format!("token request failed: {e:?}"));
            }
            return (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("token request failed: {e:?}"),
            );
        }
    };

    let resp = match resp.error_for_status() {
        Ok(r) => r,
        Err(e) => {
            if let Ok(mut guard) = DISCORD_OAUTH.write() {
                guard.last_error = Some(format!("token status failed: {e:?}"));
            }
            return (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("token status failed: {e:?}"),
            );
        }
    };

    let token: DiscordOAuthTokenResponse = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            if let Ok(mut guard) = DISCORD_OAUTH.write() {
                guard.last_error = Some(format!("token parse failed: {e:?}"));
            }
            return (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("token parse failed: {e:?}"),
            );
        }
    };

    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + token.expires_in;

    let stored = StoredToken {
        access_token: token.access_token.clone(),
        refresh_token: token.refresh_token.clone(),
        expires_at,
    };

    save_token(&stored);

    if let Ok(mut guard) = DISCORD_OAUTH.write() {
        guard.access_token = Some(token.access_token);
        guard.refresh_token = Some(token.refresh_token);
        guard.expires_at = Some(expires_at);
        guard.scope = Some(token.scope);
        guard.last_error = None;
    }

    (
        axum::http::StatusCode::OK,
        "Discord OAuth completed. You can close this tab.".to_string(),
    )
}

pub fn open_browser(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", "", url]).spawn()?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn()?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

pub fn spawn_discord_listener(
    cache: Arc<RwLock<crate::models::DiscordInfo>>,
    voice_cache: Arc<RwLock<DiscordVoiceInfo>>,
    _oauth_state: Arc<RwLock<DiscordOAuthState>>,
    client_id: String,
) {
    loop {
        let rt = tokio::runtime::Runtime::new().unwrap();

        let access_token = loop {
            if let Some(token) = rt.block_on(check_token()) {
                break token;
            }
            println!("Waiting for OAuth...");
            thread::sleep(Duration::from_secs(2));
        };

        let mut ipc = DiscordIpcClient::new(&client_id);

        if ipc.connect().is_err() {
            if let Ok(mut guard) = cache.write() {
                guard.connected = false;
                guard.last_event = Some("connect_error".to_string());
            }
            thread::sleep(Duration::from_secs(2));
            continue;
        }

        if let Ok(mut guard) = cache.write() {
            guard.connected = true;
            guard.last_event = Some("connected".to_string());
        }

        let auth = rpc_request::<DiscordRpcAuthenticateData>(
            &mut ipc,
            "AUTHENTICATE",
            Some(json!({ "access_token": access_token })),
        );

        let Some(auth) = auth else {
            if let Ok(mut guard) = cache.write() {
                guard.connected = false;
                guard.last_event = Some("authenticate_failed".to_string());
            }
            let _ = ipc.close();
            thread::sleep(Duration::from_secs(2));
            continue;
        };

        if let Ok(mut guard) = cache.write() {
            guard.connected = true;
            guard.user = Some(auth.user);
            guard.scopes = auth.scopes;
            guard.last_event = Some("AUTHENTICATE".to_string());
        }

        // VOICE_CHANNEL_SELECT はグローバルなのでチャンネルIDなしでSUBSCRIBE可能
        let _ = rpc_subscribe(&mut ipc, "VOICE_CHANNEL_SELECT", None);

        // 初回スナップショット取得（チャンネルに居る場合はここでVOICE_STATE_*もSUBSCRIBEされる）
        refresh_selected_voice_snapshot(&mut ipc, &voice_cache);

        loop {
            match ipc.recv() {
                Ok((_, msg)) => {
                    let evt = msg
                        .get("evt")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();

                    handle_discord_message(&cache, msg.clone());
                    println!("event: {}", evt);

                    match evt.as_str() {
                        "VOICE_CHANNEL_SELECT" => {
                            // チャンネルが切り替わったらスナップショットを再取得し、
                            // 新チャンネルに対して VOICE_STATE_* を再SUBSCRIBE する
                            refresh_selected_voice_snapshot(&mut ipc, &voice_cache);
                        }
                        "VOICE_STATE_CREATE"
                        | "VOICE_STATE_UPDATE"
                        | "VOICE_STATE_DELETE" => {
                            // メンバー変化はスナップショットで一括更新
                            refresh_selected_voice_snapshot(&mut ipc, &voice_cache);
                        }
                        _ => {}
                    }
                }
                Err(e) => {
                    eprintln!("Discord recv failed: {e:?}");
                    if let Ok(mut guard) = cache.write() {
                        guard.connected = false;
                        guard.last_event = Some(format!("recv_error: {e:?}"));
                    }
                    break;
                }
            }
        }

        let _ = ipc.close();
        thread::sleep(Duration::from_secs(2));
    }
}

fn handle_discord_message(cache: &Arc<RwLock<crate::models::DiscordInfo>>, msg: Value) {
    let cmd = msg.get("cmd").and_then(|v| v.as_str()).unwrap_or_default();
    let evt = msg.get("evt").and_then(|v| v.as_str()).unwrap_or_default();
    let data = msg.get("data").cloned().unwrap_or(Value::Null);

    if cmd != "DISPATCH" {
        return;
    }

    if let Ok(mut guard) = cache.write() {
        guard.last_event = Some(evt.to_string());

        match evt {
            "READY" | "CURRENT_USER_UPDATE" => {
                let user = data.get("user").unwrap_or(&data);
                guard.user = Some(DiscordUserInfo {
                    id: user
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    username: user
                        .get("username")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    discriminator: user
                        .get("discriminator")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    global_name: user
                        .get("global_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    avatar: user
                        .get("avatar")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                });
            }
            _ => {}
        }
    }
}

/// 通常のRPCリクエスト（AUTHENTICATE, GET_SELECTED_VOICE_CHANNEL など）
///
/// ペイロード構造:
/// { "cmd": cmd, "args": args, "nonce": nonce }
fn rpc_request<T: for<'de> serde::Deserialize<'de>>(
    client: &mut DiscordIpcClient,
    cmd: &str,
    args: Option<Value>,
) -> Option<T> {
    let nonce = make_nonce();

    let mut payload = json!({
        "cmd": cmd,
        "nonce": nonce,
        "args": args.unwrap_or(json!({})),
    });

    client.send(payload, 1).ok()?;

    // タイムアウト付きで自分のnonceを持つ応答を待つ
    // 無関係なDISPATCHイベントが来てもスキップする
    for _ in 0..30 {
        let (_, msg) = client.recv().ok()?;
        if msg.get("nonce").and_then(|v| v.as_str()) == Some(nonce.as_str()) {
            let data = msg.get("data")?.clone();
            return serde_json::from_value::<T>(data).ok();
        }
    }

    None
}

/// SUBSCRIBEリクエスト専用関数
///
/// SUBSCRIBEのペイロード構造はRPCリクエストと異なり、
/// `evt` はトップレベルに置く必要がある:
/// { "cmd": "SUBSCRIBE", "evt": evt, "args": args, "nonce": nonce }
///
/// VOICE_STATE_CREATE / UPDATE / DELETE には必ず
/// args に channel_id を渡すこと（ないとイベントが来ない）。
fn rpc_subscribe(
    client: &mut DiscordIpcClient,
    evt: &str,
    args: Option<Value>,
) -> Option<Value> {
    let nonce = make_nonce();

    let payload = json!({
        "cmd": "SUBSCRIBE",
        "evt": evt,
        "args": args.unwrap_or(json!({})),
        "nonce": nonce,
    });

    client.send(payload, 1).ok()?;

    for _ in 0..30 {
        let (_, msg) = client.recv().ok()?;
        if msg.get("nonce").and_then(|v| v.as_str()) == Some(nonce.as_str()) {
            return msg.get("data").cloned();
        }
    }

    None
}

fn make_nonce() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    )
}

fn refresh_selected_voice_snapshot(
    client: &mut DiscordIpcClient,
    voice_cache: &Arc<RwLock<DiscordVoiceInfo>>,
) {
    let selected: Option<RpcSelectedVoiceChannel> =
        rpc_request(client, "GET_SELECTED_VOICE_CHANNEL", None);

    println!(
        "selected voice channel = {:?}",
        selected.as_ref().map(|c| &c.id)
    );

    let Some(channel) = selected else {
        if let Ok(mut guard) = voice_cache.write() {
            *guard = DiscordVoiceInfo::default();
        }
        return;
    };

    let channel_id = channel.id.clone();

    // チャンネルが確定してから VOICE_STATE_* をそのチャンネルIDでSUBSCRIBE
    // （すでにSUBSCRIBE済みでも重複SUBSCRIBEはDiscordが無視するので安全）
    for evt in &["VOICE_STATE_CREATE", "VOICE_STATE_UPDATE", "VOICE_STATE_DELETE"] {
        let result = rpc_subscribe(
            client,
            evt,
            Some(json!({ "channel_id": channel_id })),
        );
        if result.is_none() {
            eprintln!("SUBSCRIBE {evt} failed for channel {channel_id}");
        }
    }

    let members = channel
        .voice_states
        .unwrap_or_default()
        .into_iter()
        .map(|v| DiscordVoiceMember {
            user_id: v.user.id,
            username: v.user.username,
            discriminator: v.user.discriminator,
            avatar: v.user.avatar,
            bot: v.user.bot.unwrap_or(false),
            nick: v.nick,
            mute: v.mute.unwrap_or(v.voice_state.mute),
            deaf: v.voice_state.deaf,
            self_mute: v.voice_state.self_mute,
            self_deaf: v.voice_state.self_deaf,
            suppress: v.voice_state.suppress,
            volume: v.volume,
            pan_left: v.pan.as_ref().map(|p| p.left),
            pan_right: v.pan.as_ref().map(|p| p.right),
        })
        .collect();

    if let Ok(mut guard) = voice_cache.write() {
        *guard = DiscordVoiceInfo {
            selected_channel_id: Some(channel_id),
            selected_channel_name: Some(channel.name),
            guild_id: channel.guild_id,
            channel_type: Some(channel.channel_type),
            members,
        };
    }
}