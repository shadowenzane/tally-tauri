// 跑动精灵显示窗口：全屏透明覆盖层，自绘精灵沿屏幕边缘奔跑，鼠标完全穿透
//（移植自 tally/windows.py RunnerWindow 的 place / paintEvent 主体）

import { useEffect } from 'react';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { getMonitorSafe, monitorWorkAreaLogical, useDisplayWindow } from '../useDisplayWindow';
import type { Frame } from '../../shared/types';
import {
  arcFor, perFor, posAt, paintBrushTrail, paintTrail,
} from '../../render/trail';
import { SPRITES, paintWarningGlow } from '../../render/sprites';
import { paintOvertimeCard } from '../../shared/effects';

/** 全屏定位（Python place 移植）：铺满显示器工作区（逻辑像素） */
async function placeRunner(): Promise<void> {
  const mon = await getMonitorSafe();
  if (!mon) return;
  const wa = monitorWorkAreaLogical(mon);
  const win = getCurrentWindow();
  await win.setPosition(new LogicalPosition(wa.x, wa.y));
  await win.setSize(new LogicalSize(wa.width, wa.height));
}

export default function RunnerView() {
  // ---- 每帧绘制（Python RunnerWindow.paintEvent 主体移植）----
  const paint = (f: Frame): void => {
    const { ctx, w, h, t, prefs, view } = f;
    const rp = prefs.runner;
    const inset = rp.size / 2 + 4;                 // 内缩路径：精灵完整贴边不被裁切
    const per = perFor(rp.edge, w, h, inset);      // 路径总长
    const arc = arcFor(prefs, view, per);          // 当前圈弧长参数

    // 1. 剩余路径流光：毛笔尾迹（头部饱满圆润，向尾尖收窄渐隐）
    paintBrushTrail(ctx, prefs, per, arc, w, h, inset, t);
    // 2. 路径样式：豆子/虚线/线条/水滴/圆点（当前圈内已跑过的不绘制）
    paintTrail(ctx, prefs, per, arc, w, h, inset);

    // 3. 精灵位置 + 临近结束警示光晕（本体恒定不变，仅光晕闪烁）
    const pos = posAt(rp.edge, arc, w, h, inset);
    paintWarningGlow(ctx, prefs, pos.x, pos.y, rp.size, t, view.warning);

    // 4. 精灵本体（弹跳/咀嚼频率随速度加快）
    const painter = SPRITES[rp.kind] || SPRITES.pacman;
    painter({
      ctx,
      x: pos.x,
      y: pos.y,
      angle: pos.angle,
      size: rp.size,
      t,
      animHz: Math.min(8, 2 + 1.5 * rp.speed),
      finished: view.overtime,
    });

    // 5. 超时：文字悬浮于奔跑轨道上（无边框透明底）；贴左/右边缘时纵行排列
    if (view.overtime) {
      let anchor: [number, number];
      let vertical: boolean;
      if (rp.edge === 'left' || rp.edge === 'right') {
        anchor = [rp.edge === 'left' ? inset + 14 : w - inset - 14, h / 2];
        vertical = true;
      } else if (rp.edge === 'bottom') {
        anchor = [w / 2, h - inset];
        vertical = false;
      } else {                                      // around / top：顶部轨道中点
        anchor = [w / 2, inset];
        vertical = false;
      }
      paintOvertimeCard(ctx, prefs, t, view.overtimeMs / 1000, w, h, {
        fh: 19, anchor, vertical, plain: true,
      });
    }
  };

  const canvasRef = useDisplayWindow(paint, { maxDpr: 1.5 });

  // ---- 挂载：全屏定位 + 鼠标穿透 ----
  useEffect(() => {
    void placeRunner().catch(() => {});
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
