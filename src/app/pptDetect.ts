// PPT 放映检测（macOS）：纯原生信号，零子进程、无需辅助功能权限
//
// Rust command `ppt_show_state` 在原生层完成两级判定：
//   1) NSWorkspace.frontmostApplication（微秒级 ObjC 消息）——前台非
//      PowerPoint / WPS / Keynote 时直接短路返回 false，平均开销趋近于零；
//   2) 前台是候选应用时才查 CGWindowList（OnScreenOnly），其窗口 bounds
//      覆盖任一显示器 ≥98% 即判定放映。
// 前端仅做轮询调度与上升沿触发，不承担任何判定逻辑。
//
// 轮询节奏：前台常态（非 PPT 应用）下一次调用 <0.1ms；本模块随显示窗口
// 渲染循环驱动，每帧最多触发一次检测（受 useDisplayWindow 帧率上限约束：
// 运行 30fps / 待机 15fps），无需独立定时器。

import { invoke } from '@tauri-apps/api/core';

/**
 * 查询当前是否处于 PPT 放映状态。
 * 失败（非 macOS / 原生调用异常）一律返回 false，不抛错。
 */
export async function pollPptShow(): Promise<boolean> {
  try {
    return await invoke<boolean>('ppt_show_state');
  } catch {
    return false;
  }
}
