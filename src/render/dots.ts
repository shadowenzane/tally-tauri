// 点状计时钟：5x7 点阵，透明背景只留亮点
//（移植自 tally/windows.py ClockWindow._paint_dots，数值常量与 Python 源逐行对齐）

import type { Frame } from '../shared/types';
import { DOT_PATTERNS } from '../shared/types';
import { WARN_COLOR, rgba } from '../shared/color';
import { applyBlink } from '../shared/effects';
import type { Colored } from '../shared/effects';
import { dotText, colonOn } from '../shared/view';
import { fillEllipse } from '../shared/canvas';

export function paintDots(f: Frame): void {
  const { ctx, w, h, t } = f;
  const cp = f.prefs.clock;
  // 数字色：经全局闪烁引擎调制；已到 0（超时）恒为警示红
  //（对应 paintEvent：color = apply_blink(QColor(cp.digit_color), ...); if finished: WARN_COLOR）
  const color: Colored = f.st.finished
    ? { hex: WARN_COLOR, alpha: 255 }
    : applyBlink({ hex: cp.digit_color, alpha: 255 }, f.prefs, t, f.view.warning);

  const text = dotText(f.view.remainingMs / 1000);
  const dot = cp.dot_size;
  const pitch = dot * 1.55;
  const gap = pitch;
  // 总列数 = 每字符点阵宽之和 + 字符间隔数
  const cols = [...text].reduce((s, ch) => s + DOT_PATTERNS[ch][0].length, 0) + text.length - 1;
  const totalW = (cols - 1) * pitch + dot;
  const totalH = 6 * pitch + dot;
  const x0 = (w - totalW) / 2;
  const y0 = (h - 18 - totalH) / 2 + 2;
  // 冒号闪烁：运行中按秒节拍半周期明灭，停止时常亮
  const colon = colonOn(f.st, f.view.warning, t);

  ctx.save();
  let x = x0;
  for (const ch of text) {
    const pat = DOT_PATTERNS[ch];
    const pw = pat[0].length;
    for (let r = 0; r < pat.length; r++) {
      for (let c = 0; c < pat[r].length; c++) {
        const on = pat[r][c] === '1';
        let alpha = color.alpha;
        if (ch === ':' && !colon) {
          alpha = Math.round(alpha * 0.15);   // 冒号熄灭：亮点灭点整体调暗
        } else if (!on) {
          alpha = 26;                          // 熄灭的点留下极淡的网格感
        }
        ctx.fillStyle = rgba(color.hex, alpha / 255);
        fillEllipse(ctx, x + c * pitch + dot / 2, y0 + r * pitch + dot / 2, dot / 2, dot / 2);
      }
    }
    x += pw * pitch + gap;
  }
  ctx.restore();
}
