// src/state.rs
use crate::models::*;
use once_cell::sync::Lazy;
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub snapshot: Arc<RwLock<Snapshot>>,
}

pub static DISCORD_CACHE: Lazy<Arc<RwLock<DiscordInfo>>> =
    Lazy::new(|| Arc::new(RwLock::new(DiscordInfo::default())));

pub static DISCORD_OAUTH: Lazy<Arc<RwLock<DiscordOAuthState>>> =
    Lazy::new(|| Arc::new(RwLock::new(DiscordOAuthState::default())));

pub static DISCORD_VOICE_CACHE: Lazy<Arc<RwLock<DiscordVoiceInfo>>> =
    Lazy::new(|| Arc::new(RwLock::new(DiscordVoiceInfo::default())));