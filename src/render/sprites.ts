// 跑动精灵的 7 个自绘角色与临近结束警示光晕（移植自 tally/windows.py 的 _paint_* 系列）
// 每个角色统一流程：save → translate(x, y ± bob) → rotate(angle°) → globalAlpha=1 → 绘制 → restore。
// 描边默认设 lineCap='square' / lineJoin='bevel'，对应 Qt QPen 缺省的 SquareCap / BevelJoin。

import type { SpriteCtx, Prefs } from '../shared/types';
import { rgba, WARN_COLOR } from '../shared/color';
import { fillEllipse, roundRectPath } from '../shared/canvas';

/** 小幽灵：圆顶波浪裙摆，瞳孔朝行进方向，随节奏上浮 */
function ghost(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz } = s;
  ctx.save();
  const bob = Math.abs(Math.sin(t * 2 * Math.PI * animHz * 0.6)) * size * 0.10;
  ctx.translate(x, y - bob);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  const r = size / 2;

  // 光晕
  ctx.fillStyle = rgba('#FF5A6E', 55 / 255);
  fillEllipse(ctx, 0, 0, r * 1.4, r * 1.4);

  // 身体：两侧竖线 + cubicTo 圆顶 + 三波裙摆
  const yb = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(-r, yb);
  ctx.lineTo(-r, -r * 0.05);
  ctx.bezierCurveTo(-r, -r * 1.35, r, -r * 1.35, r, -r * 0.05);
  ctx.lineTo(r, yb);
  const wv = (2 * r) / 3;
  let cx = r;
  for (let i = 0; i < 3; i++) {
    ctx.quadraticCurveTo(cx - wv * 0.25, yb + r * 0.30, cx - wv * 0.5, yb);
    ctx.quadraticCurveTo(cx - wv * 0.75, yb - r * 0.22, cx - wv, yb);
    cx -= wv;
  }
  ctx.closePath();
  ctx.fillStyle = '#FF5A6E';
  ctx.fill();
  ctx.strokeStyle = '#7A1020';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();

  // 双眼：眼白 + 朝行进方向偏移的瞳孔
  for (const ex of [-r * 0.32, r * 0.32]) {
    ctx.fillStyle = '#FFFFFF';
    fillEllipse(ctx, ex, -r * 0.28, r * 0.24, r * 0.30);
    ctx.fillStyle = '#2A2E3D';
    fillEllipse(ctx, ex + r * 0.10, -r * 0.26, r * 0.11, r * 0.13);
  }
  ctx.restore();
}

/** 小火箭：尾焰长度闪烁（无弹跳） */
function rocket(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz } = s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  const r = size / 2;
  const penCol = '#1A1204';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = penCol;

  // 尾焰：船尾 → 焰尖渐隐的线性渐变，长度随时间闪烁
  const fl = r * (0.55 + 0.45 * Math.abs(Math.sin(t * 2 * Math.PI * animHz * 2)));
  const grad = ctx.createLinearGradient(-r * 0.55, 0, -r * 0.55 - fl, 0);
  grad.addColorStop(0, '#FFD23F');
  grad.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.24);
  ctx.lineTo(-r * 0.5 - fl, 0);
  ctx.lineTo(-r * 0.5, r * 0.24);
  ctx.closePath();
  ctx.fill();

  // 两片红鳍
  ctx.fillStyle = '#FF453A';
  for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, sy * r * 0.30);
    ctx.lineTo(-r * 0.72, sy * r * 0.85);
    ctx.lineTo(-r * 0.58, sy * r * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 白色船体（圆头矩形路径）
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.34);
  ctx.lineTo(r * 0.2, -r * 0.34);
  ctx.quadraticCurveTo(r * 1.02, -r * 0.28, r * 1.02, 0);
  ctx.quadraticCurveTo(r * 1.02, r * 0.28, r * 0.2, r * 0.34);
  ctx.lineTo(-r * 0.6, r * 0.34);
  ctx.quadraticCurveTo(-r * 0.88, 0, -r * 0.6, -r * 0.34);
  ctx.closePath();
  ctx.fillStyle = '#E9EDF2';
  ctx.fill();
  ctx.stroke();

  // 红鼻锥
  ctx.beginPath();
  ctx.moveTo(r * 0.52, -r * 0.315);
  ctx.quadraticCurveTo(r * 1.03, -r * 0.26, r * 1.03, 0);
  ctx.quadraticCurveTo(r * 1.03, r * 0.26, r * 0.52, r * 0.315);
  ctx.closePath();
  ctx.fillStyle = '#FF453A';
  ctx.fill();
  ctx.stroke();

  // 蓝窗（带描边）+ 高光点
  ctx.beginPath();
  ctx.ellipse(r * 0.18, 0, r * 0.19, r * 0.19, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3FC5FF';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#BFEAFF';
  fillEllipse(ctx, r * 0.24, -r * 0.05, r * 0.06, r * 0.06);
  ctx.restore();
}

/** 小鱼：尾巴摆动 + 吐泡泡 */
function fish(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz } = s;
  ctx.save();
  const bob = Math.abs(Math.sin(t * 2 * Math.PI * animHz)) * size * 0.06;
  ctx.translate(x, y - bob);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  const r = size / 2;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = '#0B4A6F';

  // 尾巴：绕尾根摆动
  const wag = Math.sin(t * 2 * Math.PI * animHz * 1.2) * 18;
  ctx.save();
  ctx.translate(-r * 0.55, 0);
  ctx.rotate((wag * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.55, -r * 0.5);
  ctx.quadraticCurveTo(-r * 0.35, 0, -r * 0.55, r * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#2AA3E0';
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 背鳍
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.48);
  ctx.quadraticCurveTo(0, -r * 1.0, r * 0.3, -r * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#2AA3E0';
  ctx.fill();
  ctx.stroke();

  // 身体（带描边）
  ctx.beginPath();
  ctx.ellipse(r * 0.13, 0, r * 0.85, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3FB8FF';
  ctx.fill();
  ctx.stroke();

  // 高光
  ctx.fillStyle = '#BFEAFF';
  fillEllipse(ctx, r * 0.2, r * 0.25, r * 0.5, r * 0.17);

  // 白眼（带描边）+ 黑瞳
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(r * 0.62, -r * 0.12, r * 0.14, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0B2A3D';
  fillEllipse(ctx, r * 0.67, -r * 0.12, r * 0.07, r * 0.07);

  // 泡泡：向后上方漂升渐隐
  const b = (t * 0.7) % 1.0;
  ctx.fillStyle = rgba('#BFEAFF', Math.round(160 * (1 - b)) / 255);
  fillEllipse(ctx, r * (0.9 + b * 0.5), -r * (0.2 + b * 0.6), r * 0.07, r * 0.07);
  ctx.restore();
}

/** 小鸟：翅膀扇动 + 跳跃奔跑 */
function bird(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz } = s;
  ctx.save();
  const bob = Math.abs(Math.sin(t * 2 * Math.PI * animHz)) * size * 0.12;
  ctx.translate(x, y - bob);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  const r = size / 2;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = '#7A5A0A';

  // 黄色身体（带描边）
  ctx.beginPath();
  ctx.ellipse(r * 0.1, 0, r * 0.75, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FFC53D';
  ctx.fill();
  ctx.stroke();

  // 尾羽
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.1);
  ctx.lineTo(-r * 1.05, -r * 0.4);
  ctx.lineTo(-r * 1.0, r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#F0A81C';
  ctx.fill();
  ctx.stroke();

  // 橙喙
  ctx.beginPath();
  ctx.moveTo(r * 0.78, -r * 0.05);
  ctx.lineTo(r * 1.15, r * 0.08);
  ctx.lineTo(r * 0.78, r * 0.22);
  ctx.closePath();
  ctx.fillStyle = '#FF8A2A';
  ctx.fill();
  ctx.stroke();

  // 翅膀：绕肩点扇动
  const flap = Math.sin(t * 2 * Math.PI * animHz) * 35;
  ctx.save();
  ctx.translate(-r * 0.05, -r * 0.1);
  ctx.rotate((-25 + flap) * Math.PI / 180);
  ctx.beginPath();
  ctx.ellipse(-r * 0.07, -r * 0.025, r * 0.55, r * 0.275, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#F0A81C';
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 白眼黑瞳（不描边）
  ctx.fillStyle = '#FFFFFF';
  fillEllipse(ctx, r * 0.45, -r * 0.22, r * 0.16, r * 0.16);
  ctx.fillStyle = '#2A1D04';
  fillEllipse(ctx, r * 0.51, -r * 0.22, r * 0.08, r * 0.08);

  // 头发（弧线）
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.58);
  ctx.quadraticCurveTo(r * 0.05, -r * 0.95, r * 0.32, -r * 0.85);
  ctx.stroke();
  ctx.restore();
}

/** 小蜜蜂：翅膀高频扑扇，身体条纹 */
function bee(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz } = s;
  ctx.save();
  const bob = Math.abs(Math.sin(t * 2 * Math.PI * animHz)) * size * 0.10;
  ctx.translate(x, y - bob);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  const r = size / 2;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = '#3D2B00';

  // 黑刺
  ctx.beginPath();
  ctx.moveTo(-r * 0.72, 0);
  ctx.lineTo(-r * 1.05, -r * 0.1);
  ctx.lineTo(-r * 1.02, r * 0.12);
  ctx.closePath();
  ctx.fillStyle = '#3D2B00';
  ctx.fill();
  ctx.stroke();

  // 黄色椭圆身体（带描边）
  ctx.beginPath();
  ctx.ellipse(r * 0.13, 0, r * 0.85, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD23F';
  ctx.fill();
  ctx.stroke();

  // 两条黑条纹（裁剪到身体内）
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#3D2B00';
  for (const sx of [-r * 0.32, r * 0.12]) {
    ctx.beginPath();
    roundRectPath(ctx, sx, -r * 0.6, r * 0.26, r * 1.2, r * 0.12);
    ctx.fill();
  }
  ctx.restore();

  // 两片半透明白翅（高频扑扇；第二翅摆幅 ×0.7）
  const flap = Math.sin(t * 2 * Math.PI * animHz * 3) * 24;
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.strokeStyle = '#8FA8B8';
  ctx.fillStyle = rgba('#DDEBF5', 200 / 255);
  const wings: [number, number][] = [
    [-r * 0.02, -18 + flap],
    [r * 0.18, -32 + flap * 0.7],
  ];
  for (const [wx, rot] of wings) {
    ctx.save();
    ctx.translate(wx, -r * 0.42);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 0.16, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 白眼黑瞳
  ctx.fillStyle = '#FFFFFF';
  fillEllipse(ctx, r * 0.6, -r * 0.14, r * 0.14, r * 0.14);
  ctx.fillStyle = '#2A1D04';
  fillEllipse(ctx, r * 0.65, -r * 0.14, r * 0.07, r * 0.07);
  ctx.restore();
}

/** 小猫：橘猫头像，跳跃奔跑，条纹胡须俱全 */
function cat(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz } = s;
  ctx.save();
  const bob = Math.abs(Math.sin(t * 2 * Math.PI * animHz)) * size * 0.12;
  ctx.translate(x, y - bob);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  const r = size / 2;
  const penCol = '#8A4B12';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = penCol;

  // 两只三角耳（描边）
  ctx.fillStyle = '#FFA94D';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.32, -r * 0.62);
    ctx.lineTo(sx * r * 0.92, -r * 1.02);
    ctx.lineTo(sx * r * 0.78, -r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 内耳
  ctx.fillStyle = '#FFD1A6';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.44, -r * 0.62);
    ctx.lineTo(sx * r * 0.80, -r * 0.86);
    ctx.lineTo(sx * r * 0.70, -r * 0.40);
    ctx.closePath();
    ctx.fill();
  }

  // 圆头（带描边）
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.04, r * 0.82, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FFA94D';
  ctx.fill();
  ctx.stroke();

  // 三条额头条纹
  ctx.strokeStyle = '#D97B22';
  ctx.lineWidth = Math.max(1, size * 0.028);
  for (const sx of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.3, -r * 0.78);
    ctx.lineTo(sx * r * 0.38, -r * 0.5);
    ctx.stroke();
  }

  // 黑眼 + 白高光点
  ctx.fillStyle = '#2A1D04';
  for (const ex of [-r * 0.34, r * 0.34]) {
    fillEllipse(ctx, ex, -r * 0.05, r * 0.10, r * 0.13);
  }
  ctx.fillStyle = '#FFFFFF';
  for (const ex of [-r * 0.31, r * 0.37]) {
    fillEllipse(ctx, ex, -r * 0.10, r * 0.03, r * 0.03);
  }

  // 粉鼻三角
  ctx.fillStyle = '#FF6B81';
  ctx.beginPath();
  ctx.moveTo(-r * 0.09, r * 0.18);
  ctx.lineTo(r * 0.09, r * 0.18);
  ctx.lineTo(0, r * 0.30);
  ctx.closePath();
  ctx.fill();

  // 嘴：两条 quadTo
  ctx.strokeStyle = penCol;
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.30);
  ctx.quadraticCurveTo(-r * 0.12, r * 0.45, -r * 0.26, r * 0.34);
  ctx.moveTo(0, r * 0.30);
  ctx.quadraticCurveTo(r * 0.12, r * 0.45, r * 0.26, r * 0.34);
  ctx.stroke();

  // 六根胡须（两侧各 3 根）
  for (const sx of [-1, 1]) {
    for (const wy of [-0.08, 0.06, 0.20]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.5, r * 0.18 + wy * r);
      ctx.lineTo(sx * r * 1.05, r * wy * 1.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 吃豆人 + 追击小幽灵（波浪裙摆 + 前视瞳孔 + 上下漂浮；通关后闭嘴微笑、幽灵只剩眼睛） */
function pacman(s: SpriteCtx): void {
  const { ctx, x, y, angle, size, t, animHz, finished } = s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.globalAlpha = 1;
  const r = size / 2;
  const D = Math.PI / 180;

  // ---- 追击幽灵（在吃豆人身后） ----
  const ghR = size * 0.4375; // 参考：pac 16 / ghost 14
  const dist = size * 1.63; // 参考：身后 52px（中心距）
  const bob = Math.sin(t * 5.0) * size * 0.078; // 参考：sin(t/200)*2.5
  const gx = -dist;
  const gy = bob;
  ctx.fillStyle = rgba('#FF7AB6', 52 / 255);
  fillEllipse(ctx, gx, gy, ghR * 1.6, ghR * 1.6);
  if (finished) {
    // 通关后幽灵只剩一双眼睛（被吃掉）
    for (const off of [-ghR * 0.32, ghR * 0.32]) {
      ctx.fillStyle = '#FFFFFF';
      fillEllipse(ctx, gx + off, gy, ghR * 0.24, ghR * 0.24);
      ctx.fillStyle = '#2244CC';
      fillEllipse(ctx, gx + off + ghR * 0.11, gy, ghR * 0.13, ghR * 0.13);
    }
  } else {
    // 身体：左缘竖线 + 上半圆顶 + 4 波裙摆（相位每 160ms 翻转）
    ctx.fillStyle = '#FF7AB6';
    ctx.beginPath();
    ctx.moveTo(gx - ghR, gy + ghR * 0.86);
    ctx.lineTo(gx - ghR, gy - ghR * 0.14);
    // Qt arcTo(rect, 180°, -180°) 负扫 → Canvas 顺时针上半圆（9点 → 12点 → 3点，规则5）
    ctx.arc(gx, gy - ghR * 0.14, ghR, -180 * D, 0, false);
    const waves = 4;
    const ph = Math.floor((t * 1000) / 160) % 2 === 1 ? 1 : 0;
    const wseg = (ghR * 2) / waves;
    for (let i = 0; i <= waves; i++) {
      const wx = gx + ghR - i * wseg;
      const wy = gy + ghR * 0.86 - ((i + ph) % 2) * ghR * 0.29;
      ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.fill();
    // 眼睛：白眼球 + 朝行进方向(+)的蓝瞳
    for (const off of [-ghR * 0.32, ghR * 0.32]) {
      ctx.fillStyle = '#FFFFFF';
      fillEllipse(ctx, gx + off, gy - ghR * 0.29, ghR * 0.24, ghR * 0.24);
      ctx.fillStyle = '#2244CC';
      fillEllipse(ctx, gx + off + ghR * 0.11, gy - ghR * 0.29, ghR * 0.13, ghR * 0.13);
    }
  }

  // ---- 吃豆人本体 ----
  // 张合参考：0.26 + 0.22·|sin(t/130)| 弧度 ≈ 15°–27.5°（节奏随奔跑速度）
  const mouth = finished
    ? 0
    : (0.26 + 0.22 * Math.abs(Math.sin(t * Math.PI * 2 * animHz))) * 180 / Math.PI;
  ctx.fillStyle = rgba('#FFD21F', 66 / 255);
  fillEllipse(ctx, 0, 0, r * 1.5, r * 1.5);
  ctx.fillStyle = '#FFE066';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // Qt arcTo(rect, mouth/2, 360-mouth) 正扫 → Canvas 逆时针（规则5），缺口朝行进方向
  ctx.arc(0, 0, r, (-mouth / 2) * D, -(mouth / 2 + 360 - mouth) * D, true);
  ctx.closePath();
  ctx.fill();
  if (finished) {
    // 通关：闭嘴 + 微笑弧线（Qt drawArc(rect, 15°, 70°) 正扫 → Canvas 逆时针，规则5）
    ctx.strokeStyle = '#101418';
    ctx.lineWidth = Math.max(1.6, size * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, r * 0.26, r * 0.38, -15 * D, -(15 + 70) * D, true);
    ctx.stroke();
  } else {
    // 眼睛参考：(+4,-8)/r16 → (0.25r, -0.5r)，径 0.16r
    ctx.fillStyle = '#101418';
    const er = Math.max(1.5, r * 0.16);
    fillEllipse(ctx, r * 0.25, -r * 0.5, er, er);
  }
  ctx.restore();
}

/** 角色表：id → 绘制函数（对应 Python getattr(self, f'_paint_{kind}', self._paint_pacman)） */
export const SPRITES: Record<string, (s: SpriteCtx) => void> = {
  ghost,
  rocket,
  fish,
  bird,
  bee,
  cat,
  pacman,
};

/** 临近结束警示光晕：按全局闪烁模式调制的径向渐变圆（paintEvent 光晕段） */
export function paintWarningGlow(
  ctx: CanvasRenderingContext2D,
  prefs: Prefs,
  x: number,
  y: number,
  size: number,
  t: number,
  warning: boolean,
): void {
  let glowA = 0.0;
  let glowR = 0.85;
  let glowCol = WARN_COLOR;
  if (warning) {
    const ph = (t * prefs.blink_hz) % 1.0;
    const m = prefs.blink_mode;
    if (m === 'breathe') {
      glowA = 45 + 115 * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph)); // 光晕呼吸
    } else if (m === 'flash') {
      glowA = ph < 0.5 ? 160 : 0; // 光晕硬闪
    } else if (m === 'color') {
      if (ph >= 0.5) {
        glowA = 160; // 红光晕
      } else {
        glowA = 110; // 白光晕交替
        glowCol = '#FFFFFF';
      }
    } else if (m === 'pulse') {
      const wv = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
      glowA = 55 + 105 * wv; // 光晕心跳
      glowR = 0.85 + 0.30 * wv; // 半径胀缩
    }
  }
  if (glowA > 1) {
    const rr = size * glowR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rgba(glowCol, Math.round(glowA) / 255));
    g.addColorStop(0.55, rgba(glowCol, Math.round(glowA * 0.5) / 255));
    g.addColorStop(1, rgba(glowCol, 0));
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
