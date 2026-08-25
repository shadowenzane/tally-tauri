// LED 数码管时钟：四种样式（经典斜切 / 圆润胶囊 / 点阵 LED / 复古面板）
//（移植自 tally/windows.py ClockWindow._paint_led / _seg_shape / _led_seg / _led_char_dots，
//  数值常量与 Python 源逐行对齐）

import type { Frame } from '../shared/types';
import { SEG_PATTERNS, SEG_RECTS, LED_DOT_PATTERNS } from '../shared/types';
import { WARN_COLOR, rgba } from '../shared/color';
import { applyBlink } from '../shared/effects';
import type { Colored } from '../shared/effects';
import { fmt, colonOn } from '../shared/view';
import { fillEllipse, roundRectPath } from '../shared/canvas';

/** 简单矩形（对应 QRectF 的 left/top/width/height） */
interface Rect {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** QRectF.adjusted(dx1, dy1, dx2, dy2)：四边各自偏移后的新矩形 */
function adjusted(rc: Rect, dx1: number, dy1: number, dx2: number, dy2: number): Rect {
  return { left: rc.left + dx1, top: rc.top + dy1, w: rc.w - dx1 + dx2, h: rc.h - dy1 + dy2 };
}

/** 横段/竖段的平行四边形路径点（数码管斜切灯条）——对应 _seg_shape */
function segShape(rc: Rect, kind: 'h' | 'v', skew: number): [number, number][] {
  if (kind === 'h') {
    const s = rc.h * skew;
    return [
      [rc.left + s, rc.top],
      [rc.left + rc.w - s, rc.top],
      [rc.left + rc.w, rc.top + rc.h],
      [rc.left, rc.top + rc.h],
    ];
  }
  const s = rc.w * skew;
  return [
    [rc.left, rc.top + s],
    [rc.left + rc.w, rc.top],
    [rc.left + rc.w, rc.top + rc.h - s],
    [rc.left, rc.top + rc.h],
  ];
}

/** 按 segShape 的点数组描路径（moveTo/lineTo/closePath）并填充 */
function fillSeg(
  ctx: CanvasRenderingContext2D,
  rc: Rect,
  kind: 'h' | 'v',
  skew: number,
  fill: string,
): void {
  const pts = segShape(rc, kind, skew);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 单段灯条绘制：经典斜切 / 圆润胶囊（面板样式复用经典斜切）——对应 _led_seg */
function ledSeg(
  ctx: CanvasRenderingContext2D,
  style: string,
  rct: Rect,
  kind: 'h' | 'v',
  color: Colored,
  lit: boolean,
  th: number,   // 段厚度（Python 的 t = ch_h * 0.13）
  gf: number,   // 发光强度系数
): void {
  if (style === 'classic' || style === 'panel') {
    if (lit) {
      const po = th * 1.3 * (0.75 + 0.25 * gf);   // 外层光晕外扩随强度
      const pi = th * 0.55 * (0.80 + 0.20 * gf);  // 内层光晕
      fillSeg(ctx, adjusted(rct, -po, -po, po, po), kind, 0.9,
        rgba(color.hex, Math.min(255, Math.round(60 * gf)) / 255));
      fillSeg(ctx, adjusted(rct, -pi, -pi, pi, pi), kind, 0.9,
        rgba(color.hex, Math.min(255, Math.round(110 * gf)) / 255));
      fillSeg(ctx, rct, kind, 0.9, rgba(color.hex, color.alpha / 255));
      // 白色高光层：h 段高 0.42×全宽 / v 段全高×0.42 宽（居中）
      const hlH = rct.h * (kind === 'h' ? 0.42 : 1.0);
      const hlW = rct.w * (kind === 'h' ? 1.0 : 0.42);
      const ccx = rct.left + rct.w / 2;
      const ccy = rct.top + rct.h / 2;
      fillSeg(ctx, { left: ccx - hlW / 2, top: ccy - hlH / 2, w: hlW, h: hlH }, kind, 0.9,
        rgba('#FFFFFF', 120 / 255));
    } else {
      fillSeg(ctx, rct, kind, 0.9, rgba(color.hex, 26 / 255));
    }
  } else if (style === 'capsule') {
    const rad = Math.min(rct.w, rct.h) / 2;
    const pad = rad * 0.9 * (0.8 + 0.2 * gf);
    if (lit) {
      const outer = adjusted(rct, -pad, -pad, pad, pad);
      ctx.fillStyle = rgba(color.hex, Math.min(255, Math.round(75 * gf)) / 255);
      ctx.beginPath();
      roundRectPath(ctx, outer.left, outer.top, outer.w, outer.h, rad + pad);
      ctx.fill();
      ctx.fillStyle = rgba(color.hex, color.alpha / 255);
      ctx.beginPath();
      roundRectPath(ctx, rct.left, rct.top, rct.w, rct.h, rad);
      ctx.fill();
      // 内缩白色高光胶囊
      const inR = rad * 0.42;
      const shrink = rad * 0.55;
      const inner = adjusted(rct, shrink, shrink, -shrink, -shrink);
      ctx.fillStyle = rgba('#FFFFFF', 95 / 255);
      ctx.beginPath();
      roundRectPath(ctx, inner.left, inner.top, inner.w, inner.h, inR);
      ctx.fill();
    } else {
      ctx.fillStyle = rgba(color.hex, 24 / 255);
      ctx.beginPath();
      roundRectPath(ctx, rct.left, rct.top, rct.w, rct.h, rad);
      ctx.fill();
    }
  }
}

/** 点阵 LED 样式：单字符 4x7 圆点阵，亮点带光晕、灭点留暗点——对应 _led_char_dots */
function ledCharDots(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  chW: number,
  chH: number,
  color: Colored,
  gf: number,
): void {
  const pat = LED_DOT_PATTERNS[ch];
  if (!pat) {
    return;
  }
  const cols = 4;
  const rows = 7;
  const cell = Math.min(chW / (cols + 1.2), chH / (rows + 0.6));
  const dr = cell * 0.40;
  const gx = x + (chW - (cols - 1) * cell) / 2;
  const gy = y + (chH - (rows - 1) * cell) / 2;
  const hr = dr * (1.0 + 0.8 * gf);   // 光晕半径随强度
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = gx + c * cell;
      const py = gy + r * cell;
      if (pat[r][c] === '1') {
        ctx.fillStyle = rgba(color.hex, Math.min(255, Math.round(70 * gf)) / 255);
        fillEllipse(ctx, px, py, hr, hr);          // 光晕
        ctx.fillStyle = rgba(color.hex, color.alpha / 255);
        fillEllipse(ctx, px, py, dr, dr);          // 本体
        if (gf > 1.35) {                           // 高强度时加白色亮芯
          ctx.fillStyle = rgba('#FFFFFF',
            Math.min(200, Math.round(90 * (gf - 1.35) / 1.25)) / 255);
          fillEllipse(ctx, px, py, dr * 0.45, dr * 0.45);
        }
      } else {
        ctx.fillStyle = rgba(color.hex, 22 / 255); // 灭点留暗点
        fillEllipse(ctx, px, py, dr * 0.55, dr * 0.55);
      }
    }
  }
}

export function paintLed(f: Frame): void {
  const { ctx, w, h, t } = f;
  const cp = f.prefs.clock;
  const style = cp.led_style;
  const gf = Math.max(0.0, Math.min(2.6, cp.glow / 100.0));   // 发光强度系数
  const text = fmt(f.view.remainingMs / 1000);
  const rect: Rect = { left: 10, top: 8, w: w - 20, h: h - 16 };
  const n = text.length;

  // 数字色：经全局闪烁引擎调制；已到 0（超时）恒为警示红
  const color: Colored = f.st.finished
    ? { hex: WARN_COLOR, alpha: 255 }
    : applyBlink({ hex: cp.digit_color, alpha: 255 }, f.prefs, t, f.view.warning);

  // 字符高度自适应：总宽超出可用宽度时按 0.94 逐级缩小（对应 Python while ch_h > 14 循环）
  const totalOf = (chH: number): number => {
    const cw = chH * 0.58;
    const gp = chH * 0.30;
    const colw = chH * 0.26;
    let s = 0;
    for (const c of text) {
      s += c === ':' ? colw : cw;
    }
    return s + (n - 1) * gp;
  };
  let chH = rect.h;
  while (chH > 14) {
    if (totalOf(chH) <= rect.w) {
      break;
    }
    chH *= 0.94;
  }
  const chW = chH * 0.58;
  const gap = chH * 0.30;
  const colonW = chH * 0.26;
  const total = totalOf(chH);
  const th = chH * 0.13;   // 段厚度（Python 的 t）
  let x = (w - total) / 2;
  const y = rect.top + (rect.h - chH) / 2;
  const colon = colonOn(f.st, f.view.warning, t);

  ctx.save();

  // ---- 复古面板：设备外壳（渐变深色面板 + 双层描边）+ 斜体数字 ----
  if (style === 'panel') {
    const padX = chH * 0.34;
    const padY = chH * 0.24;
    const bezel: Rect = { left: x - padX, top: y - padY, w: total + padX * 2, h: chH + padY * 2 };
    const ba = Math.max(55, Math.min(240, Math.round(cp.bg_opacity * 1.6)));
    const grad = ctx.createLinearGradient(bezel.left, bezel.top, bezel.left, bezel.top + bezel.h);
    grad.addColorStop(0, rgba('#30323A', ba / 255));   // QColor(48, 50, 58, ba)
    grad.addColorStop(1, rgba('#0E0F14', ba / 255));   // QColor(14, 15, 20, ba)
    ctx.beginPath();
    roundRectPath(ctx, bezel.left, bezel.top, bezel.w, bezel.h, chH * 0.18);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = rgba('#000000', 150 / 255);      // 黑描边
    ctx.lineWidth = 2;
    ctx.stroke();
    const inner = adjusted(bezel, 1.5, 1.5, -1.5, -1.5);
    ctx.beginPath();
    roundRectPath(ctx, inner.left, inner.top, inner.w, inner.h, chH * 0.16);
    ctx.strokeStyle = rgba('#FFFFFF', 30 / 255);       // 内层白描边
    ctx.lineWidth = 1;
    ctx.stroke();
    // 斜体数字：绕面板中心水平剪切（对应 p.shear(-0.08, 0)）
    ctx.save();
    const cxp = x + total / 2;
    const cyp = y + chH / 2;
    ctx.translate(cxp, cyp);
    ctx.transform(1, 0, -0.08, 1, 0, 0);
    ctx.translate(-cxp, -cyp);
  }

  // ---- 逐字符绘制（冒号 / 点阵 LED / 七段管） ----
  for (const c of text) {
    if (c === ':') {
      const dotr = th * 0.9;
      for (const dy of [0.30, 0.64]) {
        let alpha = color.alpha;
        if (!colon) {
          alpha = Math.round(alpha * 0.15);   // 冒号熄灭：调暗
        }
        // 光晕（受发光强度调节）+ 本点
        ctx.fillStyle = rgba(color.hex, Math.min(255, Math.round(alpha * 0.35 * gf)) / 255);
        const gr = dotr * (1.1 + 1.0 * gf);
        fillEllipse(ctx, x + colonW / 2, y + chH * dy, gr, gr);
        ctx.fillStyle = rgba(color.hex, alpha / 255);
        fillEllipse(ctx, x + colonW / 2, y + chH * dy, dotr, dotr);
      }
      x += colonW + gap;
      continue;
    }
    if (style === 'dot') {
      ledCharDots(ctx, c, x, y, chW, chH, color, gf);
    } else {
      const segs = SEG_PATTERNS[c] ?? '';
      for (const s of Object.keys(SEG_RECTS)) {
        const [sx, sy, sw, sh, kind] = SEG_RECTS[s];
        const rct: Rect = { left: x + sx * chW, top: y + sy * chH, w: sw * chW, h: sh * chH };
        ledSeg(ctx, style, rct, kind, color, segs.includes(s), th, gf);
      }
    }
    x += chW + gap;
  }

  if (style === 'panel') {
    ctx.restore();   // 结束斜体剪切
  }
  ctx.restore();
}
