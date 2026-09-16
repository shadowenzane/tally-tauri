// 数字钟显示窗口：全屏 canvas + 拖动/缩放交互层
//（移植自 tally/windows.py ClockWindow 的 _relayout / paintEvent / 拖拽缩放段）

import { useEffect, useRef, type MouseEvent } from 'react';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { useDisplayWindow } from '../useDisplayWindow';
import type { Frame, Prefs, TimerState } from '../../shared/types';
import { DOT_PATTERNS } from '../../shared/types';
import { WARN_COLOR, rgba, hsla } from '../../shared/color';
import { paintOvertimeCard, shimmerAlpha } from '../../shared/effects';
import { roundRectPath, fillEllipse } from '../../shared/canvas';
import { dotText } from '../../shared/view';
import { loadKey, saveKey } from '../../shared/store';
import { paintDigits } from '../../render/digits';
import { paintDots } from '../../render/dots';
import { paintAnalog } from '../../render/analog';
import { paintLed } from '../../render/led';

/** 右下角缩放手柄边长（px），对应 Python ClockWindow.GRIP */
const GRIP = 22;
/** 位置持久化键（逻辑坐标） */
const POS_KEY = 'clockPos';

/** 按模式与字号计算窗口尺寸（Python _relayout 移植） */
function clockLayoutSize(
  prefs: Prefs,
  st: TimerState,
  mctx: CanvasRenderingContext2D | null,
): { w: number; h: number } {
  const cp = prefs.clock;
  const pad = 24;
  let w: number, h: number;
  if (cp.mode === 'dot') {
    const text = dotText(st.remainingMs / 1000);
    const cols = [...text].reduce((s, ch) => s + DOT_PATTERNS[ch][0].length, 0) + text.length - 1;
    const pitch = cp.dot_size * 1.55;
    w = Math.trunc(cols * pitch + pad * 2);
    h = Math.trunc(7 * pitch + pad * 2 + 8);
  } else if (cp.mode === 'analog') {
    const side = Math.max(260, cp.font_size * 4 + 60);
    w = side + 16;
    h = side + 16;
  } else if (cp.mode === 'led') {
    const n = st.totalMs >= 3_600_000 ? 7 : 5;
    w = Math.trunc(cp.font_size * 0.92 * n + pad * 2);
    h = Math.trunc(cp.font_size * 1.5 + 28);
  } else {
    // normal：离屏测量 '00:00:00' / '00:00' 的 advance（Qt QFontMetrics 等价）
    const sample = st.totalMs >= 3_600_000 ? '00:00:00' : '00:00';
    let advance = cp.font_size * 0.6 * sample.length;
    if (mctx) {
      mctx.font = `bold ${cp.font_size}px ${cp.font_family || '"Helvetica Neue"'}`;
      advance = mctx.measureText(sample).width;
    }
    w = Math.trunc(advance * 1.26 + pad * 2);
    h = Math.trunc(cp.font_size * 1.42 + pad + 12);
  }
  return { w: Math.max(240, w), h: Math.max(150, h) };
}

export default function ClockView() {
  // ---- 交互/帧内状态（refs，不触发重渲染）----
  const hoverRef = useRef(false);               // 悬停目标（mouseenter/mouseleave）
  const fadeRef = useRef(0);                    // 悬停 UI 当前淡入值（rAF 内缓动）
  const lastTRef = useRef(0);                   // 上一帧时间戳（算帧间隔）
  const layoutKeyRef = useRef('');              // 窗口尺寸变更检测 key
  const layoutTimerRef = useRef<number | null>(null);  // 尺寸应用防抖定时器
  const topmostRef = useRef<boolean | null>(null); // 置顶变更检测
  const measureRef = useRef<HTMLCanvasElement | null>(null); // 离屏测量 canvas
  const sfRef = useRef<number | null>(null);    // 窗口缩放系数（物理→逻辑换算）

  const measureCtx = (): CanvasRenderingContext2D | null => {
    if (!measureRef.current) {
      measureRef.current = document.createElement('canvas');
    }
    return measureRef.current.getContext('2d');
  };

  // ---- 每帧绘制（Python ClockWindow.paintEvent 移植）----
  const paint = (f: Frame): void => {
    const { ctx, w, h, t, prefs, st, view } = f;
    const cp = prefs.clock;

    // [帧内任务 1] 悬停 UI 淡入淡出：向目标缓动，速率 ≈ 1/0.18s
    const dt = Math.max(0, Math.min(0.1, t - lastTRef.current));
    lastTRef.current = t;
    const target = hoverRef.current ? 1 : 0;
    const step = dt / 0.18;
    if (fadeRef.current < target) fadeRef.current = Math.min(target, fadeRef.current + step);
    else if (fadeRef.current > target) fadeRef.current = Math.max(target, fadeRef.current - step);
    const fade = fadeRef.current;

    // [帧内任务 2] 窗口尺寸自适应（_relayout 移植）：key 变化时防抖 150ms 应用
    //（拖动字号/点径滑杆时事件密集，逐次 setSize 的 IPC 会造成卡顿）
    const layoutKey = `${cp.mode}|${cp.font_size}|${cp.dot_size}|${st.totalMs >= 3_600_000 ? 1 : 0}`;
    if (layoutKey !== layoutKeyRef.current) {
      layoutKeyRef.current = layoutKey;
      const size = clockLayoutSize(prefs, st, measureCtx());
      if (layoutTimerRef.current !== null) window.clearTimeout(layoutTimerRef.current);
      layoutTimerRef.current = window.setTimeout(() => {
        layoutTimerRef.current = null;
        try {
          void getCurrentWindow().setSize(new LogicalSize(size.w, size.h)).catch(() => {});
        } catch { /* 窗口销毁竞态 */ }
      }, 150);
    }

    // [帧内任务 3] 置顶开关
    if (topmostRef.current !== cp.topmost) {
      topmostRef.current = cp.topmost;
      try {
        void getCurrentWindow().setAlwaysOnTop(cp.topmost).catch(() => {});
      } catch { /* 窗口销毁竞态 */ }
    }

    // ---- 背景（独立颜色 + 透明度；完全透明时不画背景与边框）----
    if (cp.bg_opacity >= 5) {
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, 0.5, 0.5, w - 1, h - 1, 16);
      ctx.fillStyle = rgba(cp.bg_color, (255 * cp.bg_opacity) / 100 / 255);
      ctx.fill();
      ctx.strokeStyle = rgba(cp.digit_color, 38 / 255);
      ctx.lineWidth = 1;
      ctx.stroke();
      // 主题色上升微光粒子（NEON 粒子背景，裁剪到圆角矩形内；公式对齐 Python 源）
      ctx.clip();
      for (let i = 0; i < 16; i++) {
        const f1 = Math.sin(i * 91.7 + 47.3) * 343.5853;
        const f2 = Math.sin(i * 57.3 + 12.9) * 234.1647;
        const px_ = f1 - Math.floor(f1);         // [0,1) 伪随机 x
        const y0_ = f2 - Math.floor(f2);         // [0,1) 伪随机基准 y
        const spd = 0.020 + 0.038 * px_;
        // Python `%` 恒非负；JS 需归一到 [0,1)
        const y = (((y0_ - t * spd) % 1) + 1) % 1;
        const tw = 0.7 + 0.3 * Math.sin(t * 2.1 + i * 2.7);   // 明灭
        const a = 44 * (0.15 + 0.20 * y0_) * tw;
        ctx.fillStyle = rgba(prefs.theme, a / 255);
        const r = 1.0 + 1.6 * y0_;
        fillEllipse(ctx, px_ * w, h - y * h, r, r);
      }
      ctx.restore();
    }

    // ---- 模式分发（颜色推导在各 paint 函数内部）----
    if (cp.mode === 'dot') paintDots(f);
    else if (cp.mode === 'analog') paintAnalog(f);
    else if (cp.mode === 'led') paintLed(f);
    else paintDigits(f);

    // ---- 非数字模式：超时后在窗口顶部叠加"您已超时 + 正计时"卡片 ----
    if (cp.mode !== 'normal' && view.overtime) {
      const fh = Math.min(30, Math.max(16, h * 0.10));       // 先算 fh 再传
      paintOvertimeCard(ctx, prefs, t, view.overtimeMs / 1000, w, h, {
        fh,
        anchor: [w / 2, fh * 1.4],
      });
    }

    // ---- 悬停 UI：底部进度条（含彩虹流光带）+ 右下三角手柄 ----
    if (fade > 0.01) {
      const bx = 16, by = h - 12, bw = w - 32, bh = 4;
      // 轨道
      ctx.fillStyle = rgba(cp.digit_color, (40 * fade) / 255);
      ctx.beginPath();
      roundRectPath(ctx, bx, by, bw, bh, 2);
      ctx.fill();
      // 进度段 = 剩余比例（线性渐变 α140→α255；完成态用警示红）
      const prog = view.progress;
      if (prog > 0.004) {
        const fw = bw * prog;
        const cHex = st.finished ? WARN_COLOR : cp.digit_color;
        const grad = ctx.createLinearGradient(bx, 0, bx + fw, 0);
        grad.addColorStop(0, rgba(cHex, (140 * fade) / 255));
        grad.addColorStop(1, rgba(cHex, (255 * fade) / 255));
        ctx.fillStyle = grad;
        ctx.beginPath();
        roundRectPath(ctx, bx, by, fw, bh, 2);
        ctx.fill();
        // 彩虹流光带：沿剩余进度往返扫过，亮度带呼吸（剩余 >26px 才画）
        if (fw > 26) {
          const band = Math.max(28, fw * 0.45);
          const ph = (t * 0.4) % 2.0;
          const t01 = ph < 1.0 ? ph : 2.0 - ph;              // 三角波往返
          const bxs = bx - band + t01 * (fw + band);
          const hue1 = Math.trunc((t * 34) % 360);
          const hue2 = (hue1 + 115) % 360;
          const sa = shimmerAlpha(t, 95 * fade);
          const sh = ctx.createLinearGradient(bxs, 0, bxs + band, 0);
          sh.addColorStop(0.0, hsla(hue1, 205, 192, 0));
          sh.addColorStop(0.35, hsla(hue1, 205, 192, sa / 255));
          sh.addColorStop(0.65, hsla(hue2, 205, 192, sa / 255));
          sh.addColorStop(1.0, hsla(hue2, 205, 192, 0));
          ctx.save();
          ctx.beginPath();
          roundRectPath(ctx, bx, by, fw, bh, 2);             // 裁剪到进度段圆角矩形
          ctx.clip();
          ctx.fillStyle = sh;
          ctx.fillRect(bx, by, fw, bh);
          ctx.restore();
        }
      }
      // 右下角缩放手柄提示（小三角）
      ctx.fillStyle = rgba(cp.digit_color, (110 * fade) / 255);
      ctx.beginPath();
      ctx.moveTo(w - 4, h - 15);
      ctx.lineTo(w - 4, h - 4);
      ctx.lineTo(w - 15, h - 4);
      ctx.closePath();
      ctx.fill();
    }
  };

  const canvasRef = useDisplayWindow(paint);

  // ---- 挂载：初始定位恢复 + 拖动结束保存位置 ----
  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;

    // 缩放系数缓存（onMoved 物理坐标 → 逻辑坐标换算用）
    try {
      void win.scaleFactor().then((sf) => { sfRef.current = sf; }).catch(() => {});
    } catch { /* 窗口销毁竞态 */ }

    // 初始定位：恢复上次保存的逻辑坐标
    void loadKey<[number, number]>(POS_KEY)
      .then((pos) => {
        if (disposed) return;
        if (
          Array.isArray(pos) && pos.length === 2 &&
          typeof pos[0] === 'number' && typeof pos[1] === 'number'
        ) {
          try {
            void win.setPosition(new LogicalPosition(pos[0], pos[1])).catch(() => {});
          } catch { /* 窗口销毁竞态 */ }
        }
      })
      .catch(() => {});

    // 拖动/缩放结束：onMoved 防抖 500ms 后保存位置（物理坐标 ÷ scaleFactor）
    try {
      void win.onMoved((ev) => {
        const px = ev.payload.x;
        const py = ev.payload.y;
        if (moveTimer) clearTimeout(moveTimer);
        moveTimer = setTimeout(() => {
          moveTimer = null;
          const sf = sfRef.current ?? window.devicePixelRatio ?? 1;
          saveKey(POS_KEY, [px / sf, py / sf]);
        }, 500);
      })
        .then((un) => { if (disposed) un(); else unlisten = un; })
        .catch(() => {});
    } catch { /* 窗口销毁竞态 */ }

    return () => {
      disposed = true;
      if (moveTimer) clearTimeout(moveTimer);
      if (layoutTimerRef.current !== null) window.clearTimeout(layoutTimerRef.current);
      if (unlisten) {
        try { unlisten(); } catch { /* 窗口销毁竞态 */ }
      }
    };
  }, []);

  // ---- 交互层：拖动 / 缩放手柄 ----
  const inGrip = (e: MouseEvent<HTMLCanvasElement>): boolean => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientX >= rect.right - GRIP && e.clientY >= rect.bottom - GRIP;
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return;                  // 仅左键
    const win = getCurrentWindow();
    try {
      // 手柄区 → 原生东南向缩放；其余区域 → 原生拖动
      const p = inGrip(e)
        ? win.startResizeDragging('SouthEast')
        : win.startDragging();
      void p.catch(() => {});
    } catch { /* 窗口销毁竞态 */ }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>): void => {
    e.currentTarget.style.cursor = inGrip(e) ? 'nwse-resize' : 'default';
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', display: 'block' }}
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    />
  );
}
