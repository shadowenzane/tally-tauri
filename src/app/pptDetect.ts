// PPT 放映检测（macOS）：前台应用 + 全屏窗口判定（与 Python tally/ppt_detect.py 对称）
//
// Rust 侧 command `ppt_front_state` 返回原始串：
//   "NONE" / "ERR" / "名称|bundleId" / "名称|bundleId|x,y,w,h"
// 判定：前台是候选应用（PowerPoint / WPS / Keynote），且
//   - 无窗口几何 → 放映窗口未暴露给辅助功能，视为放映；
//   - 有几何 → 与任一显示器（换算逻辑像素）比对 ≥98% 才算放映。
// 无辅助功能权限时返回 ERR → 恒为"未放映"（UI 中有权限提示文案）。

import { invoke } from '@tauri-apps/api/core';
import { availableMonitors } from '@tauri-apps/api/window';

/** 前台应用是否属于放映候选 */
export function isPptApp(app: string, bundle: string): boolean {
  const a = (app || '').toLowerCase();
  const b = (bundle || '').toLowerCase();
  return a.includes('powerpoint') || a.includes('wps') || a === 'keynote'
    || b.includes('powerpoint') || b.includes('wps') || b.includes('kingsoft')
    || b.includes('iwork.keynote');
}

interface Geo { x: number; y: number; w: number; h: number }

function parseGeo(s: string): Geo | null {
  const parts = s.split(',').map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

/** 原始串 + 显示器逻辑尺寸列表 → 是否放映（纯函数，可单测） */
export function judgeFront(
  raw: string,
  screens: Array<{ w: number; h: number }>,
): boolean {
  const s = (raw || '').trim();
  if (!s || s === 'ERR' || s === 'NONE') return false;
  const seg = s.split('|');
  if (seg.length < 2 || !isPptApp(seg[0], seg[1])) return false;
  if (seg.length < 3 || !seg[2]) return true;   // 放映窗口未暴露给辅助功能
  const g = parseGeo(seg[2]);
  if (!g) return true;
  return screens.some((m) => g.w >= m.w * 0.98 && g.h >= m.h * 0.98);
}

/** 一次完整检测（osascript + 显示器比对）；任何失败都返回 false，不抛错 */
export async function pollPptShow(): Promise<boolean> {
  let raw: string;
  try {
    raw = await invoke<string>('ppt_front_state');
  } catch {
    return false;
  }
  const mons = await availableMonitors().catch(() => []);
  // 物理像素 → 逻辑像素（osascript 窗口几何为逻辑点）
  const screens = mons.map((m) => {
    const sf = m.scaleFactor || 1;
    return { w: m.size.width / sf, h: m.size.height / sf };
  });
  return judgeFront(raw, screens);
}
