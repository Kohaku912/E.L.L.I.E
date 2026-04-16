use crate::models::*;
use crate::state::{AppState, CachedSnapshot, DISCORD_CACHE, DISCORD_VOICE_CACHE};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::{Components, Disks, Networks, System};
use serde::Deserialize;

#[cfg(target_os = "windows")]
use wmi::WMIConnection;

pub fn read_snapshot(state: &AppState) -> Snapshot {
    let mut guard = state.snapshot.lock().unwrap();

    if guard.fetched_at.elapsed() < Duration::from_secs(1) {
        return guard.snapshot.clone();
    }

    let next = build_snapshot();
    guard.snapshot = next.clone();
    guard.fetched_at = Instant::now();
    next
}

pub fn build_snapshot() -> Snapshot {
    let mut sys = System::new_all();
    sys.refresh_all();
    thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();

    let summary = SummaryInfo {
        hostname: System::host_name(),
        os_name: System::name(),
        os_version: System::os_version(),
        kernel_version: System::kernel_version(),
        cpu_arch: Some(std::env::consts::ARCH.to_string()),
        computer_name: None,
        model: None,
    };

    let system = SystemInfo {
        hostname: summary.hostname.clone(),
        os_name: summary.os_name.clone(),
        os_version: summary.os_version.clone(),
        kernel_version: summary.kernel_version.clone(),
        cpu_arch: summary.cpu_arch.clone(),
        computer_system: query_wmi::<Win32ComputerSystem>()
            .into_iter()
            .map(|x| ComputerSystemInfo {
                manufacturer: x.manufacturer,
                model: x.model,
                username: x.username,
                domain: x.domain,
                total_physical_memory: x.total_physical_memory,
                number_of_logical_processors: x.number_of_logical_processors,
                number_of_processors: x.number_of_processors,
            })
            .collect(),
        bios: query_wmi::<Win32Bios>()
            .into_iter()
            .map(|x| BiosInfo {
                manufacturer: x.manufacturer,
                smbios_bios_version: x.smbios_bios_version,
                serial_number: x.serial_number,
                release_date: x.release_date,
            })
            .collect(),
        baseboard: query_wmi::<Win32BaseBoard>()
            .into_iter()
            .map(|x| BaseboardInfo {
                manufacturer: x.manufacturer,
                product: x.product,
                serial_number: x.serial_number,
            })
            .collect(),
    };

    let cpu = CpuInfo {
        physical_cores: System::physical_core_count(),
        logical_cores: sys.cpus().len(),
        global_usage: sys.global_cpu_usage(),
        cores: sys
            .cpus()
            .iter()
            .map(|c| CpuCoreInfo {
                name: c.name().to_string(),
                brand: c.brand().to_string(),
                vendor_id: c.vendor_id().to_string(),
                usage: c.cpu_usage(),
                frequency_mhz: c.frequency(),
            })
            .collect(),
    };

    let memory = MemoryInfo {
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        free_memory: sys.free_memory(),
        available_memory: sys.available_memory(),
        total_swap: sys.total_swap(),
        used_swap: sys.used_swap(),
        free_swap: sys.free_swap(),
        modules: query_wmi::<Win32PhysicalMemory>()
            .into_iter()
            .map(|x| MemoryModuleInfo {
                capacity: x.capacity,
                speed: x.speed,
                manufacturer: x.manufacturer,
                part_number: x.part_number,
                serial_number: x.serial_number,
                form_factor: x.form_factor,
                memory_type: x.memory_type,
            })
            .collect(),
    };

    let storage = StorageInfo {
        disks: Disks::new_with_refreshed_list()
            .list()
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().into_owned(),
                mount_point: d.mount_point().to_string_lossy().into_owned(),
                file_system: d.file_system().to_string_lossy().into_owned(),
                total_space: d.total_space(),
                available_space: d.available_space(),
                removable: d.is_removable(),
                read_only: d.is_read_only(),
            })
            .collect(),
    };

    let network = NetworkInfo {
        interfaces: Networks::new_with_refreshed_list()
            .iter()
            .map(|(name, net)| NetworkInterfaceInfo {
                interface: name.clone(),
                mac_address: format!("{}", net.mac_address()),
                total_received: net.total_received(),
                total_transmitted: net.total_transmitted(),
                total_packets_received: net.total_packets_received(),
                total_packets_transmitted: net.total_packets_transmitted(),
            })
            .collect(),
        adapters: query_wmi::<Win32NetworkAdapter>()
            .into_iter()
            .map(|x| NetworkAdapterInfo {
                name: x.name,
                mac_address: x.mac_address,
                net_connection_status: x.net_connection_status,
                speed: x.speed,
                physical_adapter: x.physical_adapter,
                adapter_type: x.adapter_type,
                manufacturer: x.manufacturer,
            })
            .collect(),
    };

    let hardware = HardwareInfo {
        bios: system.bios.clone(),
        baseboard: system.baseboard.clone(),
        computer_system: system.computer_system.clone(),
    };

    let gpu = GpuInfo {
        controllers: query_wmi::<Win32VideoController>()
            .into_iter()
            .map(|x| GpuControllerInfo {
                name: x.name,
                driver_version: x.driver_version,
                adapter_ram: x.adapter_ram,
                current_horizontal_resolution: x.current_horizontal_resolution,
                current_vertical_resolution: x.current_vertical_resolution,
                current_refresh_rate: x.current_refresh_rate,
                video_mode_description: x.video_mode_description,
                status: x.status,
            })
            .collect(),
    };

    let battery = BatteryInfo {
        batteries: query_wmi::<Win32Battery>()
            .into_iter()
            .map(|x| BatteryDeviceInfo {
                name: x.name,
                battery_status: x.battery_status,
                estimated_charge_remaining: x.estimated_charge_remaining,
                estimated_run_time: x.estimated_run_time,
                design_voltage: x.design_voltage,
            })
            .collect(),
    };

    let services = ServiceInfo {
        services: query_wmi::<Win32Service>()
            .into_iter()
            .map(|x| ServiceDeviceInfo {
                name: x.name,
                display_name: x.display_name,
                state: x.state,
                start_mode: x.start_mode,
                process_id: x.process_id,
                service_type: x.service_type,
            })
            .collect(),
    };

    let mut processes: Vec<ProcessItem> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let du = process.disk_usage();
            ProcessItem {
                pid: format!("{pid}"),
                name: process.name().to_string_lossy().into_owned(),
                exe: process.exe().map(|p| p.to_string_lossy().into_owned()),
                cmd: process
                    .cmd()
                    .iter()
                    .map(|s| s.to_string_lossy().into_owned())
                    .collect(),
                cwd: process.cwd().map(|p| p.to_string_lossy().into_owned()),
                parent: process.parent().map(|p| format!("{p}")),
                status: format!("{:?}", process.status()),
                cpu_usage: process.cpu_usage(),
                memory: process.memory(),
                disk_read: du.total_read_bytes,
                disk_written: du.total_written_bytes,
            }
        })
        .collect();

    processes.sort_by(|a, b| b.cpu_usage.total_cmp(&a.cpu_usage));
    let top = processes.into_iter().take(50).collect();

    let sensors = SensorInfo {
        components: Components::new_with_refreshed_list()
            .iter()
            .map(|c| ComponentInfo {
                label: c.label().to_string(),
                temperature: c.temperature(),
                max: c.max(),
                critical: c.critical(),
            })
            .collect(),
    };

    let discord = DISCORD_CACHE.read().map(|g| g.clone()).unwrap_or_default();
    let discord_voice = DISCORD_VOICE_CACHE
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();

    Snapshot {
        summary,
        system,
        cpu,
        memory,
        storage,
        network,
        hardware,
        gpu,
        battery,
        services,
        processes: ProcessInfo { top },
        sensors,
        mouse: MouseInfo::default(),
        discord,
        discord_voice,
    }
}

#[cfg(target_os = "windows")]
fn query_wmi<T>() -> Vec<T>
where
    T: for<'de> Deserialize<'de> + Default,
{
    WMIConnection::new()
        .ok()
        .and_then(|con| con.query::<T>().ok())
        .unwrap_or_default()
}

#[cfg(not(target_os = "windows"))]
fn query_wmi<T>() -> Vec<T>
where
    T: for<'de> Deserialize<'de> + Default,
{
    Vec::new()
}