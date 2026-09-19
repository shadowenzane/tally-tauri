// TALLY · 演讲倒计时 — Tauri 版
// 版权所有 © 2026 云南化石（制作人） · 保留所有权利

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

/// 退出整个应用（隐藏的显示窗口不阻止退出）
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ============ macOS 原生 PPT 放映检测（零子进程、零轮询开销、无需权限） ============
//
// 旧方案（每 2s spawn osascript + System Events 查询）实测每次 100-500ms CPU，
// 常驻轮询导致整机卡顿。新方案两层原生信号：
//   1) NSWorkspace.frontmostApplication（纯 ObjC 消息，微秒级）判定前台是否
//      PowerPoint / WPS / Keynote —— 非候选直接短路，平均开销趋近于零；
//   2) CGWindowListCopyWindowInfo(OnScreenOnly)（CoreGraphics C API，亚毫秒级）
//      中前台应用名下窗口 bounds 覆盖任一显示器 ≥98% 即为放映。
// 说明：PPT 进入 macOS 原生全屏编辑（绿色按钮）也会触发，属可接受语义。

#[cfg(target_os = "macos")]
mod ppt_native {
    use core::ffi::{c_char, c_void, CStr};
    use std::ffi::CString;
    use std::sync::Mutex;

    type Id = *mut c_void;
    type Sel = *mut c_void;
    type CFRef = *const c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGRect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    }

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> Id;
        fn sel_registerName(name: *const c_char) -> Sel;
        fn objc_msgSend(recv: Id, sel: Sel, ...) -> Id;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFArrayGetCount(a: CFRef) -> isize;
        fn CFArrayGetValueAtIndex(a: CFRef, idx: isize) -> CFRef;
        fn CFDictionaryGetValue(d: CFRef, key: CFRef) -> CFRef;
        fn CFStringGetCString(s: CFRef, buf: *mut c_char, size: isize, enc: u32) -> u8;
        fn CFNumberGetValue(n: CFRef, ty: i32, out: *mut c_void) -> u8;
        fn CFRelease(c: CFRef);
        fn CFStringCreateWithCString(alloc: CFRef, c: *const c_char, enc: u32) -> CFRef;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(opt: u32, rel: u32) -> CFRef;
        fn CGGetActiveDisplayList(max: u32, ids: *mut u32, cnt: *mut u32) -> i32;
        fn CGDisplayBounds(id: u32) -> CGRect;
        static kCGWindowOwnerName: CFRef;
        static kCGWindowBounds: CFRef;
    }

    const UTF8: u32 = 0x0800_0100;
    const OPT_ON_SCREEN_ONLY: u32 = 1; // kCGWindowListOptionOnScreenOnly
    const F64_TYPE: i32 = 6; // kCFNumberFloat64Type

    fn cls(name: &str) -> Id {
        let c = CString::new(name).unwrap();
        unsafe { objc_getClass(c.as_ptr()) }
    }

    fn sel(name: &str) -> Sel {
        let c = CString::new(name).unwrap();
        unsafe { sel_registerName(c.as_ptr()) }
    }

    fn msg(recv: Id, name: &str) -> Id {
        unsafe { objc_msgSend(recv, sel(name)) }
    }

    /// ObjC 对象 → String（UTF8String；须在 autorelease pool 内使用）
    fn ns_to_string(s: Id) -> Option<String> {
        if s.is_null() {
            return None;
        }
        let utf8 = msg(s, "UTF8String");
        if utf8.is_null() {
            return None;
        }
        Some(unsafe { CStr::from_ptr(utf8 as *const c_char) }.to_string_lossy().into_owned())
    }

    /// 前台应用 (bundleIdentifier, localizedName)；自带 autorelease pool 防泄漏
    pub fn frontmost() -> Option<(String, String)> {
        let pool = msg(msg(cls("NSAutoreleasePool"), "alloc"), "init");
        let ws = msg(cls("NSWorkspace"), "sharedWorkspace");
        let app = msg(ws, "frontmostApplication");
        let bid = ns_to_string(msg(app, "bundleIdentifier"));
        let name = ns_to_string(msg(app, "localizedName"));
        if !pool.is_null() {
            msg(pool, "drain");
        }
        bid.zip(name)
    }

    /// 前台应用是否为放映候选（PowerPoint / WPS / Keynote）
    pub fn is_ppt(app: &str, bundle: &str) -> bool {
        let (a, b) = (app.to_lowercase(), bundle.to_lowercase());
        a.contains("powerpoint") || a.contains("wps") || a == "keynote"
            || b.contains("powerpoint") || b.contains("wps") || b.contains("kingsoft")
            || b.contains("iwork.keynote")
    }

    /// kCGWindowBounds 子键（X/Y/Width/Height 的 CFString）。
    /// CFString 创建后永不释放（进程级缓存），指针值一经创建即为常量；
    /// 以 usize 形式存入全局 Mutex（裸指针不能跨线程，整数可以），取出还原。
    fn bound_keys() -> (CFRef, CFRef, CFRef, CFRef) {
        static KEYS: Mutex<Option<(usize, usize, usize, usize)>> = Mutex::new(None);
        let mut g = KEYS.lock().unwrap();
        if let Some((a, b, c, d)) = *g {
            return (a as CFRef, b as CFRef, c as CFRef, d as CFRef);
        }
        let mk = |s: &str| {
            let c = CString::new(s).unwrap();
            unsafe { CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), UTF8) }
        };
        let (a, b, c, d) = (mk("X"), mk("Y"), mk("Width"), mk("Height"));
        *g = Some((a as usize, b as usize, c as usize, d as usize));
        (a, b, c, d)
    }

    /// owner 应用名下是否存在覆盖任一显示器 ≥98% 的可见窗口（放映判定）
    pub fn owner_has_fullscreen_window(owner: &str) -> bool {
        unsafe {
            let mut ids = [0u32; 16];
            let mut n = 0u32;
            if CGGetActiveDisplayList(16, ids.as_mut_ptr(), &mut n) != 0 || n == 0 {
                return false;
            }
            let screens: Vec<CGRect> =
                (0..n as usize).map(|i| CGDisplayBounds(ids[i])).collect();

            let list = CGWindowListCopyWindowInfo(OPT_ON_SCREEN_ONLY, 0);
            if list.is_null() {
                return false;
            }
            let (kx, _ky, kw, kh) = bound_keys();
            let mut hit = false;
            let cnt = CFArrayGetCount(list);
            for i in 0..cnt {
                let d = CFArrayGetValueAtIndex(list, i);
                if d.is_null() {
                    continue;
                }
                // 窗口属主名 ≠ 前台应用名 → 跳过
                let name_ref = CFDictionaryGetValue(d, kCGWindowOwnerName);
                if name_ref.is_null() {
                    continue;
                }
                let mut buf = [0 as c_char; 256];
                if CFStringGetCString(name_ref, buf.as_mut_ptr(), 256, UTF8) == 0 {
                    continue;
                }
                if CStr::from_ptr(buf.as_ptr()).to_string_lossy() != owner {
                    continue;
                }
                // 窗口 bounds 与各显示器比对
                let bref = CFDictionaryGetValue(d, kCGWindowBounds);
                if bref.is_null() {
                    continue;
                }
                let mut x = 0f64;
                let mut y = 0f64;
                let mut w = 0f64;
                let mut h = 0f64;
                for (key, out) in [
                    (kx, &mut x as *mut f64),
                    (_ky, &mut y as *mut f64),
                    (kw, &mut w as *mut f64),
                    (kh, &mut h as *mut f64),
                ] {
                    let num = CFDictionaryGetValue(bref, key);
                    if num.is_null() {
                        continue;
                    }
                    CFNumberGetValue(num, F64_TYPE, out as *mut c_void);
                }
                if w > 0.0 && h > 0.0 {
                    for s in &screens {
                        if w >= s.w * 0.98 && h >= s.h * 0.98 {
                            hit = true;
                            break;
                        }
                    }
                }
                if hit {
                    break;
                }
            }
            CFRelease(list);
            hit
        }
    }

    /// NSWindow 跨全屏空间置顶：CanJoinAllSpaces(1<<0) | FullScreenAuxiliary(1<<8)。
    /// 不设置的话，PPT 放映独占 macOS 全屏 Space，倒计时窗口将完全不可见。
    pub fn set_space_overlay(nswin: Id, behavior: u64) {
        if nswin.is_null() {
            return;
        }
        unsafe { objc_msgSend(nswin, sel("setCollectionBehavior:"), behavior) };
    }
}

/// 基准入口（examples/pptbench 用）：前台应用 + 候选判定
#[cfg(target_os = "macos")]
pub fn bench_frontmost() -> (String, String, bool) {
    ppt_native::frontmost()
        .map(|(bid, name)| {
            let is = ppt_native::is_ppt(&bid, &name);
            (bid, name, is)
        })
        .unwrap_or_default()
}

/// PPT 放映状态（前端每 2s 调一次；非候选前台时仅一次 ObjC 消息即返回）
#[tauri::command]
fn ppt_show_state() -> bool {
    #[cfg(target_os = "macos")]
    {
        ppt_native::frontmost()
            .map(|(bid, name)| {
                ppt_native::is_ppt(&bid, &name)
                    && ppt_native::owner_has_fullscreen_window(&name)
            })
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false // 检测仅支持 macOS
    }
}

/// 显示窗口跨空间置顶（clock/bar/runner）：PPT 全屏放映中依然悬浮可见
#[cfg(target_os = "macos")]
fn enable_space_overlay(app: &AppHandle) {
    const BEHAVIOR: u64 = 1 | (1 << 8); // CanJoinAllSpaces | FullScreenAuxiliary
    for label in ["clock", "bar", "runner"] {
        if let Some(win) = app.get_webview_window(label) {
            if let Ok(nswin) = win.ns_window() {
                ppt_native::set_space_overlay(nswin as _, BEHAVIOR);
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![quit_app, ppt_show_state])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            enable_space_overlay(app.handle());
            Ok(())
        })
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
