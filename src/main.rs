#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod discord;
mod handlers;
mod models;
mod snapshot;
mod state;
mod token;

use axum::{routing::get, Router};
use std::{env, net::SocketAddr, sync::{Arc, Mutex}, thread, time::{Duration, SystemTime, UNIX_EPOCH, Instant}};

use crate::{
    discord::{discord_oauth_callback, discord_oauth_start, spawn_discord_listener,open_browser},
    handlers::*,
    snapshot::build_snapshot,
    state::{AppState, DISCORD_CACHE, DISCORD_OAUTH, DISCORD_VOICE_CACHE},
    token::{load_token},
};

fn main() {
    dotenvy::dotenv().ok();

    let discord_cache = Arc::clone(&DISCORD_CACHE);
    let voice_cache = Arc::clone(&DISCORD_VOICE_CACHE);
    let oauth_state = Arc::clone(&DISCORD_OAUTH);

    let client_id =
        env::var("DISCORD_CLIENT_ID").unwrap_or_else(|_| "YOUR_DISCORD_CLIENT_ID".to_string());

    thread::spawn(move || {
        spawn_discord_listener(discord_cache, voice_cache, oauth_state, client_id);
    });

    let snapshot = Arc::new(Mutex::new(crate::state::CachedSnapshot {
        snapshot: build_snapshot(),
        fetched_at: Instant::now(),
    }));

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/state", get(all_state))
        .route("/api/v1/category/{name}", get(category_state))
        .route("/api/v1/summary", get(summary_state))
        .route("/api/v1/system", get(system_state))
        .route("/api/v1/cpu", get(cpu_state))
        .route("/api/v1/cpu/cores", get(cpu_cores_state))
        .route("/api/v1/memory", get(memory_state))
        .route("/api/v1/memory/modules", get(memory_modules_state))
        .route("/api/v1/storage", get(storage_state))
        .route("/api/v1/network", get(network_state))
        .route("/api/v1/gpu", get(gpu_state))
        .route("/api/v1/battery", get(battery_state))
        .route("/api/v1/services", get(services_state))
        .route("/api/v1/processes", get(processes_state))
        .route("/api/v1/processes/top", get(processes_top_state))
        .route("/api/v1/processes/{pid}", get(process_detail_state))
        .route("/api/v1/hardware", get(hardware_state))
        .route("/api/v1/sensors", get(sensors_state))
        .route("/api/v1/mouse", get(mouse_state))
        .route("/api/v1/mouse/cursor", get(mouse_cursor_state))
        .route("/api/v1/discord", get(discord_state))
        .route("/api/v1/discord/user", get(discord_user_state))
        .route("/api/v1/discord/voice", get(discord_voice_state))
        .route("/api/v1/discord/voice/members", get(discord_voice_members_state))
        .route("/api/v1/discord/oauth/start", get(discord_oauth_start))
        .route("/api/v1/discord/oauth/callback", get(discord_oauth_callback))
        .with_state(AppState { snapshot });

    let addr: SocketAddr = "0.0.0.0:3000".parse().unwrap();

    thread::spawn(|| {
        thread::sleep(Duration::from_secs(1));

        let open = match load_token() {
            Some(token) => {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs();

                now + 60 >= token.expires_at
            }
            None => true,
        };

        if open {
            let _ = open_browser("http://127.0.0.1:3000/api/v1/discord/oauth/start");
        }
    });

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async move {
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });
}