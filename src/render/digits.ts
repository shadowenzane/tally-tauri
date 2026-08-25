// 大数字时钟（Python tally/windows.py ClockWindow._paint_digits 的 Canvas 2D 移植，任务行号 755-961）：
//   霓虹四层辉光 + 边缘流光（彗星拖尾沿字形轮廓轨道奔跑）+ 秒跳弹动 + 超时正计时与顶部小字。

import type { Frame } from '../shared/types';
import { WARN_COLOR, rgba, hsla } from '../shared/color';
import { applyBlink, blinkScale, overtimeFill, type Colored } from '../shared/effects';
import { fmt, colonOn } from '../shared/view';
import { fillEllipse, strokeLine } from '../shared/canvas';
import { glyphTrack, trackPoint } from './glyphs';

// 秒跳动画状态（Python: self._last_text / self._pop_t0；模块级单例）
let _lastText = '';
let _popT0 = -9.0;

export function paintDigits(f: Frame): void {
  const ctx = f.ctx;
  const cp = f.prefs.clock;
  const overtime = f.view.overtime;    // finished && running

  // paintEvent 前置（Python 176-179 行）：基色经闪烁调制；已结束 → 警示红；pulse 心跳缩放
  let color: Colored = applyBlink({ hex: cp.digit_color, alpha: 255 }, f.prefs, f.t, f.view.warning);
  if (f.st.finished) color = { hex: WARN_COLOR, alpha: 255 };
  let scale = blinkScale(f.prefs, f.t, f.view.warning);

  let text: string;
  if (overtime) {
    // 超时：红色正计时持续闪烁
    text = fmt(f.view.overtimeMs / 1000);
    color = overtimeFill(f.prefs, f.t);
    if (f.prefs.blink_mode === 'pulse') {
      const ph = (f.t * f.prefs.blink_hz) % 1.0;
      scale = 1 + 0.08 * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph));
    }
  } else {
    text = fmt(f.view.remainingMs / 1000);
    // 秒跳动画：数字变化瞬间轻微弹跳放大（NEON tick 效果）
    if (text !== _lastText) _popT0 = f.t;
    _lastText = text;
    const dt = f.t - _popT0;
    if (dt >= 0 && dt < 0.28) scale *= 1 + 0.07 * (1 - dt / 0.28);
  }

  let rect = { left: 12, top: 6, w: f.w - 24, h: f.h - 26 };
  let labelFont: string | null = null;   // 超时顶部小字字体（null = 非超时）
  let labelBand = 0;
  if (overtime) {
    // 顶部让出一条小字带，数字整体下移压缩，避免遮挡（Python 777-789 行）
    const band = Math.min(52.0, Math.max(20.0, rect.h * 0.16));
    labelFont = `bold ${Math.floor(band * 0.82)}px ${cp.font_family || '"Helvetica Neue"'}`;
    labelBand = band;
    rect = { left: rect.left, top: rect.top + band * 0.72, w: rect.w, h: rect.h - band * 0.72 };
  }

  // 字号适配：预留闪烁脉冲放大空间（全局 pulse 1.10 × 秒跳 1.07 ≈ 1.18），
  // 字号按可用宽度 / 1.18 收敛，缩放时不再溢出窗口边缘
  const family = cp.font_family || '"Helvetica Neue"';
  const fitW = rect.w / 1.18;
  let base = rect.h * 0.92 * scale;
  let fs = Math.max(1, Math.floor(base));       // 当前像素字号（跟踪适配循环）
  while (base > 10) {
    fs = Math.floor(base);
    ctx.font = `bold ${fs}px ${family}`;
    if (ctx.measureText(text).width <= fitW * 0.97) break;
    base *= 0.93;
  }
  ctx.font = `bold ${fs}px ${family}`;
  const chW = ctx.measureText('0').width;
  const totalW = ctx.measureText(text).width;
  let x0 = rect.left + (rect.w - totalW) / 2;
  const cy = rect.top + rect.h / 2;

  // 基线：Qt base_y = cy + fm.height()/2 - fm.descent() 的 Canvas 近似（COMMON.md 规则 4）
  const mX = ctx.measureText('X');
  const asc = mX.fontBoundingBoxAscent ?? mX.actualBoundingBoxAscent ?? 0;
  const desc = mX.fontBoundingBoxDescent ?? mX.actualBoundingBoxDescent ?? 0;
  const baseY = cy + (asc + desc) / 2 - desc;

  // ---- 数字霓虹辉光（NEON 灯管质感：外晕 → 中晕 → 亮环 → 白热芯，四层 strokeText） ----
  if (text) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const advs: number[] = [];
    for (let i = 0; i < text.length; i++) advs.push(ctx.measureText(text[i]).width);
    const strokeAll = () => {
      for (let i = 0; i < text.length; i++) {
        ctx.strokeText(text[i], x0 + i * chW + (chW - advs[i]) / 2, baseY);
      }
    };
    // 各层 alpha 为绝对值（同 Python setAlpha 覆盖语义，不随填充色 alpha 变暗）
    const layers: [number, number][] = [       // [alpha 0..255, lineWidth]
      [20, Math.max(2.0, fs * 0.30)],          // 1) 大范围柔光外晕（氛围扩散）
      [52, Math.max(1.5, fs * 0.145)],         // 2) 中层色晕（霓虹主体色）
      [105, Math.max(1.0, fs * 0.065)],        // 3) 贴字形亮环（锐利发光边缘）
    ];
    for (const [a, w] of layers) {
      ctx.strokeStyle = rgba(color.hex, a / 255);
      ctx.lineWidth = w;
      strokeAll();
    }
    ctx.strokeStyle = rgba('#FFFFFF', 150 / 255);   // 4) 白热芯（灯管中心亮线）
    ctx.lineWidth = Math.max(0.8, fs * 0.022);
    strokeAll();
    ctx.restore();
  }

  // ---- 边缘流光：彗星沿数字轮廓轨道奔跑（毛笔式彩虹拖尾，画在数字下层） ----
  if (cp.edge_flow && text) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // fontCss 与当前 ctx.font 一致；轨道缓存 key 含 text/x0/baseY/fontCss
    const tr = glyphTrack(text, x0, baseY, `bold ${fs}px ${family}`);
    if (tr.total > 60) {
      // 用户参数：速度 / 透明度 / 拖尾范围（越界钳制）
      const spd = Math.max(0.2, Math.min(4.0, cp.flow_speed));
      const op = Math.max(0.1, cp.flow_opacity / 100.0);
      const rng = Math.min(0.80, Math.max(0.05, cp.flow_range / 100.0));
      const fixed = cp.flow_color !== 'rainbow';
      const head = (f.t * tr.total * 0.20 * spd) % tr.total;   // 1.0× ≈ 5 秒/圈
      const nseg = 18;
      const tail = Math.max(20.0, tr.total * rng);
      const baseW = Math.max(2.0, fs * 0.045);
      for (let k = 0; k < nseg; k++) {
        // Python % 恒非负；JS 需归一到 [0, total)
        const s0 = (((head - (tail * k) / nseg) % tr.total) + tr.total) % tr.total;
        const s1 = (((head - (tail * (k + 1)) / nseg) % tr.total) + tr.total) % tr.total;
        const pa = trackPoint(tr, s0);
        const pb = trackPoint(tr, s1);
        if (pa.seg !== pb.seg) {               // 尾段跨字形边界则不画（Python 909-912 行）
          const lo = Math.min(pa.seg, pb.seg);
          const hi = Math.max(pa.seg, pb.seg);
          if (tr.jumps[hi] - tr.jumps[lo] > 0) continue;
        }
        const kf = k / nseg;                   // 0=头 1=尾尖
        const a = Math.round(255 * (0.85 * Math.pow(1 - kf, 1.3) + 0.08) * op);
        ctx.strokeStyle = fixed
          ? rgba(cp.flow_color, a / 255)
          : hsla((f.t * 36 + k * 9) % 360, 200, 205, a / 255);
        ctx.lineWidth = Math.max(0.8, baseW * Math.pow(1 - kf, 1.1) + 0.6);
        strokeLine(ctx, pa.x, pa.y, pb.x, pb.y);
      }
      // 头部亮星：白芯 + 彩晕（固定色时晕用该色；Python 926-940 行）
      const hp = trackPoint(tr, head);
      const hr = Math.max(6.0, fs * 0.12);
      const haloA = Math.round(110 * op);
      const haloHue = (f.t * 36) % 360;
      const halo = fixed ? rgba(cp.flow_color, haloA / 255) : hsla(haloHue, 210, 200, haloA / 255);
      const haloFade = fixed ? rgba(cp.flow_color, 0) : hsla(haloHue, 210, 200, 0);
      const rg = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, hr);
      rg.addColorStop(0.0, rgba('#FFFFFF', 210 / 255));   // 白芯
      rg.addColorStop(0.4, halo);                          // 彩晕
      rg.addColorStop(1.0, haloFade);                      // 晕边缘淡出
      ctx.fillStyle = rg;
      fillEllipse(ctx, hp.x, hp.y, hr, hr);
    }
    ctx.restore();
  }

  // ---- 逐字符填充（冒号熄灭时压暗；overtime 时冒号不熄灭） ----
  const colOn = colonOn(f.st, f.view.warning, f.t);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let a = color.alpha;
    if (ch === ':' && !colOn && !overtime) a = Math.round(a * 0.22);
    ctx.fillStyle = rgba(color.hex, a / 255);
    // Qt drawText(QRectF(x0, rect.top, ch_w+2, rect.height), AlignCenter)：
    // 字符在 chW+2 宽的单元内水平居中，垂直方向与整体基线 baseY 一致
    ctx.fillText(ch, x0 + (chW + 2) / 2, baseY);
    x0 += chW;
  }
  ctx.restore();

  // ---- 超时：数字上方小字「您已超时」（与数字同相位闪烁，紧贴数字） ----
  if (labelFont !== null) {
    ctx.save();
    ctx.font = labelFont;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(color.hex, Math.round(color.alpha * 0.9) / 255);
    // Qt drawText(QRectF(12, 4, w-24, band*0.72+2), AlignCenter)：按字体盒垂直居中
    const lcy = 4 + (labelBand * 0.72 + 2) / 2;
    const lm = ctx.measureText('X');
    const lasc = lm.fontBoundingBoxAscent ?? lm.actualBoundingBoxAscent ?? 0;
    const ldesc = lm.fontBoundingBoxDescent ?? lm.actualBoundingBoxDescent ?? 0;
    const lby = lcy + (lasc + ldesc) / 2 - ldesc;
    // Qt QFont AbsoluteSpacing 字距（band*0.14，加在每个字符之后）→ 逐字符绘制模拟
    const sp = labelBand * 0.14;
    const chars = [...'您已超时'];
    const ws = chars.map((ch) => ctx.measureText(ch).width);
    const adv = ws.reduce((s, w) => s + w, 0) + sp * chars.length;
    let lx = 12 + (f.w - 24 - adv) / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], lx, lby);
      lx += ws[i] + sp;
    }
    ctx.restore();
  }
}
