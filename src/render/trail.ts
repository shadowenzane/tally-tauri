// 跑动精灵的路径几何与尾迹渲染（移植自 tally/windows.py 的 RunnerWindow）
// - perFor / arcFor / posAt / trailSegments：周长参数化路径几何（around 四周顺时针，左上角出发）
// - paintTrail：路径样式（豆子 / 虚线 / 线条 / 水滴 / 圆点；当前圈内已跑过的不绘制）
// - paintBrushTrail：剩余路径的毛笔流光尾迹（头部饱满圆润，向尾尖收窄渐隐）

import type { Prefs, RunnerPrefs } from '../shared/types';
import { rgba, hsla } from '../shared/color';
import { strokeLine, fillEllipse } from '../shared/canvas';

/** 路径总长 per：四周 = 整圈周长；left/right = 纵向边长；top/bottom = 横向边长（单边模式 speed 即趟数） */
export function perFor(edge: RunnerPrefs['edge'], w: number, h: number, inset: number): number {
  if (edge === 'around') return 2 * ((w - 2 * inset) + (h - 2 * inset));
  if (edge === 'left' || edge === 'right') return h - 2 * inset;
  return w - 2 * inset;
}

/** 当前圈弧长参数：elapsed = 1 - 剩余/总时长，arc = (elapsed × speed mod 1) × per */
export function arcFor(prefs: Prefs, view: { remainingMs: number }, per: number): number {
  const totalMs = prefs.total * 1000;
  const elapsed = 1 - (totalMs > 0 ? Math.max(0, view.remainingMs) / totalMs : 0);
  return ((elapsed * prefs.runner.speed) % 1.0) * per;
}

/** 周长参数 → 路径坐标 + 行进方向角（度，顺时针；对应 Python _pos_at） */
export function posAt(
  edge: RunnerPrefs['edge'],
  arc: number,
  w: number,
  h: number,
  inset: number,
): { x: number; y: number; angle: number } {
  if (edge === 'top') return { x: inset + arc, y: inset, angle: 0 };
  if (edge === 'bottom') return { x: inset + arc, y: h - inset, angle: 0 };
  if (edge === 'left') return { x: inset, y: inset + arc, angle: 90 };
  if (edge === 'right') return { x: w - inset, y: inset + arc, angle: 90 };
  // around：四周顺时针（top → right → bottom → left）
  const iw = w - 2 * inset;
  const ih = h - 2 * inset;
  const top = iw;
  const right = iw + ih;
  const bot = 2 * iw + ih;
  if (arc < top) return { x: inset + arc, y: inset, angle: 0 };
  if (arc < right) return { x: w - inset, y: inset + (arc - top), angle: 90 };
  if (arc < bot) return { x: w - inset - (arc - right), y: h - inset, angle: 180 };
  return { x: inset, y: inset + ih - (arc - bot), angle: 270 };
}

/** 未跑过的路径段 [a0, a1]；around 按四条边切分（每段长度 ≥1 才收），单边为一条线段（_trail_segments） */
export function trailSegments(
  edge: RunnerPrefs['edge'],
  per: number,
  eaten: number,
  w: number,
  h: number,
  inset: number,
): [number, number][] {
  const e = eaten < 0 ? 0 : eaten;
  if (e >= per) return [];
  if (edge !== 'around') return [[e, per]];
  const iw = w - 2 * inset;
  const ih = h - 2 * inset;
  const corners = [0, iw, iw + ih, 2 * iw + ih, per];
  const segs: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const lo = Math.max(corners[k], e);
    if (corners[k + 1] - lo >= 1) segs.push([lo, corners[k + 1]]);
  }
  return segs;
}

/** 路径样式：豆子/虚线/线条/水滴/圆点；当前圈内已跑过（含身位余量）的不绘制（_paint_trail） */
export function paintTrail(
  ctx: CanvasRenderingContext2D,
  prefs: Prefs,
  per: number,
  arc: number,
  w: number,
  h: number,
  inset: number,
): void {
  const rp = prefs.runner;
  const eaten = arc - rp.size * 0.3;
  const base = rp.trail_color;
  const sz = rp.trail_size;
  const op = Math.max(0, Math.min(1, rp.trail_opacity / 100));
  const wf = Math.max(0.3, Math.min(3, rp.trail_width / 100)); // 粗细倍率
  const gf = Math.max(0.3, Math.min(3, rp.trail_gap / 100));   // 间距倍率
  if (op <= 0.01) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (rp.trail === 'line') {
    // 连续线条：沿整圈路径描边（跑过段消失）
    ctx.lineWidth = Math.max(0.6, sz * 0.16 * wf);
    ctx.strokeStyle = rgba(base, Math.round(205 * op) / 255);
    for (const [a0, a1] of trailSegments(rp.edge, per, eaten, w, h, inset)) {
      const p0 = posAt(rp.edge, a0, w, h, inset);
      const p1 = posAt(rp.edge, a1, w, h, inset);
      strokeLine(ctx, p0.x, p0.y, p1.x, p1.y);
    }
  } else if (rp.trail === 'dash') {
    // 虚线：短划随粗细、空隔随间距，跑过段消失
    ctx.lineWidth = Math.max(0.8, sz * 0.22 * wf);
    ctx.strokeStyle = rgba(base, Math.round(215 * op) / 255);
    ctx.setLineDash([Math.max(2, sz * 0.7 * wf), Math.max(2, sz * 0.8 * gf)]);
    for (const [a0, a1] of trailSegments(rp.edge, per, eaten, w, h, inset)) {
      const p0 = posAt(rp.edge, a0, w, h, inset);
      const p1 = posAt(rp.edge, a1, w, h, inset);
      strokeLine(ctx, p0.x, p0.y, p1.x, p1.y);
    }
    ctx.setLineDash([]);
  } else {
    // 点状样式：豆子 / 水滴 / 圆点（间距随大小 × 间距倍率）
    const spacing0 = rp.trail === 'dots' ? sz * 7.0 : rp.trail === 'drop' ? sz * 2.6 : sz * 1.6;
    const spacing = Math.max(12, spacing0 * gf);
    const n = Math.max(8, Math.floor(per / spacing));
    for (let i = 0; i < n; i++) {
      const a = (per * i) / n;
      if (a <= eaten) continue;
      const pos = posAt(rp.edge, a, w, h, inset);
      if (rp.trail === 'dots') {
        // 经典豆子：每 1/4 圈一颗大豆
        const big = i % Math.max(1, Math.floor(n / 4)) === 0;
        ctx.fillStyle = rgba(base, Math.round(215 * op) / 255);
        const r = (big ? sz * 0.5 : sz * 0.32) * wf;
        fillEllipse(ctx, pos.x, pos.y, r, r);
      } else if (rp.trail === 'dot') {
        const r = sz * 0.42 * wf;
        ctx.fillStyle = rgba(base, Math.round(60 * op) / 255); // 小光晕
        fillEllipse(ctx, pos.x, pos.y, r * 1.8, r * 1.8);
        ctx.fillStyle = rgba(base, Math.round(235 * op) / 255); // 本体
        fillEllipse(ctx, pos.x, pos.y, r, r);
      } else {
        // drop 水滴：沿路径方向的泪滴形
        ctx.fillStyle = rgba(base, Math.round(225 * op) / 255);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((pos.angle * Math.PI) / 180);
        const L = sz * 0.62 * wf;
        ctx.beginPath();
        ctx.moveTo(L * 0.55, 0);
        ctx.bezierCurveTo(L * 0.35, -L * 0.34, -L * 0.25, -L * 0.30, -L * 0.25, 0);
        ctx.bezierCurveTo(-L * 0.25, L * 0.30, L * 0.35, L * 0.34, L * 0.55, 0);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

// 毛笔尾迹颜色：shimmerColor(t, kr, 96) 的 alpha 再乘笔锋淡出 (1-kr)^1.3。
// shimmerColor 返回 CSS 串无法二次改 alpha，故按 shared/effects.ts 的公式本地重算；
// 数值 alpha 存入 _brushAlpha，供 <4 跳过判断使用。
let _brushAlpha = 0;

function brushColor(t: number, kr: number): string {
  const main = 0.5 - 0.5 * Math.cos(2 * Math.PI * 0.38 * t);
  const fine = 0.5 - 0.5 * Math.cos(2 * Math.PI * 1.6 * t);
  const breath = 0.60 + 0.28 * main + 0.12 * fine;
  const hue = (t * 34 + (1.0 - kr) * 75) % 360;
  const a0 = Math.max(0, Math.min(255, Math.round(96 * (1 - 0.72 * kr) * breath)));
  _brushAlpha = Math.round(a0 * Math.pow(1 - kr, 1.3)); // 笔锋淡出
  return hsla(hue, 205, Math.round(198 - 42 * kr), Math.max(0, Math.min(255, _brushAlpha)) / 255);
}

/** 剩余路径流光：毛笔尾迹——头部饱满圆润，向尾尖渐渐收窄、变淡（paintEvent 流光段） */
export function paintBrushTrail(
  ctx: CanvasRenderingContext2D,
  prefs: Prefs,
  per: number,
  arc: number,
  w: number,
  h: number,
  inset: number,
  t: number,
): void {
  const rp = prefs.runner;
  const rem0 = arc + rp.size * 0.6;
  const minPer = Math.max(8, per * 0.015); // 单边短边降低起绘阈值（约 1% 路径）
  if (per - rem0 <= minPer) return;

  const ph = (t * 0.06) % 2.0; // 三角波往复（前半 0→1，后半 1→0）
  const t01 = ph < 1.0 ? ph : 2.0 - ph;
  const head = rem0 + t01 * (per - rem0);
  // 尾迹长度：至少占路径总长 6%，最长为剩余的 28%，并设下限 150px / 18px
  const minTail = Math.max(150, per * 0.06);
  const tail = Math.max(18, Math.min(minTail, (per - rem0) * 0.28));
  const nseg = 18;

  ctx.save();
  ctx.lineCap = 'round';
  for (let k = 0; k < nseg; k++) {
    const kr = k / nseg; // 0=头部 1=尾尖
    const a1 = head - (tail * k) / nseg;
    if (a1 <= rem0) continue;
    const a0 = Math.max(rem0, head - (tail * (k + 1)) / nseg);
    if (a1 <= a0) continue;
    const p0 = posAt(rp.edge, a0, w, h, inset);
    const p1 = posAt(rp.edge, a1, w, h, inset);
    const col = brushColor(t, kr); // 彩虹拖尾 + 呼吸 + 笔锋淡出
    if (_brushAlpha < 4) continue;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.4, 4.8 * Math.pow(1 - kr, 1.7)); // 笔锋收尖
    strokeLine(ctx, p0.x, p0.y, p1.x, p1.y);
  }
  ctx.restore();
}
