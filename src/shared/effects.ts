// 绘制效果层：闪烁引擎 / 流光色彩 / 超时卡片（移植自 tally/effects.py）

import type { Prefs } from './types';
import { WARN_COLOR, rgba, hsla } from './color';
import { fmt } from './view';
import { roundRectPath } from './canvas';

export interface Colored {
  hex: string;      // 颜色 hex
  alpha: number;    // 0..255（与 Python QColor.alpha 对齐）
}

/** 超时文字颜色：按全局闪烁模式闪烁（红为主） */
export function overtimeFill(prefs: Prefs, t: number): Colored {
  const ph = (t * prefs.blink_hz) % 1.0;
  const m = prefs.blink_mode;
  if (m === 'color') {
    return ph < 0.5 ? { hex: WARN_COLOR, alpha: 255 } : { hex: '#FFCD3C', alpha: 255 };
  }
  if (m === 'breathe') {
    return { hex: WARN_COLOR, alpha: Math.round(140 + 115 * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph))) };
  }
  if (m === 'flash') {
    return { hex: WARN_COLOR, alpha: ph < 0.5 ? 255 : 90 };
  }
  const wv = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);      // pulse
  return { hex: WARN_COLOR, alpha: Math.round(180 + 75 * wv) };
}

/** 流光亮度呼吸：主呼吸(0.38Hz) + 高频微颤(1.6Hz) 双频叠加，约 [0.60, 1.0]×base */
export function shimmerAlpha(t: number, base: number): number {
  const main = 0.5 - 0.5 * Math.cos(2 * Math.PI * 0.38 * t);
  const fine = 0.5 - 0.5 * Math.cos(2 * Math.PI * 1.6 * t);
  return Math.max(0, Math.min(255, Math.round(base * (0.60 + 0.28 * main + 0.12 * fine))));
}

/** 流光专用色：色相随时间缓慢旋转、头尾错开形成彩虹拖尾，亮度带双频呼吸。
 *  k ∈ [0,1]：0 = 头部（最亮），1 = 尾部（最暗） */
export function shimmerColor(t: number, k: number, baseAlpha: number): string {
  const main = 0.5 - 0.5 * Math.cos(2 * Math.PI * 0.38 * t);
  const fine = 0.5 - 0.5 * Math.cos(2 * Math.PI * 1.6 * t);
  const breath = 0.60 + 0.28 * main + 0.12 * fine;
  const hue = (t * 34 + (1.0 - k) * 75) % 360;
  const a = Math.round(baseAlpha * (1 - 0.72 * k) * breath);
  return hsla(hue, 205, Math.round(198 - 42 * k), Math.max(0, Math.min(255, a)) / 255);
}

/** 统一闪烁引擎：返回调制后的颜色（pulse 缩放由 blinkScale 处理） */
export function applyBlink(c: Colored, prefs: Prefs, t: number, warning: boolean): Colored {
  if (!warning) return c;
  const ph = (t * prefs.blink_hz) % 1.0;
  const m = prefs.blink_mode;
  if (m === 'breathe') {
    return { hex: c.hex, alpha: Math.round(c.alpha * (1 - 0.86 * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph)))) };
  }
  if (m === 'flash') {
    return ph >= 0.5 ? { hex: c.hex, alpha: Math.round(c.alpha * 0.08) } : c;
  }
  if (m === 'color') {
    return ph >= 0.5 ? { hex: WARN_COLOR, alpha: c.alpha } : c;
  }
  return c;
}

/** pulse 模式的缩放心跳 */
export function blinkScale(prefs: Prefs, t: number, warning: boolean): number {
  if (warning && prefs.blink_mode === 'pulse') {
    const ph = (t * prefs.blink_hz) % 1.0;
    return 1 + 0.10 * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph));
  }
  return 1;
}

export interface OvertimeCardOpts {
  vertical?: boolean;            // 贴左/右边缘时纵行排列
  fh?: number;                   // 基准字号
  anchor?: [number, number] | null;  // 卡片中心；null = 窗口中心
  plain?: boolean;               // 无背景无边框（纯文字悬浮）
}

/** 超时卡片：小字"您已超时"在正计时上方；窗口过小时自动缩小 */
export function paintOvertimeCard(
  ctx: CanvasRenderingContext2D,
  prefs: Prefs,
  t: number,
  elapsedSec: number,
  w: number,
  h: number,
  opts: OvertimeCardOpts = {},
): void {
  const vertical = opts.vertical ?? false;
  const plain = opts.plain ?? false;
  let fh = opts.fh ?? 22.0;
  const label = '您已超时';
  const tstr = fmt(elapsedSec);
  let fill = overtimeFill(prefs, t);
  if (plain) {
    fill = { hex: fill.hex, alpha: Math.min(255, fill.alpha + 55) };
  }

  const build = (fh_: number) => {
    const fsPx = Math.max(10, Math.round(fh_ * 0.62));
    const fs = `bold ${fsPx}px sans-serif`;
    const ft = `bold ${Math.round(fh_)}px sans-serif`;
    let cw: number, ch: number;
    if (vertical) {
      const cellS = fh_ * 0.62 * 1.22, cellT = fh_ * 1.12;
      ch = 4 * cellS + fh_ * 0.42 + tstr.length * cellT + fh_ * 0.66;
      cw = fh_ * 2.0;
    } else {
      ctx.font = fs;
      const wl = ctx.measureText(label).width;
      ctx.font = ft;
      const wt = ctx.measureText(tstr).width;
      cw = Math.max(wl, wt) + fh_ * 1.5;
      ch = fh_ * 0.62 + fh_ * 1.18 + fh_ * 0.72;
    }
    return { fs, ft, cw, ch };
  };

  let { fs, ft, cw, ch } = build(fh);
  for (let i = 0; i < 8; i++) {                     // 窗口过小则自动缩放
    if (cw <= w - 8 && ch <= h - 8) break;
    fh *= 0.85;
    ({ fs, ft, cw, ch } = build(fh));
  }
  const [cx, cy] = opts.anchor ?? [w / 2, h / 2];
  const bx = Math.max(4, Math.min(cx - cw / 2, w - cw - 4));
  const by = Math.max(4, Math.min(cy - ch / 2, h - ch - 4));

  ctx.save();
  const fillCss = rgba(fill.hex, fill.alpha / 255);
  if (!plain) {
    ctx.fillStyle = 'rgba(20,12,10,0.88)';
    const r = Math.min(cw, ch) / 2;
    ctx.beginPath();
    roundRectPath(ctx, bx, by, cw, ch, r);
    ctx.fill();
    ctx.strokeStyle = fillCss;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const labCss = rgba(fill.hex, (fill.alpha * 0.88) / 255);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    let y = by + fh * 0.33;
    ctx.font = fs;
    ctx.fillStyle = labCss;
    for (const c of label) {
      ctx.fillText(c, bx + cw / 2, y + fh * 0.62 * 0.61);
      y += fh * 0.62 * 1.22;
    }
    y += fh * 0.42;
    ctx.font = ft;
    ctx.fillStyle = fillCss;
    for (const c of tstr) {
      ctx.fillText(c, bx + cw / 2, y + fh * 1.12 * 0.5);
      y += fh * 1.12;
    }
  } else {
    ctx.font = fs;
    ctx.fillStyle = labCss;
    ctx.fillText(label, bx + cw / 2, by + (fh * 0.62 + fh * 0.22) * 0.5);
    ctx.font = ft;
    ctx.fillStyle = fillCss;
    ctx.fillText(tstr, bx + cw / 2, by + fh * 0.62 + fh * 0.26 + (fh * 1.18) * 0.5);
  }
  ctx.restore();
}
