mod sidecar;

use serde_json::Value;
use sidecar::{with_sidecar, SidecarLaunch, SidecarState};
use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn core_call(
    state: tauri::State<'_, SidecarState>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    with_sidecar(&state, |sc| sc.call(&method, params.unwrap_or(Value::Null)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir = app.path().resource_dir().ok();
            app.manage(SidecarState {
                launch: SidecarLaunch { resource_dir },
                child: Mutex::new(None),
            });
            let state = app.state::<SidecarState>();
            if let Err(e) =
                with_sidecar(&state, |sc| sc.call("ensureVault", serde_json::json!({})))
            {
                eprintln!("[acv] sidecar warmup failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![core_call])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
