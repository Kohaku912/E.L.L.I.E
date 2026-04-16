use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Serialize, Default)]
pub struct Snapshot {
    pub summary: SummaryInfo,
    pub system: SystemInfo,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub storage: StorageInfo,
    pub network: NetworkInfo,
    pub hardware: HardwareInfo,
    pub gpu: GpuInfo,
    pub battery: BatteryInfo,
    pub services: ServiceInfo,
    pub processes: ProcessInfo,
    pub sensors: SensorInfo,
    pub mouse: MouseInfo,
    pub discord: DiscordInfo,
    pub discord_voice: DiscordVoiceInfo,
}

#[derive(Clone, Serialize, Default)]
pub struct SummaryInfo {
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub kernel_version: Option<String>,
    pub cpu_arch: Option<String>,
    pub computer_name: Option<String>,
    pub model: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct SystemInfo {
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub kernel_version: Option<String>,
    pub cpu_arch: Option<String>,
    pub computer_system: Vec<ComputerSystemInfo>,
    pub bios: Vec<BiosInfo>,
    pub baseboard: Vec<BaseboardInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct CpuInfo {
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    pub global_usage: f32,
    pub cores: Vec<CpuCoreInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct CpuCoreInfo {
    pub name: String,
    pub brand: String,
    pub vendor_id: String,
    pub usage: f32,
    pub frequency_mhz: u64,
}

#[derive(Clone, Serialize, Default)]
pub struct MemoryInfo {
    pub total_memory: u64,
    pub used_memory: u64,
    pub free_memory: u64,
    pub available_memory: u64,
    pub total_swap: u64,
    pub used_swap: u64,
    pub free_swap: u64,
    pub modules: Vec<MemoryModuleInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct StorageInfo {
    pub disks: Vec<DiskInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total_space: u64,
    pub available_space: u64,
    pub removable: bool,
    pub read_only: bool,
}

#[derive(Clone, Serialize, Default)]
pub struct NetworkInfo {
    pub interfaces: Vec<NetworkInterfaceInfo>,
    pub adapters: Vec<NetworkAdapterInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct NetworkInterfaceInfo {
    pub interface: String,
    pub mac_address: String,
    pub total_received: u64,
    pub total_transmitted: u64,
    pub total_packets_received: u64,
    pub total_packets_transmitted: u64,
}

#[derive(Clone, Serialize, Default)]
pub struct NetworkAdapterInfo {
    pub name: Option<String>,
    pub mac_address: Option<String>,
    pub net_connection_status: Option<u16>,
    pub speed: Option<String>,
    pub physical_adapter: Option<bool>,
    pub adapter_type: Option<String>,
    pub manufacturer: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct HardwareInfo {
    pub bios: Vec<BiosInfo>,
    pub baseboard: Vec<BaseboardInfo>,
    pub computer_system: Vec<ComputerSystemInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct GpuInfo {
    pub controllers: Vec<GpuControllerInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct BatteryInfo {
    pub batteries: Vec<BatteryDeviceInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct ServiceInfo {
    pub services: Vec<ServiceDeviceInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct ProcessInfo {
    pub top: Vec<ProcessItem>,
}

#[derive(Clone, Serialize, Default)]
pub struct SensorInfo {
    pub components: Vec<ComponentInfo>,
}

#[derive(Clone, Serialize, Default)]
pub struct ComputerSystemInfo {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub username: Option<String>,
    pub domain: Option<String>,
    pub total_physical_memory: Option<u64>,
    pub number_of_logical_processors: Option<u32>,
    pub number_of_processors: Option<u32>,
}

#[derive(Clone, Serialize, Default)]
pub struct BiosInfo {
    pub manufacturer: Option<String>,
    pub smbios_bios_version: Option<String>,
    pub serial_number: Option<String>,
    pub release_date: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct BaseboardInfo {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct MemoryModuleInfo {
    pub capacity: Option<u64>,
    pub speed: Option<u32>,
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
    pub serial_number: Option<String>,
    pub form_factor: Option<u16>,
    pub memory_type: Option<u16>,
}

#[derive(Clone, Serialize, Default)]
pub struct GpuControllerInfo {
    pub name: Option<String>,
    pub driver_version: Option<String>,
    pub adapter_ram: Option<u64>,
    pub current_horizontal_resolution: Option<u32>,
    pub current_vertical_resolution: Option<u32>,
    pub current_refresh_rate: Option<u32>,
    pub video_mode_description: Option<String>,
    pub status: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct BatteryDeviceInfo {
    pub name: Option<String>,
    pub battery_status: Option<u16>,
    pub estimated_charge_remaining: Option<u16>,
    pub estimated_run_time: Option<u32>,
    pub design_voltage: Option<u32>,
}

#[derive(Clone, Serialize, Default)]
pub struct ServiceDeviceInfo {
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub state: Option<String>,
    pub start_mode: Option<String>,
    pub process_id: Option<u32>,
    pub service_type: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct ProcessItem {
    pub pid: String,
    pub name: String,
    pub exe: Option<String>,
    pub cmd: Vec<String>,
    pub cwd: Option<String>,
    pub parent: Option<String>,
    pub status: String,
    pub cpu_usage: f32,
    pub memory: u64,
    pub disk_read: u64,
    pub disk_written: u64,
}

#[derive(Clone, Serialize, Default)]
pub struct ComponentInfo {
    pub label: String,
    pub temperature: Option<f32>,
    pub max: Option<f32>,
    pub critical: Option<f32>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_OperatingSystem")]
#[serde(rename_all = "PascalCase")]
pub struct Win32OperatingSystem {
    pub caption: Option<String>,
    pub version: Option<String>,
    pub build_number: Option<String>,
    pub os_architecture: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_ComputerSystem")]
#[serde(rename_all = "PascalCase")]
pub struct Win32ComputerSystem {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub username: Option<String>,
    pub domain: Option<String>,
    pub total_physical_memory: Option<u64>,
    pub number_of_logical_processors: Option<u32>,
    pub number_of_processors: Option<u32>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_BIOS")]
#[serde(rename_all = "PascalCase")]
pub struct Win32Bios {
    pub manufacturer: Option<String>,
    pub smbios_bios_version: Option<String>,
    pub serial_number: Option<String>,
    pub release_date: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_BaseBoard")]
#[serde(rename_all = "PascalCase")]
pub struct Win32BaseBoard {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_PhysicalMemory")]
#[serde(rename_all = "PascalCase")]
pub struct Win32PhysicalMemory {
    pub capacity: Option<u64>,
    pub speed: Option<u32>,
    pub manufacturer: Option<String>,
    pub part_number: Option<String>,
    pub serial_number: Option<String>,
    pub form_factor: Option<u16>,
    pub memory_type: Option<u16>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_VideoController")]
#[serde(rename_all = "PascalCase")]
pub struct Win32VideoController {
    pub name: Option<String>,
    pub driver_version: Option<String>,
    pub adapter_ram: Option<u64>,
    pub current_horizontal_resolution: Option<u32>,
    pub current_vertical_resolution: Option<u32>,
    pub current_refresh_rate: Option<u32>,
    pub video_mode_description: Option<String>,
    pub status: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_Battery")]
#[serde(rename_all = "PascalCase")]
pub struct Win32Battery {
    pub name: Option<String>,
    pub battery_status: Option<u16>,
    pub estimated_charge_remaining: Option<u16>,
    pub estimated_run_time: Option<u32>,
    pub design_voltage: Option<u32>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_Service")]
#[serde(rename_all = "PascalCase")]
pub struct Win32Service {
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub state: Option<String>,
    pub start_mode: Option<String>,
    pub process_id: Option<u32>,
    pub service_type: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug, Default)]
#[serde(rename = "Win32_NetworkAdapter")]
#[serde(rename_all = "PascalCase")]
pub struct Win32NetworkAdapter {
    pub name: Option<String>,
    pub mac_address: Option<String>,
    pub net_connection_status: Option<u16>,
    pub speed: Option<String>,
    pub physical_adapter: Option<bool>,
    pub adapter_type: Option<String>,
    pub manufacturer: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct MouseInfo {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct DiscordUserInfo {
    pub id: String,
    pub username: String,
    pub discriminator: String,
    pub global_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub struct DiscordInfo {
    pub connected: bool,
    pub user: Option<DiscordUserInfo>,
    pub scopes: Vec<String>,
    pub last_event: Option<String>,
}

#[derive(Clone, Default)]
pub struct DiscordOAuthState {
    pub state: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
    pub scope: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

#[derive(Deserialize)]
pub struct DiscordOAuthTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub refresh_token: String,
    pub scope: String,
}

#[derive(Deserialize)]
pub struct DiscordRpcAuthenticateData {
    pub user: DiscordUserInfo,
    pub scopes: Vec<String>,
    pub expires: String,
    pub application: Value,
}

#[derive(Deserialize)]
pub struct RpcSelectedVoiceChannel {
    pub id: String,
    pub guild_id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub channel_type: i32,
    pub voice_states: Option<Vec<RpcVoiceStateEntry>>,
}

#[derive(Deserialize)]
pub struct RpcVoiceStateEntry {
    pub voice_state: RpcVoiceStateFlags,
    pub user: RpcDiscordUser,
    pub nick: Option<String>,
    pub volume: Option<f64>,
    pub mute: Option<bool>,
    pub pan: Option<RpcPan>,
}

#[derive(Deserialize)]
pub struct RpcVoiceStateFlags {
    pub mute: bool,
    pub deaf: bool,
    pub self_mute: bool,
    pub self_deaf: bool,
    pub suppress: bool,
}

#[derive(Debug, serde::Deserialize)]
pub struct RpcDiscordUser {
    pub id: String,
    pub username: String,
    pub discriminator: String,
    pub avatar: Option<String>,
    pub bot: Option<bool>,
    // 他のフィールドは無視される（deny_unknown_fieldsがなければ）
}

#[derive(Deserialize)]
pub struct RpcPan {
    pub left: f64,
    pub right: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct DiscordVoiceInfo {
    pub selected_channel_id: Option<String>,
    pub selected_channel_name: Option<String>,
    pub guild_id: Option<String>,
    pub channel_type: Option<i32>,
    pub members: Vec<DiscordVoiceMember>,
}

#[derive(Clone, Serialize, Default)]
pub struct DiscordVoiceMember {
    pub user_id: String,
    pub username: String,
    pub discriminator: String,
    pub avatar: Option<String>,
    pub bot: bool,
    pub nick: Option<String>,
    pub mute: bool,
    pub deaf: bool,
    pub self_mute: bool,
    pub self_deaf: bool,
    pub suppress: bool,
    pub volume: Option<f64>,
    pub pan_left: Option<f64>,
    pub pan_right: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct StoredToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}