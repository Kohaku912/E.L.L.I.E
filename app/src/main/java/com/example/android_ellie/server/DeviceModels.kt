package com.example.android_ellie.server

import kotlinx.serialization.Serializable

@Serializable
data class DeviceState(
    val collectedAt: String,
    val device: DeviceInfo,
    val os: OsInfo,
    val battery: BatteryInfo,
    val memory: MemoryInfo,
    val storage: StorageInfo,
    val network: NetworkInfo,
    val audio: AudioInfo,
    val display: DisplayInfo,
    val power: PowerInfo,
    val hardware: HardwareInfo,
    val thermal: ThermalInfo,
    val sensors: SensorInfo,
    val app: AppInfo,
    val accessibility: AccessibilityInfo? = null,
    val notifications: List<NotificationInfo> = emptyList(),
    val usage: List<UsageInfo> = emptyList(),
    val location: LocationInfo? = null,
    val media: MediaInfo? = null,
    val clipboard: String? = null,
    val contacts: List<ContactInfo> = emptyList(),
    val calendarEvents: List<CalendarEvent> = emptyList(),
    val installedApps: List<InstalledAppInfo> = emptyList(),
    val bluetoothDevices: List<BluetoothDeviceInfo> = emptyList(),
)

@Serializable
data class ContactInfo(
    val id: String,
    val displayName: String?,
    val phoneNumbers: List<String>,
    val emails: List<String>,
)

@Serializable
data class CalendarEvent(
    val id: String,
    val title: String?,
    val description: String?,
    val location: String?,
    val startTime: Long,
    val endTime: Long,
)

@Serializable
data class InstalledAppInfo(
    val name: String,
    val packageName: String,
    val versionName: String?,
    val firstInstallTime: Long,
    val isSystemApp: Boolean,
)

@Serializable
data class BluetoothDeviceInfo(
    val name: String?,
    val address: String,
    val type: String,
    val isConnected: Boolean,
)

@Serializable
data class AccessibilityInfo(
    val packageName: String?,
    val className: String?,
    val text: String?,
    val contentDescription: String?,
    val windowTitle: String?,
    val isFocused: Boolean,
    val isScrollable: Boolean,
    val bounds: String?,
    val nodeHierarchy: List<AccessibilityNodeInfo>? = null,
)

@Serializable
data class AccessibilityNodeInfo(
    val text: String?,
    val contentDescription: String?,
    val className: String?,
    val packageName: String?,
    val bounds: String?,
    val isClickable: Boolean,
    val isEditable: Boolean,
    val isPassword: Boolean,
)

@Serializable
data class NotificationInfo(
    val packageName: String,
    val title: String?,
    val text: String?,
    val subText: String?,
    val postTime: Long,
    val isClearable: Boolean,
    val isOngoing: Boolean,
)

@Serializable
data class UsageInfo(
    val packageName: String,
    val totalTimeInForeground: Long,
    val lastTimeUsed: Long,
)

@Serializable
data class LocationInfo(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val altitude: Double,
    val speed: Float,
    val provider: String?,
    val time: Long,
)

@Serializable
data class MediaInfo(
    val title: String?,
    val artist: String?,
    val album: String?,
    val duration: Long,
    val playbackState: String?,
)

@Serializable
data class DeviceInfo(
    val brand: String,
    val model: String,
    val manufacturer: String,
    val device: String,
    val product: String,
    val board: String,
    val hardware: String,
    val bootloader: String,
    val fingerprint: String,
)

@Serializable
data class OsInfo(
    val sdkInt: Int,
    val release: String,
    val incremental: String,
    val securityPatch: String,
    val locale: String,
    val timeZone: String,
    val isEmulator: Boolean,
    val uptimeMs: Long,
)

@Serializable
data class BatteryInfo(
    val levelPercent: Int,
    val status: String,
    val plugged: String,
    val temperatureC: Double,
    val voltageMv: Int,
    val health: String,
    val isCharging: Boolean,
)

@Serializable
data class MemoryInfo(
    val totalBytes: Long,
    val availableBytes: Long,
    val lowMemory: Boolean,
    val thresholdBytes: Long,
    val appPssKb: Int,
    val appPrivateDirtyKb: Int,
)

@Serializable
data class StorageInfo(
    val totalBytes: Long,
    val availableBytes: Long,
    val filesDirBytes: Long,
    val cacheDirBytes: Long,
)

@Serializable
data class NetworkInfo(
    val isConnected: Boolean,
    val transport: String,
    val isValidated: Boolean,
    val isMetered: Boolean,
    val isRoaming: Boolean,
    val wifi: WifiInfo?,
)

@Serializable
data class WifiInfo(
    val ssid: String,
    val bssid: String,
    val linkSpeedMbps: Int,
    val frequencyMHz: Int,
    val rssi: Int,
)

@Serializable
data class AudioInfo(
    val mode: String,
    val ringerMode: String,
    val isMusicActive: Boolean,
    val volumeMusic: Int,
    val volumeRing: Int,
    val volumeAlarm: Int,
    val volumeNotification: Int,
)

@Serializable
data class DisplayInfo(
    val widthPx: Int,
    val heightPx: Int,
    val density: Float,
    val refreshRateHz: Float,
    val brightnessMode: String,
    val isNightMode: Boolean,
    val orientation: String,
)

@Serializable
data class PowerInfo(
    val isInteractive: Boolean,
    val isPowerSaveMode: Boolean,
)

@Serializable
data class HardwareInfo(
    val hasCamera: Boolean,
    val hasFrontCamera: Boolean,
    val hasMicrophone: Boolean,
    val hasNfc: Boolean,
    val hasBluetooth: Boolean,
    val hasFlash: Boolean,
    val hasGps: Boolean,
    val hasFingerprint: Boolean,
)

@Serializable
data class ThermalInfo(
    val thermalStatus: String,
)

@Serializable
data class SensorInfo(
    val sensorCount: Int,
    val sensors: List<String>,
)

@Serializable
data class AppInfo(
    val packageName: String,
    val versionName: String,
    val versionCode: Long,
)

@Serializable
data class HealthResponse(
    val ok: Boolean,
    val running: Boolean,
)

@Serializable
data class ServerFunction(
    val name: String,
    val method: String,
    val path: String,
    val description: String,
)