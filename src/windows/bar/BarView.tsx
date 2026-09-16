// 流光灯条显示窗口：贴屏幕边缘单边 / 环绕整圈，鼠标穿透
//（移植自 tally/windows.py BarWindow 的 place / paintEvent 收尾）

import { useEffect, useRef } from 'react';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { getMonitorSafe, monitorWorkAreaLogical, useDisplayWindow } from '../useDisplayWindow';
import type { Frame, Prefs } from '../../shared/types';
import { aroundGeom, computeBarGeometry, paintBarAround, paintBarEdge } from '../../render/bar';
import { paintOvertimeCard } from '../../shared/effects';

/** 重摆窗口（Python place 移植）：按 边/长度/偏移/粗细 计算几何并应用（逻辑像素） */
async function placeBar(prefs: Prefs): Promise<void> {
  const mon = await getMonitorSafe();
  if (!mon) return;
  const geom = computeBarGeometry(prefs.bar, monitorWorkAreaLogical(mon));
  const win = getCurrentWindow();
  await win.setPosition(new LogicalPosition(geom.x, geom.y));
  await win.setSize(new LogicalSize(geom.w, geom.h));
}

export default function BarView() {
  // 定位 key：相同则跳过；变化时防抖 150ms 再摆窗
  //（拖动长度/粗细等滑杆时事件密集，逐次 setPosition/setSize 的 IPC
  //  叠加 macOS 窗口重排开销会造成严重卡顿）
  const placeKeyRef = useRef('');
  const placeTimerRef = useRef<number | null>(null);
  const pendingPrefsRef = useRef<Prefs | null>(null);
  const schedulePlace = (prefs: Prefs, delay = 150): void => {
    pendingPrefsRef.current = prefs;
    if (placeTimerRef.current !== null) window.clearTimeout(placeTimerRef.current);
    placeTimerRef.current = window.setTimeout(() => {
      placeTimerRef.current = null;
      const p = pendingPrefsRef.current;
      if (p) void placeBar(p).catch(() => {});
    }, delay);
  };
  useEffect(() => () => {
    if (placeTimerRef.current !== null) window.clearTimeout(placeTimerRef.current);
  }, []);

  // ---- 每帧绘制（Python BarWindow.paintEvent 收尾部分）----
  const paint = (f: Frame): void => {
    const { ctx, w, h, t, prefs, view } = f;
    const bp = prefs.bar;

    // [帧内任务] 定位：key = (edge, length, offset, thickness) 变化时防抖重摆
    const key = `${bp.edge}|${bp.length}|${bp.offset}|${bp.thickness}`;
    if (key !== placeKeyRef.current) {
      placeKeyRef.current = key;
      schedulePlace(prefs);
    }

    // 灯条主体：环绕 / 单边
    if (bp.edge === 'around') paintBarAround(f);
    else paintBarEdge(f);

    // 超时：文字悬浮于轨道上（无边框透明底）；贴左/右边缘时纵行排列
    if (view.overtime) {
      const fh = bp.overtime_size;
      if (bp.edge === 'around') {
        // 环绕轨道顶部中点（aroundGeom 的 ry）
        const margin = bp.thickness * 2 + 18;
        const g = aroundGeom(w, h, margin, bp.thickness);
        paintOvertimeCard(ctx, prefs, t, view.overtimeMs / 1000, w, h, {
          fh, anchor: [w / 2, g.ry], vertical: false, plain: true,
        });
      } else {
        // 单边窄条：窗口中心即轨道
        paintOvertimeCard(ctx, prefs, t, view.overtimeMs / 1000, w, h, {
          fh, anchor: null, vertical: bp.edge === 'left' || bp.edge === 'right', plain: true,
        });
      }
    }
  };

  const canvasRef = useDisplayWindow(paint, { maxDpr: 1.5 });

  // ---- 挂载：鼠标穿透（灯条不拦截任何点击）----
  useEffect(() => {
    try {
      void getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
    } catch { /* 窗口销毁竞态 */ }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' }}
    />
  );
}
