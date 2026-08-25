// 流光进度灯条渲染：贴屏幕边缘单边 / 环绕整圈（移植自 tally/windows.py 的 BarWindow）

import type { BarPrefs, Frame } from '../shared/types';
import { WARN_COLOR, rgba, hsla } from '../shared/color';
import { applyBlink, shimmerAlpha, shimmerColor } from '../shared/effects';
import type { Colored } from '../shared/effects';
import { roundRectPath, fillEllipse } from '../shared/canvas';

// ---------------- 窗口几何（Python place） ----------------

/** 灯条窗口几何 */
export interface BarGeometry {
  x: number; y: number;        // 窗口左上角（屏幕坐标）
  w: number; h: number;        // 窗口尺寸
  margin: number;              // 环绕模式下窗口超出屏幕的余量（单边为 0，对应 Python _margin）
}

/** 根据 边/长度/偏移/粗细 计算窗口几何。
 *  单边模式：灯条沿该边居中；偏移 = 灯条中心离该边缘的距离（0% 贴边，100% 移到屏幕中央）。
 *  环绕模式：窗口覆盖全屏 + 四周余量，灯条沿屏幕四周成圈。 */
export function computeBarGeometry(
  bp: BarPrefs,
  mon: { x: number; y: number; width: number; height: number },
): BarGeometry {
  const margin = bp.thickness * 2 + 18;             // 光晕余量
  if (bp.edge === 'around') {
    return {
      x: mon.x - margin,
      y: mon.y - margin,
      w: mon.width + margin * 2,
      h: mon.height + margin * 2,
      margin,
    };
  }
  const off = Math.max(0, Math.min(100, bp.offset)) / 100.0;
  const horizontal = bp.edge === 'top' || bp.edge === 'bottom';
  if (horizontal) {
    const full = Math.round((mon.width * bp.length) / 100);
    const w = full + margin * 2;
    const h = bp.thickness + margin * 2;
    // 沿边（水平方向）始终居中
    const x = Math.round(mon.x + (mon.width - full) / 2) - margin;
    // 垂直方向：贴边中心线 → 屏幕中心，随偏移移动
    // 0% 时灯条紧贴屏幕边缘（中心 = 边缘 + 半厚度 + 2px 微距）
    // 注：QRect.bottom() = y + height - 1，此处自行换算，不直接用 mon.bottom
    const edgeC = bp.edge === 'top'
      ? mon.y + bp.thickness / 2 + 2
      : mon.y + mon.height - 1 + 1 - bp.thickness / 2 - 2;
    const centerC = mon.y + mon.height / 2;
    const c = edgeC + (centerC - edgeC) * off;
    const y = Math.round(c - h / 2);
    return { x, y, w, h, margin: 0 };
  }
  const full = Math.round((mon.height * bp.length) / 100);
  const w = bp.thickness + margin * 2;
  const h = full + margin * 2;
  // 沿边（垂直方向）始终居中
  const y = Math.round(mon.y + (mon.height - full) / 2) - margin;
  // 水平方向：贴边中心线 → 屏幕中心，随偏移移动（QRect.right() = x + width - 1）
  const edgeC = bp.edge === 'left'
    ? mon.x + bp.thickness / 2 + 2
    : mon.x + mon.width - 1 + 1 - bp.thickness / 2 - 2;
  const centerC = mon.x + mon.width / 2;
  const c = edgeC + (centerC - edgeC) * off;
  const x = Math.round(c - w / 2);
  return { x, y, w, h, margin: 0 };
}

// ---------------- 环绕模式：圆角矩形中线参数化（Python _around_geom / _around_point） ----------------

/** 环绕中线几何（顺时针，从顶边左端圆弧后起点出发） */
export interface AroundGeom {
  rx: number; ry: number;      // 中线圆角矩形左上角
  rw: number; rh: number;      // 中线圆角矩形尺寸
  rr: number;                  // 圆角半径
  sh: number; sv: number;      // 横/竖直线段长
  arc: number;                 // 四分之一弧长
  per: number;                 // 周长
}

/** 环绕中线几何：thickness/2+8 内缩 + margin 余量，圆角上限 48 */
export function aroundGeom(w: number, h: number, margin: number, thickness: number): AroundGeom {
  const ci = thickness / 2 + 8;                     // 中线距屏幕边的内缩
  const rx = margin + ci;
  const ry = margin + ci;
  const rw = w - 2 * (margin + ci);
  const rh = h - 2 * (margin + ci);
  const rr = Math.min(48.0, Math.min(rw, rh) * 0.18);
  const sh = rw - 2 * rr;                           // 横直线段长
  const sv = rh - 2 * rr;                           // 竖直线段长
  const arc = (Math.PI * rr) / 2;                   // 四分之一弧长
  const per = 2 * (sh + sv) + 2 * Math.PI * rr;
  return { rx, ry, rw, rh, rr, sh, sv, arc, per };
}

/** 周长参数 s → 中线坐标（顺时针；公式照搬 Python，弧角为屏幕系数学角） */
export function aroundPoint(g: AroundGeom, s: number): { x: number; y: number } {
  const { rx, ry, rw, rh, rr, sh, sv, arc, per } = g;
  // Python `s %= per` 结果非负；JS % 保留符号，这里归一（正常入参均为非负）
  s = ((s % per) + per) % per;
  const l1 = sh;                   // 顶边直线
  const a1 = l1 + arc;             // 右上弧
  const l2 = a1 + sv;              // 右边直线
  const a2 = l2 + arc;             // 右下弧
  const l3 = a2 + sh;              // 底边直线
  const a3 = l3 + arc;             // 左下弧
  const l4 = a3 + sv;              // 左边直线
  if (s < l1) {
    return { x: rx + rr + s, y: ry };
  }
  if (s < a1) {
    const t = (s - l1) / arc;
    const ang = ((-90 + 90 * t) * Math.PI) / 180;
    return { x: rx + rw - rr + rr * Math.cos(ang), y: ry + rr + rr * Math.sin(ang) };
  }
  if (s < l2) {
    return { x: rx + rw, y: ry + rr + (s - a1) };
  }
  if (s < a2) {
    const t = (s - l2) / arc;
    const ang = ((90 * t) * Math.PI) / 180;
    return { x: rx + rw - rr + rr * Math.cos(ang), y: ry + rh - rr + rr * Math.sin(ang) };
  }
  if (s < l3) {
    return { x: rx + rw - rr - (s - a2), y: ry + rh };
  }
  if (s < a3) {
    const t = (s - l3) / arc;
    const ang = ((90 + 90 * t) * Math.PI) / 180;
    return { x: rx + rr + rr * Math.cos(ang), y: ry + rh - rr + rr * Math.sin(ang) };
  }
  if (s < l4) {
    return { x: rx, y: ry + rh - rr - (s - a3) };
  }
  const t = (s - l4) / arc;
  const ang = ((180 + 90 * t) * Math.PI) / 180;
  return { x: rx + rr + rr * Math.cos(ang), y: ry + rr + rr * Math.sin(ang) };
}

/** 描边规格（color 已是 CSS 色串） */
export interface PenSpec {
  color: string;
  width: number;
}

/** 沿中线画 [s0, s1] 弧段（自适应分段数保证圆滑；圆头圆角笔） */
export function aroundPolyline(
  ctx: CanvasRenderingContext2D,
  g: AroundGeom,
  s0: number,
  s1: number,
  pen: PenSpec,
): void {
  let span = s1 >= s0 ? (s1 - s0) % g.per : s1 + g.per - s0;
  // 完整一圈（s0=0, s1=per）取模后退化为 0 → 还原为 per（Python 版此处为隐性缺陷，已修正）
  if (span === 0 && s1 !== s0) span = g.per;
  const n = Math.max(2, Math.min(400, Math.trunc(span / 6) + 2));
  ctx.beginPath();
  const p0 = aroundPoint(g, s0);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i <= n; i++) {
    const pi = aroundPoint(g, s0 + (span * i) / n);
    ctx.lineTo(pi.x, pi.y);
  }
  ctx.strokeStyle = pen.color;
  ctx.lineWidth = pen.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ---------------- 颜色调制（paintEvent 头部，单边/环绕共用） ----------------

/** 整体颜色调制：完成→警告红，经闪烁引擎，再乘全局不透明度（Python paintEvent 884-896 行） */
function modBarColor(f: Frame): Colored {
  const bp = f.prefs.bar;
  const finished = f.st.finished;
  const alpha = Math.round((255 * bp.opacity) / 100);
  const base: Colored = { hex: finished ? WARN_COLOR : bp.color, alpha: 255 };
  const mod = applyBlink(base, f.prefs, f.t, f.view.warning);
  return { hex: mod.hex, alpha: Math.round((mod.alpha * alpha) / 255) };
}

// ---------------- 单边绘制（paintEvent 单边分支） ----------------

/** 单边灯条：暗轨 + 亮段（剩余比例收缩）+ 光晕 + 流光彩虹带 */
export function paintBarEdge(f: Frame): void {
  const { ctx, w, h, t } = f;
  const bp = f.prefs.bar;
  const margin = bp.thickness * 2 + 18;

  // 调制色（亮段/光晕用）；暗轨用 bp.color 原色 × 全局 alpha
  const mod = modBarColor(f);
  const modColor = (): string => rgba(mod.hex, mod.alpha / 255);
  const alpha = Math.round((255 * bp.opacity) / 100);

  const horizontal = bp.edge === 'top' || bp.edge === 'bottom';
  let full: number, th: number, tx: number, ty: number;
  if (horizontal) {
    full = w - margin * 2;
    th = Math.min(bp.thickness, h - margin * 2);
    tx = margin;
    ty = (h - th) / 2;
  } else {
    full = h - margin * 2;
    th = Math.min(bp.thickness, w - margin * 2);
    tx = (w - th) / 2;
    ty = margin;
  }

  ctx.save();
  // 暗轨
  ctx.fillStyle = rgba(bp.color, Math.round(alpha * 0.16) / 255);
  ctx.beginPath();
  roundRectPath(ctx, tx, ty, full, th, th / 2);
  ctx.fill();

  // 亮段 = 剩余时间比例（从起点端向终点端收缩）
  const prog = f.view.progress;
  if (prog > 0.004) {
    const lw = horizontal ? full * prog : th;
    const lh = horizontal ? th : full * prog;
    // 光晕（外扩 th*0.9 的同心层）
    ctx.fillStyle = rgba(mod.hex, Math.round(mod.alpha * 0.22) / 255);
    ctx.beginPath();
    roundRectPath(ctx, tx - th * 0.9, ty - th * 0.9, lw + th * 1.8, lh + th * 1.8, th);
    ctx.fill();
    // 本体
    ctx.fillStyle = modColor();
    ctx.beginPath();
    roundRectPath(ctx, tx, ty, lw, lh, th / 2);
    ctx.fill();
    // 流光：双色彩虹带沿亮段周期扫过，亮度带呼吸
    const span = Math.max(1.0, horizontal ? lw : lh);
    const sweep = span * 0.35;
    const ph = ((t * 0.35) % 1.4) - 0.2;            // 周期性扫过，含停留
    const pos = ph * (span + sweep) - sweep;
    const off = Math.max(0, Math.min(span - sweep, pos));
    const grad = horizontal
      ? ctx.createLinearGradient(tx + off, 0, tx + off + sweep, 0)
      : ctx.createLinearGradient(0, ty + off, 0, ty + off + sweep);
    const hue1 = Math.trunc((t * 34) % 360);
    const hue2 = (hue1 + 115) % 360;
    const sa = shimmerAlpha(t, 132);
    grad.addColorStop(0.0, hsla(hue1, 205, 192, 0));
    grad.addColorStop(0.35, hsla(hue1, 205, 192, sa / 255));
    grad.addColorStop(0.65, hsla(hue2, 205, 192, sa / 255));
    grad.addColorStop(1.0, hsla(hue2, 205, 192, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    roundRectPath(ctx, tx, ty, lw, lh, th / 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------- 环绕绘制（Python _paint_around） ----------------

/** 环绕模式：整圈暗轨 + 亮段（剩余时间占比）顺时针收缩 + 流光扫过 + 起点标记 */
export function paintBarAround(f: Frame): void {
  const { ctx, w, h, t } = f;
  const bp = f.prefs.bar;
  const margin = bp.thickness * 2 + 18;
  const g = aroundGeom(w, h, margin, bp.thickness);
  const th = bp.thickness;
  const alpha = Math.round((255 * bp.opacity) / 100);

  // 调制色（亮段/光晕/超时底用）；暗轨用 bp.color 原色 × 全局 alpha
  const mod = modBarColor(f);
  const modColor = (): string => rgba(mod.hex, mod.alpha / 255);

  ctx.save();
  // 整圈暗轨
  ctx.beginPath();
  roundRectPath(ctx, g.rx, g.ry, g.rw, g.rh, g.rr);
  ctx.strokeStyle = rgba(bp.color, Math.round(alpha * 0.16) / 255);
  ctx.lineWidth = th;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 亮段：剩余时间占比，从起点（偏移）顺时针收缩；超时后整圈保留流光
  const s0 = (g.per * bp.offset) / 100.0;
  const litLen = g.per * f.view.progress;
  const overtime = f.view.overtime;
  if (overtime && litLen < 2) {
    // 超时：整圈暗红底 + 流光持续绕圈扫过（动效保留）
    aroundPolyline(ctx, g, 0, g.per,
      { color: rgba(mod.hex, Math.round(mod.alpha * 0.30) / 255), width: th });
    const sweep = Math.max(60.0, g.per * 0.14);
    const pos = (((t * 0.35) % 1.4) - 0.2) * (g.per + sweep);
    for (let k = 0; k < 10; k++) {
      const a0 = Math.max(0.0, Math.min(g.per, pos + (sweep * (k + 1)) / 10));
      const a1 = Math.max(0.0, Math.min(g.per, pos + (sweep * k) / 10));
      if (a1 <= a0) continue;
      const wc = shimmerColor(t, (9 - k) / 10, 150);
      aroundPolyline(ctx, g, a0, a1, { color: wc, width: th * 0.66 });
    }
  } else if (litLen >= 2) {
    // 光晕层（更宽更淡）+ 本体
    aroundPolyline(ctx, g, s0, s0 + litLen + th * 0.6,
      { color: rgba(mod.hex, Math.round(mod.alpha * 0.25) / 255), width: th * 2.4 });
    aroundPolyline(ctx, g, s0, s0 + litLen, { color: modColor(), width: th });
    // 流光：彩虹拖尾段周期性沿亮段扫过
    const sweep = Math.max(24.0, litLen * 0.30);
    const ph = ((t * 0.35) % 1.4) - 0.2;
    const pos = ph * (litLen + sweep) - sweep;
    for (let k = 0; k < 8; k++) {
      const a0 = Math.max(0.0, Math.min(litLen, pos + (sweep * k) / 8));
      const a1 = Math.max(0.0, Math.min(litLen, pos + (sweep * (k + 1)) / 8));
      if (a1 <= a0) continue;
      const wc = shimmerColor(t, (7 - k) / 8, 158);
      aroundPolyline(ctx, g, s0 + a0, s0 + a1, { color: wc, width: th * 0.66 });
    }
  }

  // 起点标记（最后绘制、始终可见）：拖动"偏移"时标记即时移动
  const mpt = aroundPoint(g, s0);
  ctx.fillStyle = rgba('#FFFFFF', Math.round(alpha * 0.28) / 255);
  fillEllipse(ctx, mpt.x, mpt.y, th * 1.2, th * 1.2);
  ctx.fillStyle = rgba('#FFFFFF', Math.min(255, Math.round(alpha * 0.95)) / 255);
  const mr = Math.max(2.0, th * 0.28);
  fillEllipse(ctx, mpt.x, mpt.y, mr, mr);

  ctx.restore();
}
