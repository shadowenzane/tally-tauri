// 全局快捷键（tauri-plugin-global-shortcut）：录制格式与注册格式互转 + 焦点守卫

import { useEffect, useRef } from 'react';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';

export type HotkeyAction = 'start' | 'pause' | 'reset' | 'reset_start';
export type HotkeyHandlers = Record<HotkeyAction, () => void>;

/** 存储格式 'Ctrl+Alt+S' → Tauri 注册格式 'CmdOrCtrl+Alt+S'（Qt 在 macOS 上 Ctrl 即 Cmd） */
export function toTauriSeq(seq: string): string {
  return seq.trim().split('+').filter(Boolean)
    .map((p) => (p === 'Ctrl' ? 'CmdOrCtrl' : p))
    .join('+');
}

/** 键盘事件 → 存储格式（Meta/Cmd 归一为 Ctrl；单键如 F8 原样） */
export function seqFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift') return '';
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

/** 焦点守卫：输入类控件聚焦时让位（录制/输入冲突） */
export function focusGuard(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    tag === 'BUTTON' || el.isContentEditable;
}

/** 全量重注册（先清空）；空序列 = 停用 */
export async function applyHotkeys(
  hotkeys: Record<string, string>,
  handlers: HotkeyHandlers,
): Promise<void> {
  try { await unregisterAll(); } catch { /* 无已注册项 */ }
  for (const act of Object.keys(handlers) as HotkeyAction[]) {
    const seq = hotkeys[act] ?? '';
    if (!seq.trim()) continue;
    try {
      await register(toTauriSeq(seq), () => {
        if (focusGuard()) return;
        handlers[act]();
      });
    } catch {
      /* 序列非法或被系统占用：跳过该项 */
    }
  }
}

/** React 绑定：hotkeys 变更时自动重注册（handlers 经 ref 保持最新） */
export function useGlobalHotkeys(
  hotkeys: Record<string, string>,
  handlers: HotkeyHandlers,
): void {
  const hRef = useRef(handlers);
  hRef.current = handlers;
  const key = JSON.stringify(hotkeys);
  useEffect(() => {
    void applyHotkeys(hotkeys, {
      start: () => hRef.current.start(),
      pause: () => hRef.current.pause(),
      reset: () => hRef.current.reset(),
      reset_start: () => hRef.current.reset_start(),
    });
    return () => { void unregisterAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
