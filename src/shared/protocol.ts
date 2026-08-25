// 跨窗口事件协议：主窗口为唯一发布方，显示窗口订阅

import { emit, listen } from '@tauri-apps/api/event';
import type { Prefs, TimerState } from './types';

export const EV_STATE = 'tally://state';   // 每 60ms 心跳 + 状态变更
export const EV_PREFS = 'tally://prefs';   // 设置变更（全量广播）
export const EV_READY = 'tally://ready';   // 显示窗口就绪 → 主窗口回播现状

export function broadcastState(st: TimerState): void {
  void emit(EV_STATE, st);
}

export function broadcastPrefs(prefs: Prefs): void {
  void emit(EV_PREFS, prefs);
}

/** 显示窗口挂载完成时调用；主窗口收到后回播 state+prefs（解决初始竞态） */
export function announceReady(): void {
  void emit(EV_READY, null);
}

export function onState(fn: (st: TimerState) => void): Promise<() => void> {
  return listen<TimerState>(EV_STATE, (e) => fn(e.payload));
}

export function onPrefs(fn: (prefs: Prefs) => void): Promise<() => void> {
  return listen<Prefs>(EV_PREFS, (e) => fn(e.payload));
}

/** 主窗口监听就绪信号（传回当前的 state 与 prefs） */
export function onReady(fn: () => void): Promise<() => void> {
  return listen(EV_READY, () => fn());
}
