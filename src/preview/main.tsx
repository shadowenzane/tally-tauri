// 视觉核对预览：浏览器内直接驱动渲染层（不依赖 Tauri API）
// 用合成 TimerState 逐场景渲染，供截图与像素统计核对。

import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type { Frame, Prefs, TimerState } from '../shared/types';
import { defaultPrefs } from '../shared/types';
import { deriveView } from '../shared/view';
import { paintDigits } from '../render/digits';
import { paintDots } from '../render/dots';
import { paintAnalog } from '../render/analog';
import { paintLed } from '../render/led';
import { paintBarAround, paintBarEdge } from '../render/bar';
import { arcFor, paintBrushTrail, paintTrail, perFor, posAt } from '../render/trail';
import { SPRITES, paintWarningGlow } from '../render/sprites';
import { paintOvertimeCard } from '../shared/effects';

const W = 880;
const H = 520;

type SceneId =
  | 'clock-normal' | 'clock-warning' | 'clock-overtime'
  | 'clock-dots' | 'clock-analog' | 'clock-led'
  | 'bar-top' | 'bar-around' | 'runner-pacman' | 'runner-ghost';

interface Scene {
  id: SceneId;
  label: string;
  setup: (p: Prefs, st: TimerState, now: number) => void;
}

/** 场景表：克隆默认偏好 + 合成计时状态（now = Date.now()） */
const SCENES: Scene[] = [
  {
    id: 'clock-normal', label: '数字钟·正常',
    setup: (_p, st, now) => {
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'clock-warning', label: '数字钟·警告闪烁',
    setup: (_p, st, now) => {
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 10_000; st.remainingMs = 10_000;
    },
  },
  {
    id: 'clock-overtime', label: '数字钟·超时正计时',
    setup: (p, st, now) => {
      p.clock.mode = 'normal';
      st.running = true; st.finished = true;
      st.totalMs = 300_000; st.endAt = now - 15_000; st.remainingMs = 0;
    },
  },
  {
    id: 'clock-dots', label: '数字钟·点阵',
    setup: (p, st, now) => {
      p.clock.mode = 'dot';
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'clock-analog', label: '数字钟·圆环',
    setup: (p, st, now) => {
      p.clock.mode = 'analog';
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'clock-led', label: '数字钟·数码管',
    setup: (p, st, now) => {
      p.clock.mode = 'led';
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'bar-top', label: '灯条·上边',
    setup: (p, st, now) => {
      p.bar.edge = 'top'; p.bar.length = 80;
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'bar-around', label: '灯条·环绕',
    setup: (p, st, now) => {
      p.bar.edge = 'around';
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'runner-pacman', label: '精灵·吃豆人',
    setup: (p, st, now) => {
      p.runner.kind = 'pacman'; p.runner.edge = 'around';
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
  {
    id: 'runner-ghost', label: '精灵·小幽灵',
    setup: (p, st, now) => {
      p.runner.kind = 'ghost'; p.runner.edge = 'around';
      st.running = true; st.finished = false;
      st.totalMs = 300_000; st.endAt = now + 120_000; st.remainingMs = 120_000;
    },
  },
];

function PreviewApp() {
  const [sceneId, setSceneId] = useState<SceneId>('clock-normal');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const scene = SCENES.find((s) => s.id === sceneId) ?? SCENES[0];
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // 合成状态（每帧重建，避免场景间污染）
      const prefs: Prefs = structuredClone(defaultPrefs());
      const st: TimerState = {
        running: false, finished: false, endAt: null,
        remainingMs: 300_000, totalMs: 300_000,
      };
      const now = Date.now();
      scene.setup(prefs, st, now);
      const t = performance.now() / 1000;
      const view = deriveView(st, prefs, now);
      const f: Frame = { ctx, w: W, h: H, t, prefs, st, view };

      if (scene.id.startsWith('clock-')) {
        const m = prefs.clock.mode;
        if (m === 'dot') paintDots(f);
        else if (m === 'analog') paintAnalog(f);
        else if (m === 'led') paintLed(f);
        else paintDigits(f);
        // 非大数字模式的超时卡片（对应 ClockView）
        if (m !== 'normal' && view.overtime) {
          const fh = Math.min(30, Math.max(16, H * 0.10));
          paintOvertimeCard(ctx, prefs, t, view.overtimeMs / 1000, W, H,
            { fh, anchor: [W / 2, fh * 1.4] });
        }
      } else if (scene.id.startsWith('bar-')) {
        if (prefs.bar.edge === 'around') paintBarAround(f);
        else paintBarEdge(f);
      } else {
        // runner（对应 RunnerView.paint 主体）
        const rp = prefs.runner;
        const inset = rp.size / 2 + 4;
        const per = perFor(rp.edge, W, H, inset);
        const arc = arcFor(prefs, view, per);
        paintBrushTrail(ctx, prefs, per, arc, W, H, inset, t);
        paintTrail(ctx, prefs, per, arc, W, H, inset);
        const pos = posAt(rp.edge, arc, W, H, inset);
        paintWarningGlow(ctx, prefs, pos.x, pos.y, rp.size, t, view.warning);
        (SPRITES[rp.kind] ?? SPRITES.pacman)({
          ctx, x: pos.x, y: pos.y, angle: pos.angle, size: rp.size,
          t, animHz: Math.min(8, 2 + 1.5 * rp.speed), finished: view.overtime,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sceneId]);

  return (
    <div style={{ background: '#11141b', minHeight: '100vh', padding: 16,
                  fontFamily: 'PingFang SC, sans-serif', color: '#E9EBF0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SCENES.map((s) => (
          <button key={s.id} data-scene={s.id}
                  onClick={() => setSceneId(s.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 13,
                    background: s.id === sceneId ? '#22D3EE' : '#1d2029',
                    color: s.id === sceneId ? '#0a0d12' : '#9BA1AC',
                    border: '1px solid #2E323B',
                  }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ background: '#0d0f14', borderRadius: 12, padding: 8,
                   display: 'inline-block' }}>
        <canvas id="stage" ref={canvasRef}
                style={{ width: W, height: H, display: 'block' }} />
      </div>
      <p style={{ color: '#5A6070', fontSize: 12 }}>
        场景：{SCENES.find((s) => s.id === sceneId)?.label}（点击上方按钮切换；动画实时渲染）
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<PreviewApp />);
