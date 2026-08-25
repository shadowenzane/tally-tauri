// 上升微光粒子背景：无状态粒子，由动画时钟与序号哈希推导
// 公式 1:1 对应 Python panel.py ControlWindow.paintEvent 的粒子段
import { useEffect, useRef } from 'react';
import { hexRgb } from './shared/color';

export default function ParticlesBg({ accent }: { accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 主题色 rgb 分量缓存（切换霓虹主题时仅更新引用，绘制循环每帧读取）
  const rgbRef = useRef(hexRgb(accent));
  useEffect(() => { rgbRef.current = hexRgb(accent); }, [accent]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let dpr = 1;
    // 画布尺寸随卡片变化（物理像素绘制，绘制时统一按 dpr 缩放回逻辑坐标）
    const fit = () => {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      cvs.width = Math.max(1, Math.round(cvs.clientWidth * dpr));
      cvs.height = Math.max(1, Math.round(cvs.clientHeight * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cvs);
    const draw = () => {
      const w = cvs.width / dpr;
      const h = cvs.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = rgbRef.current;
      const now = performance.now() / 1000;
      for (let i = 0; i < 30; i++) {
        // sin 哈希：x0 / y0 由序号决定，跨帧稳定
        const f1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        const f2 = Math.sin(i * 269.5 + 183.3) * 28001.8384;
        const x0 = f1 - Math.floor(f1);
        const y0 = f2 - Math.floor(f2);
        const spd = 0.014 + 0.030 * x0;
        const y = (((y0 - now * spd) % 1) + 1) % 1;          // 0 底 → 1 顶
        const tw = 0.72 + 0.28 * Math.sin(now * 1.7 + i * 2.4);   // 微弱明灭
        const alpha = (70 * (0.10 + 0.24 * y0) * tw) / 255;      // QColor 0..255 → 0..1
        const rad = 0.9 + 1.7 * y0;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(x0 * w, h - y * h, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="particles" aria-hidden="true" />;
}
