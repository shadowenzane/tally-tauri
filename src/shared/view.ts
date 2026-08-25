// 时间格式化与视图派生（显示窗口每帧从 TimerState 本地计算）

import type { Prefs, TimerState, View } from './types';
import { DOT_PATTERNS } from './types';

/** 秒 → 'm:ss' / 'h:mm:ss'（向上取整，与 Python fmt 一致） */
export function fmt(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  const h = Math.floor(t / 3600);
  const rem = t % 3600;
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 每帧派生显示视图。
 * running 时剩余时间由 endAt - nowMs 本地推导（主窗口仅广播状态变更 + 60ms 心跳）。
 */
export function deriveView(st: TimerState, prefs: Prefs, nowMs: number): View {
  let remainingMs: number;
  let overtime = false;
  let overtimeMs = 0;
  if (st.running && st.endAt != null) {
    remainingMs = Math.max(0, st.endAt - nowMs);
    if (st.finished && nowMs >= st.endAt) {
      overtime = true;
      overtimeMs = nowMs - st.endAt;
    }
  } else {
    remainingMs = Math.max(0, st.remainingMs);
  }
  const warning = st.running && !st.finished &&
    remainingMs > 0 && remainingMs <= prefs.warn_sec * 1000;
  const totalMs = Math.max(1, st.totalMs);
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
  return { remainingMs, warning, overtime, overtimeMs, progress };
}

/** 点阵文本：字符全部在字模内才可用，否则降级 '00:00'（Python _dot_text） */
export function dotText(remainingSec: number): string {
  const text = fmt(remainingSec);
  return [...text].every((ch) => ch in DOT_PATTERNS) ? text : '00:00';
}

/** 冒号闪烁：运行中按秒节拍半周期明灭，停止时常亮（Python _colon_on） */
export function colonOn(st: TimerState, warning: boolean, t: number): boolean {
  return (!warning && st.running && (t % 1.0) < 0.5) || !st.running;
}
