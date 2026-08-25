// 显示窗口共享 Hook：跨窗口状态订阅 + rAF 驱动的 Canvas 渲染胶水层
//（clock / bar / runner 三个显示窗口的公共部分；对应 Python 三个 Window 类的 ctrl 数据流）

import { useEffect, useRef, type RefObject } from 'react';
import { currentMonitor, primaryMonitor, type Monitor } from '@tauri-apps/api/window';
import type { Frame, Prefs, TimerState } from '../shared/types';
import { defaultPrefs } from '../shared/types';
import { deriveView } from '../shared/view';
import { announceReady, onPrefs, onState } from '../shared/protocol';

/**
 * 显示窗口共享渲染循环。
 * - 订阅 onState / onPrefs 写入 refs（不触发 React 重渲染）
 * - 挂载完成后 announceReady()，主窗口收到即回播现状（解决初始竞态）
 * - rAF 每帧：canvas 物理尺寸对齐窗口 × dpr → setTransform(dpr) → deriveView → paint(frame)
 * @param paint 每帧绘制回调（内部经 ref 转发，闭包永不过期）
 * @returns canvas 元素 ref，交给各视图的全屏 <canvas>
 */
export function useDisplayWindow(paint: (f: Frame) => void): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;                       // 每次渲染刷新回调，防止闭包过期

  const prefsRef = useRef<Prefs>(defaultPrefs());
  const stRef = useRef<TimerState>({
    running: false, finished: false, endAt: null, remainingMs: 0, totalMs: 0,
  });

  useEffect(() => {
    let disposed = false;
    const unlistens: Array<() => void> = [];
    // 订阅 Promise 晚于卸载到达时立即注销，避免泄漏
    const track = (p: Promise<() => void>): void => {
      void p
        .then((un) => { if (disposed) un(); else unlistens.push(un); })
        .catch(() => {});
    };
    track(onState((st) => { stRef.current = st; }));
    track(onPrefs((prefs) => { prefsRef.current = prefs; }));
    announceReady();

    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cw = Math.max(1, Math.round(w * dpr));
      const ch = Math.max(1, Math.round(h * dpr));
      // 仅尺寸变化时重设（重设 width/height 会清屏并重置状态）
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = performance.now() / 1000;
      const prefs = prefsRef.current;
      const st = stRef.current;
      const view = deriveView(st, prefs, Date.now());
      paintRef.current({ ctx, w, h, t, prefs, st, view });
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const un of unlistens) {
        try { un(); } catch { /* 窗口销毁竞态 */ }
      }
    };
  }, []);

  return canvasRef;
}

/** 取窗口所在显示器（无则主屏）；失败/权限缺失返回 null，不抛错 */
export async function getMonitorSafe(): Promise<Monitor | null> {
  try {
    const m = await currentMonitor();
    if (m) return m;
  } catch { /* 忽略竞态 */ }
  try {
    return await primaryMonitor();
  } catch {
    return null;
  }
}

/** 显示器工作区（无 workArea 字段时退回 position+size），换算为逻辑像素。
 *  对应 Python 的 QApplication.primaryScreen().availableGeometry()。 */
export function monitorWorkAreaLogical(mon: Monitor): {
  x: number; y: number; width: number; height: number;
} {
  const sf = mon.scaleFactor || 1;
  const wa = mon.workArea ?? { position: mon.position, size: mon.size };
  return {
    x: wa.position.x / sf,
    y: wa.position.y / sf,
    width: wa.size.width / sf,
    height: wa.size.height / sf,
  };
}
