package com.example.android_ellie.server

import android.app.ActivityManager
import android.app.UiModeManager
import android.app.usage.UsageStatsManager
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.graphics.Point
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.location.LocationManager
import android.media.session.MediaSessionManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import android.os.StatFs
import android.os.SystemClock
import android.util.DisplayMetrics
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.content.pm.ApplicationInfo as AndroidAppInfo
import android.view.Display
import android.view.WindowManager
import androidx.core.content.getSystemService
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt

class DeviceStateCollector(private val context: Context) {

    fun collect(): DeviceState {
        return DeviceState(
            collectedAt = java.text.DateFormat.getDateTimeInstance().format(System.currentTimeMillis()),
            device = readDevice(),
            os = readOs(),
            battery = readBattery(),
            memory = readMemory(),
            storage = readStorage(),
            network = readNetwork(),
            audio = readAudio(),
            display = readDisplay(),
            power = readPower(),
            hardware = readHardware(),
            thermal = readThermal(),
            sensors = readSensors(),
            app = readApp(),
            accessibility = EllieAccessibilityService.lastEvent,
            notifications = EllieNotificationListenerService.lastNotifications,
            usage = readUsage(),
            location = readLocation(),
            media = readMedia(),
            clipboard = readClipboard(),
            contacts = readContacts(),
            calendarEvents = readCalendar(),
            installedApps = readInstalledApps(),
            bluetoothDevices = readBluetooth()
        )
    }

    private fun readContacts(): List<ContactInfo> {
        return runCatching {
            val list = mutableListOf<ContactInfo>()
            val cursor = context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                null, null, null, null
            )
            cursor?.use {
                val idIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
                val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val id = it.getString(idIdx)
                    val name = it.getString(nameIdx)
                    val num = it.getString(numIdx)
                    list.add(ContactInfo(id, name, listOf(num), emptyList()))
                }
            }
            list.take(20)
        }.getOrDefault(emptyList())
    }

    private fun readCalendar(): List<CalendarEvent> {
        return runCatching {
            val list = mutableListOf<CalendarEvent>()
            val cursor = context.contentResolver.query(
                CalendarContract.Events.CONTENT_URI,
                null, null, null, null
            )
            cursor?.use {
                val idIdx = it.getColumnIndex(CalendarContract.Events._ID)
                val titleIdx = it.getColumnIndex(CalendarContract.Events.TITLE)
                val descIdx = it.getColumnIndex(CalendarContract.Events.DESCRIPTION)
                val startIdx = it.getColumnIndex(CalendarContract.Events.DTSTART)
                val endIdx = it.getColumnIndex(CalendarContract.Events.DTEND)
                while (it.moveToNext()) {
                    list.add(CalendarEvent(
                        id = it.getString(idIdx),
                        title = it.getString(titleIdx),
                        description = it.getString(descIdx),
                        location = null,
                        startTime = it.getLong(startIdx),
                        endTime = it.getLong(endIdx)
                    ))
                }
            }
            list.take(10)
        }.getOrDefault(emptyList())
    }

    private fun readInstalledApps(): List<InstalledAppInfo> {
        return runCatching {
            context.packageManager.getInstalledApplications(android.content.pm.PackageManager.GET_META_DATA)
                .map { app ->
                    val pi = context.packageManager.getPackageInfo(app.packageName, 0)
                    InstalledAppInfo(
                        name = app.loadLabel(context.packageManager).toString(),
                        packageName = app.packageName,
                        versionName = pi.versionName,
                        firstInstallTime = pi.firstInstallTime,
                        isSystemApp = (app.flags and AndroidAppInfo.FLAG_SYSTEM) != 0
                    )
                }.take(50)
        }.getOrDefault(emptyList())
    }

    private fun readBluetooth(): List<BluetoothDeviceInfo> {
        return runCatching {
            val bm = context.getSystemService<BluetoothManager>()
            val adapter = bm?.adapter ?: return emptyList()
            adapter.bondedDevices.map { device ->
                BluetoothDeviceInfo(
                    name = device.name,
                    address = device.address,
                    type = when (device.type) {
                        BluetoothDevice.DEVICE_TYPE_CLASSIC -> "classic"
                        BluetoothDevice.DEVICE_TYPE_LE -> "le"
                        BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
                        else -> "unknown"
                    },
                    isConnected = false // Requires reflection or hidden APIs to get real-time connection state easily
                )
            }
        }.getOrDefault(emptyList())
    }

    private fun readDevice(): DeviceInfo = DeviceInfo(
        brand = Build.BRAND.orEmpty(),
        model = Build.MODEL.orEmpty(),
        manufacturer = Build.MANUFACTURER.orEmpty(),
        device = Build.DEVICE.orEmpty(),
        product = Build.PRODUCT.orEmpty(),
        board = Build.BOARD.orEmpty(),
        hardware = Build.HARDWARE.orEmpty(),
        bootloader = Build.BOOTLOADER.orEmpty(),
        fingerprint = Build.FINGERPRINT.orEmpty()
    )

    private fun readOs(): OsInfo = OsInfo(
        sdkInt = Build.VERSION.SDK_INT,
        release = Build.VERSION.RELEASE.orEmpty(),
        incremental = Build.VERSION.INCREMENTAL.orEmpty(),
        securityPatch = Build.VERSION.SECURITY_PATCH.orEmpty(),
        locale = Locale.getDefault().toLanguageTag(),
        timeZone = TimeZone.getDefault().id,
        isEmulator = isEmulator(),
        uptimeMs = SystemClock.elapsedRealtime()
    )

    private fun readBattery(): BatteryInfo {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val statusValue = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val pluggedValue = intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        val temperatureTenth = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        val voltage = intent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0) ?: 0
        val healthValue = intent?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1

        val percent = if (level >= 0 && scale > 0) {
            ((level.toFloat() / scale.toFloat()) * 100f).roundToInt()
        } else {
            -1
        }

        return BatteryInfo(
            levelPercent = percent,
            status = when (statusValue) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
                BatteryManager.BATTERY_STATUS_FULL -> "full"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
                else -> "unknown"
            },
            plugged = when (pluggedValue) {
                BatteryManager.BATTERY_PLUGGED_AC -> "ac"
                BatteryManager.BATTERY_PLUGGED_USB -> "usb"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
                else -> "unplugged"
            },
            temperatureC = temperatureTenth / 10.0,
            voltageMv = voltage,
            health = when (healthValue) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "good"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
                BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
                BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
                BatteryManager.BATTERY_HEALTH_COLD -> "cold"
                else -> "unknown"
            },
            isCharging = statusValue == BatteryManager.BATTERY_STATUS_CHARGING ||
                    statusValue == BatteryManager.BATTERY_STATUS_FULL
        )
    }

    private fun readMemory(): MemoryInfo {
        val am = context.getSystemService<ActivityManager>()!!
        val info = ActivityManager.MemoryInfo()
        am.getMemoryInfo(info)

        val procInfo = Debug.MemoryInfo()
        Debug.getMemoryInfo(procInfo)

        return MemoryInfo(
            totalBytes = info.totalMem,
            availableBytes = info.availMem,
            lowMemory = info.lowMemory,
            thresholdBytes = info.threshold,
            appPssKb = procInfo.totalPss,
            appPrivateDirtyKb = procInfo.totalPrivateDirty
        )
    }

    private fun readStorage(): StorageInfo {
        val statFs = StatFs(context.filesDir.absolutePath)
        return StorageInfo(
            totalBytes = statFs.totalBytes,
            availableBytes = statFs.availableBytes,
            filesDirBytes = dirSize(context.filesDir),
            cacheDirBytes = context.cacheDir?.let { dirSize(it) } ?: 0L
        )
    }

    private fun readNetwork(): NetworkInfo {
        val cm = context.getSystemService<ConnectivityManager>()
        val network = cm?.activeNetwork
        val caps = cm?.getNetworkCapabilities(network)

        val wifiInfo = runCatching {
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val info = wm.connectionInfo
            WifiInfo(
                ssid = info.ssid?.trim('"').orEmpty(),
                bssid = info.bssid.orEmpty(),
                linkSpeedMbps = info.linkSpeed,
                frequencyMHz = info.frequency,
                rssi = info.rssi
            )
        }.getOrNull()

        return NetworkInfo(
            isConnected = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true,
            transport = when {
                caps == null -> "none"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "bluetooth"
                else -> "other"
            },
            isValidated = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true,
            isMetered = cm?.isActiveNetworkMetered == true,
            isRoaming = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING) == false,
            wifi = wifiInfo
        )
    }

    private fun readAudio(): AudioInfo {
        val am = context.getSystemService(android.media.AudioManager::class.java)
        return AudioInfo(
            mode = when (am?.mode) {
                android.media.AudioManager.MODE_IN_CALL -> "in_call"
                android.media.AudioManager.MODE_IN_COMMUNICATION -> "in_communication"
                android.media.AudioManager.MODE_RINGTONE -> "ringtone"
                android.media.AudioManager.MODE_NORMAL -> "normal"
                else -> "unknown"
            },
            ringerMode = when (am?.ringerMode) {
                android.media.AudioManager.RINGER_MODE_SILENT -> "silent"
                android.media.AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
                android.media.AudioManager.RINGER_MODE_NORMAL -> "normal"
                else -> "unknown"
            },
            isMusicActive = am?.isMusicActive == true,
            volumeMusic = am?.getStreamVolume(android.media.AudioManager.STREAM_MUSIC) ?: -1,
            volumeRing = am?.getStreamVolume(android.media.AudioManager.STREAM_RING) ?: -1,
            volumeAlarm = am?.getStreamVolume(android.media.AudioManager.STREAM_ALARM) ?: -1,
            volumeNotification = am?.getStreamVolume(android.media.AudioManager.STREAM_NOTIFICATION) ?: -1
        )
    }

    private fun readDisplay(): DisplayInfo {
        val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val display = displayManager.getDisplay(Display.DEFAULT_DISPLAY)

        val metrics = DisplayMetrics()
        if (display != null) {
            @Suppress("DEPRECATION")
            display.getRealMetrics(metrics)
        } else {
            metrics.setTo(context.resources.displayMetrics)
        }

        val size = Point()
        if (display != null) {
            @Suppress("DEPRECATION")
            display.getRealSize(size)
        }

        val uiModeManager = context.getSystemService<UiModeManager>()
        val nightModeMask = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK

        return DisplayInfo(
            widthPx = if (size.x > 0) size.x else metrics.widthPixels,
            heightPx = if (size.y > 0) size.y else metrics.heightPixels,
            density = metrics.density,
            refreshRateHz = display?.refreshRate ?: 0f,
            brightnessMode = when (uiModeManager?.nightMode) {
                UiModeManager.MODE_NIGHT_YES -> "night"
                UiModeManager.MODE_NIGHT_NO -> "day"
                else -> "auto"
            },
            isNightMode = nightModeMask == Configuration.UI_MODE_NIGHT_YES,
            orientation = when (context.resources.configuration.orientation) {
                Configuration.ORIENTATION_LANDSCAPE -> "landscape"
                Configuration.ORIENTATION_PORTRAIT -> "portrait"
                else -> "unknown"
            }
        )
    }

    private fun readPower(): PowerInfo {
        val pm = context.getSystemService<PowerManager>()
        return PowerInfo(
            isInteractive = pm?.isInteractive == true,
            isPowerSaveMode = pm?.isPowerSaveMode == true
        )
    }

    private fun readHardware(): HardwareInfo {
        val pm = context.packageManager
        return HardwareInfo(
            hasCamera = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_ANY),
            hasFrontCamera = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_FRONT),
            hasMicrophone = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_MICROPHONE),
            hasNfc = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_NFC),
            hasBluetooth = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_BLUETOOTH),
            hasFlash = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_FLASH),
            hasGps = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LOCATION_GPS),
            hasFingerprint = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_FINGERPRINT)
        )
    }

    private fun readThermal(): ThermalInfo {
        val pm = context.getSystemService<PowerManager>()
        val status = when (pm?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE) {
            PowerManager.THERMAL_STATUS_NONE -> "none"
            PowerManager.THERMAL_STATUS_LIGHT -> "light"
            PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
            PowerManager.THERMAL_STATUS_SEVERE -> "severe"
            PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
            PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
            else -> "unknown"
        }

        return ThermalInfo(thermalStatus = status)
    }

    private fun readSensors(): SensorInfo {
        val sm = context.getSystemService<SensorManager>()
        val sensors = sm?.getSensorList(android.hardware.Sensor.TYPE_ALL).orEmpty()

        return SensorInfo(
            sensorCount = sensors.size,
            sensors = sensors.map { sensor ->
                "${sensor.name} / ${sensor.vendor} / type=${sensor.type}"
            }
        )
    }

    private fun readApp(): AppInfo {
        val pi = context.packageManager.getPackageInfo(context.packageName, 0)
        return AppInfo(
            packageName = context.packageName,
            versionName = pi.versionName ?: "unknown",
            versionCode = pi.longVersionCode
        )
    }

    private fun readUsage(): List<UsageInfo> {
        val usm = context.getSystemService<UsageStatsManager>() ?: return emptyList()
        val endTime = System.currentTimeMillis()
        val startTime = endTime - 1000 * 60 * 60 * 24 // Last 24 hours
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime) ?: return emptyList()
        return stats.map {
            UsageInfo(
                packageName = it.packageName,
                totalTimeInForeground = it.totalTimeInForeground,
                lastTimeUsed = it.lastTimeUsed
            )
        }.sortedByDescending { it.totalTimeInForeground }.take(10)
    }

    private fun readLocation(): LocationInfo? {
        val lm = context.getSystemService<LocationManager>() ?: return null
        return runCatching {
            val location = lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER) ?: return null
            LocationInfo(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy,
                altitude = location.altitude,
                speed = location.speed,
                provider = location.provider,
                time = location.time
            )
        }.getOrNull()
    }

    private fun readMedia(): MediaInfo? {
        val msm = context.getSystemService<MediaSessionManager>() ?: return null
        return runCatching {
            val controllers = msm.getActiveSessions(null)
            val controller = controllers.firstOrNull() ?: return null
            val metadata = controller.metadata
            MediaInfo(
                title = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_TITLE),
                artist = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST),
                album = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM),
                duration = metadata?.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION) ?: 0L,
                playbackState = when (controller.playbackState?.state) {
                    android.media.session.PlaybackState.STATE_PLAYING -> "playing"
                    android.media.session.PlaybackState.STATE_PAUSED -> "paused"
                    android.media.session.PlaybackState.STATE_BUFFERING -> "buffering"
                    else -> "stopped"
                }
            )
        }.getOrNull()
    }

    private fun readClipboard(): String? {
        val cm = context.getSystemService<ClipboardManager>() ?: return null
        return if (cm.hasPrimaryClip()) {
            cm.primaryClip?.getItemAt(0)?.text?.toString()
        } else null
    }

    private fun isEmulator(): Boolean {
        return Build.FINGERPRINT.contains("generic", ignoreCase = true) ||
                Build.MODEL.contains("Emulator", ignoreCase = true) ||
                Build.MODEL.contains("Android SDK built for", ignoreCase = true) ||
                Build.MANUFACTURER.contains("Genymotion", ignoreCase = true) ||
                Build.BRAND.startsWith("generic") ||
                Build.DEVICE.startsWith("generic")
    }

    private fun dirSize(dir: java.io.File): Long {
        return dir.walkTopDown()
            .filter { it.isFile }
            .sumOf { it.length() }
    }
}
