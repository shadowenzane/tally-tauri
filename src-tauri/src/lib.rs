use tauri::{RunEvent, WindowEvent};

/// 退出整个应用（隐藏的显示窗口不阻止退出）
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![quit_app])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // 主窗口被销毁（如 Cmd+W）→ 整个应用退出，隐藏的显示窗口一并结束
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::Destroyed { .. },
                ..
            } = event
            {
                if label == "main" {
                    app.exit(0);
                }
            }
        });
}
