// TALLY · 演讲倒计时 — Tauri 版
// 版权所有 © 2026 云南化石（制作人） · 保留所有权利

use tauri::{RunEvent, WindowEvent};

/// 退出整个应用（隐藏的显示窗口不阻止退出）
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// PPT 放映检测用的前台应用状态（macOS）：
/// 一次 osascript 取全 —— "NONE" / "ERR" /
/// "名称|bundleId" / "名称|bundleId|x,y,w,h"（首窗口几何，缺省=放映窗口未暴露）
#[cfg(target_os = "macos")]
const PPT_FRONT_SCRIPT: &str = r#"
tell application "System Events"
	set procs to application processes whose frontmost is true
	if (count of procs) is 0 then return "NONE"
	set p to item 1 of procs
	try
		set bn to bundle identifier of p
	on error
		set bn to ""
	end try
	set out to (name of p) & "|" & bn
	try
		set wc to count of windows of p
		if wc > 0 then
			set wp to position of window 1 of p
			set ws to size of window 1 of p
			set out to out & "|" & ((item 1 of wp) as text) & "," & ((item 2 of wp) as text) & "," & ((item 1 of ws) as text) & "," & ((item 2 of ws) as text)
		end if
	end try
	return out as text
end tell
"#;

#[tauri::command]
fn ppt_front_state() -> String {
    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("osascript")
            .arg("-e")
            .arg(PPT_FRONT_SCRIPT)
            .output()
        {
            Ok(o) if o.status.success() => {
                String::from_utf8_lossy(&o.stdout).trim().to_string()
            }
            _ => "ERR".to_string(),   // 无辅助功能权限等
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "NONE".to_string()        // 检测仅支持 macOS
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![quit_app, ppt_front_state])
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
