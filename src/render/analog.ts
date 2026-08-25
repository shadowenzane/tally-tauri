// 圆环点阵时钟：60 点刻度环按剩余比例点亮 + 扫描拖尾 + 流光彩虹 + 中心数字
//（移植自 tally/windows.py ClockWindow._paint_analog，数值常量与 Python 源逐行对齐）

import type { Frame } from '../shared/types';
import { WARN_COLOR, rgba } from '../shared/color';
import { applyBlink, shimmerColor } from '../shared/effects';
import type { Colored } from '../shared/effects';
import { fmt } from '../shared/view';
import { fillEllipse, strokeLine } from '../shared/canvas';

const D2R = Math.PI / 180;   // 角度 → 弧度（对应 Python math.radians）

export function paintAnalog(f: Frame): void {
  const { ctx, w, h, t } = f;
  const cp = f.prefs.clock;
  // 数字色：经全局闪烁引擎调制；已到 0（超时）恒为警示红
  const color: Colored = f.st.finished
    ? { hex: WARN_COLOR, alpha: 255 }
    : applyBlink({ hex: cp.digit_color, alpha: 255 }, f.prefs, t, f.view.warning);

  const cx = w / 2;
  const cy = (h - 16) / 2;
  const r = Math.min(w, h - 16) / 2 - 12;
  if (r < 40) {
    return;
  }
  const frac = f.view.progress;   // 剩余时间占比（已钳制到 [0,1]）

  ctx.save();

  // ---- 刻度环：亮起的点 = 剩余时间比例（12 点方向顺时针） ----
  for (let i = 0; i < 60; i++) {
    const ang = (i * 6 - 90) * D2R;
    const lit = (i + 1) / 60 <= frac + 1e-9;
    const big = i % 5 === 0;
    const alpha = lit ? color.alpha : 36;        // 未亮点留下暗刻度
    const dr = big ? r * 0.055 : r * 0.028;
    ctx.fillStyle = rgba(color.hex, alpha / 255);
    fillEllipse(ctx, cx + r * Math.cos(ang), cy + r * Math.sin(ang), dr, dr);
  }

  const rr = r * 0.86;   // 拖尾/流光轨道半径

  // ---- 扫描拖尾（终点后方渐隐弧线，22 段） ----
  const steps = 22;
  const span = 46.0;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, r * 0.035);
  for (let k = 0; k < steps; k++) {
    const a0 = frac * 360 - span + (span * k) / steps;
    const a1 = a0 + span / steps + 0.6;          // +0.6° 段间重叠补缝
    ctx.strokeStyle = rgba(color.hex, Math.round(30 + (195 * k) / steps) / 255);
    strokeLine(ctx,
      cx + rr * Math.cos((a0 - 90) * D2R), cy + rr * Math.sin((a0 - 90) * D2R),
      cx + rr * Math.cos((a1 - 90) * D2R), cy + rr * Math.sin((a1 - 90) * D2R));
  }

  // ---- 流光：彩虹拖尾沿剩余弧段往返流动（未走完的行程） ----
  const litSpan = frac * 360;
  if (litSpan > 14) {
    const ph = (t * 0.22) % 2.0;
    const t01 = ph < 1.0 ? ph : 2.0 - ph;        // 三角波往返
    const head = t01 * litSpan;
    const tail = Math.min(50.0, litSpan * 0.35);
    ctx.lineWidth = Math.max(1.5, r * 0.03);
    for (let k = 0; k < 12; k++) {
      let a0 = head - (tail * (k + 1)) / 12;
      const a1 = head - (tail * k) / 12;
      if (a1 < 0) {
        continue;
      }
      a0 = Math.max(0.0, a0);
      ctx.strokeStyle = shimmerColor(t, k / 12, 168);
      strokeLine(ctx,
        cx + rr * Math.cos((a0 - 90) * D2R), cy + rr * Math.sin((a0 - 90) * D2R),
        cx + rr * Math.cos((a1 - 90) * D2R), cy + rr * Math.sin((a1 - 90) * D2R));
    }
  }

  // ---- 扫描端点光标（光晕 + 白心） ----
  const ea = (frac * 360 - 90) * D2R;
  const ex = cx + rr * Math.cos(ea);
  const ey = cy + rr * Math.sin(ea);
  ctx.fillStyle = rgba(color.hex, 80 / 255);
  fillEllipse(ctx, ex, ey, r * 0.11, r * 0.11);
  ctx.fillStyle = rgba('#FFFFFF', 1);
  fillEllipse(ctx, ex, ey, r * 0.045, r * 0.045);

  // ---- 中心数字：宽度超 r*1.5 时按 0.92 逐级缩号 ----
  const text = fmt(f.view.remainingMs / 1000);
  const family = cp.font_family || '"Helvetica Neue"';
  let fs = r * 0.30;
  while (fs > 8) {
    ctx.font = `bold ${Math.floor(fs)}px ${family}`;
    if (ctx.measureText(text).width <= r * 1.5) {
      break;
    }
    fs *= 0.92;
  }
  // 对应 Python drawText 居中矩形 (cx-r, cy-0.55r, 2r, 1.1r)：矩形中心恰为 (cx, cy)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(color.hex, color.alpha / 255);
  ctx.fillText(text, cx, cy);

  ctx.restore();
}
