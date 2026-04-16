use crate::{
    models::{DiscordInfo, DiscordUserInfo, MouseInfo, ProcessItem, SensorInfo, Snapshot},
    snapshot::read_snapshot,
    state::{AppState, DISCORD_CACHE, DISCORD_VOICE_CACHE},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::Value;
use windows::Win32::Foundation::POINT;
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

pub async fn health() -> impl IntoResponse {
    "ok"
}

pub async fn all_state(State(state): State<AppState>) -> Json<Snapshot> {
    Json(read_snapshot(&state))
}

pub async fn summary_state(State(state): State<AppState>) -> Json<crate::models::SummaryInfo> {
    Json(read_snapshot(&state).summary)
}

pub async fn system_state(State(state): State<AppState>) -> Json<crate::models::SystemInfo> {
    Json(read_snapshot(&state).system)
}

pub async fn cpu_state(State(state): State<AppState>) -> Json<crate::models::CpuInfo> {
    Json(read_snapshot(&state).cpu)
}

pub async fn cpu_cores_state(State(state): State<AppState>) -> Json<Vec<crate::models::CpuCoreInfo>> {
    Json(read_snapshot(&state).cpu.cores)
}

pub async fn memory_state(State(state): State<AppState>) -> Json<crate::models::MemoryInfo> {
    Json(read_snapshot(&state).memory)
}

pub async fn memory_modules_state(
    State(state): State<AppState>,
) -> Json<Vec<crate::models::MemoryModuleInfo>> {
    Json(read_snapshot(&state).memory.modules)
}

pub async fn storage_state(State(state): State<AppState>) -> Json<crate::models::StorageInfo> {
    Json(read_snapshot(&state).storage)
}

pub async fn network_state(State(state): State<AppState>) -> Json<crate::models::NetworkInfo> {
    Json(read_snapshot(&state).network)
}

pub async fn gpu_state(State(state): State<AppState>) -> Json<crate::models::GpuInfo> {
    Json(read_snapshot(&state).gpu)
}

pub async fn battery_state(State(state): State<AppState>) -> Json<crate::models::BatteryInfo> {
    Json(read_snapshot(&state).battery)
}

pub async fn services_state(State(state): State<AppState>) -> Json<crate::models::ServiceInfo> {
    Json(read_snapshot(&state).services)
}

pub async fn processes_state(State(state): State<AppState>) -> Json<crate::models::ProcessInfo> {
    Json(read_snapshot(&state).processes)
}

pub async fn processes_top_state(
    State(state): State<AppState>,
) -> Json<Vec<ProcessItem>> {
    Json(read_snapshot(&state).processes.top)
}

pub async fn process_detail_state(
    Path(pid): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<ProcessItem>, StatusCode> {
    let snap = read_snapshot(&state);
    snap.processes
        .top
        .iter()
        .find(|p| p.pid == pid)
        .cloned()
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn hardware_state(State(state): State<AppState>) -> Json<crate::models::HardwareInfo> {
    Json(read_snapshot(&state).hardware)
}

pub async fn sensors_state(State(state): State<AppState>) -> Json<SensorInfo> {
    Json(read_snapshot(&state).sensors)
}

pub async fn mouse_state() -> Json<MouseInfo> {
    mouse_cursor_state().await
}

pub async fn mouse_cursor_state() -> Json<MouseInfo> {
    let mut pt = POINT::default();
    let ok = unsafe { GetCursorPos(&mut pt).is_ok() };
    if ok {
        Json(MouseInfo { x: pt.x, y: pt.y })
    } else {
        Json(MouseInfo::default())
    }
}

pub async fn discord_state() -> Json<DiscordInfo> {
    DISCORD_CACHE
        .read()
        .map(|g| Json(g.clone()))
        .unwrap_or_else(|_| Json(DiscordInfo::default()))
}

pub async fn discord_user_state() -> Json<Option<DiscordUserInfo>> {
    DISCORD_CACHE
        .read()
        .map(|g| Json(g.user.clone()))
        .unwrap_or_else(|_| Json(None))
}

pub async fn discord_voice_state() -> Json<crate::models::DiscordVoiceInfo> {
    DISCORD_VOICE_CACHE
        .read()
        .map(|g| Json(g.clone()))
        .unwrap_or_else(|_| Json(crate::models::DiscordVoiceInfo::default()))
}

pub async fn discord_voice_members_state() -> Json<Vec<crate::models::DiscordVoiceMember>> {
    DISCORD_VOICE_CACHE
        .read()
        .map(|g| Json(g.members.clone()))
        .unwrap_or_else(|_| Json(Vec::new()))
}

pub async fn category_state(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let snap = read_snapshot(&state);
    let value = match name.as_str() {
        "summary" => serde_json::to_value(snap.summary).ok(),
        "system" => serde_json::to_value(snap.system).ok(),
        "cpu" => serde_json::to_value(snap.cpu).ok(),
        "memory" => serde_json::to_value(snap.memory).ok(),
        "storage" => serde_json::to_value(snap.storage).ok(),
        "network" => serde_json::to_value(snap.network).ok(),
        "hardware" => serde_json::to_value(snap.hardware).ok(),
        "gpu" => serde_json::to_value(snap.gpu).ok(),
        "battery" => serde_json::to_value(snap.battery).ok(),
        "services" => serde_json::to_value(snap.services).ok(),
        "processes" => serde_json::to_value(snap.processes).ok(),
        "sensors" => serde_json::to_value(snap.sensors).ok(),
        _ => None,
    };
    value.map(Json).ok_or(StatusCode::NOT_FOUND)
}