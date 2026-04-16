// src/token.rs
use crate::models::{DiscordOAuthTokenResponse, StoredToken};
use std::time::{SystemTime, UNIX_EPOCH};

const TOKEN_FILE: &str = "discord_token.json";

pub fn save_token(token: &StoredToken) {
    if let Ok(json) = serde_json::to_string_pretty(token) {
        let _ = std::fs::write(TOKEN_FILE, json);
    }
}

pub fn load_token() -> Option<StoredToken> {
    let data = std::fs::read_to_string(TOKEN_FILE).ok()?;
    serde_json::from_str(&data).ok()
}

pub async fn refresh_access_token(refresh_token: &str) -> Option<StoredToken> {
    let client_id = std::env::var("DISCORD_CLIENT_ID").ok()?;
    let client_secret = std::env::var("DISCORD_CLIENT_SECRET").ok()?;

    let http = reqwest::Client::new();

    let resp = http
        .post("https://discord.com/api/oauth2/token")
        .basic_auth(client_id, Some(client_secret))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;

    let token: DiscordOAuthTokenResponse = resp.json().await.ok()?;

    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs()
        + token.expires_in;

    Some(StoredToken {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at,
    })
}

pub async fn check_token() -> Option<String> {
    let mut token = load_token()?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();

    if now + 60 >= token.expires_at {

        if let Some(new_token) = refresh_access_token(&token.refresh_token).await {
            save_token(&new_token);
            token = new_token;
        } else {
            println!("Token refresh failed");
            return None;
        }
    }

    Some(token.access_token)
}