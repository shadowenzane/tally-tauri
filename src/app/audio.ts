// 超时蜂鸣：WebAudio 正弦音（移植自 NEON 参考项目 timer.js 的 beep）

let actx: AudioContext | null = null;

export function beep(times = 3): void {
  try {
    actx = actx ?? new AudioContext();
    if (actx.state === 'suspended') void actx.resume();
    for (let i = 0; i < times; i++) {
      const t = actx.currentTime + i * 0.35;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + 0.32);
    }
  } catch {
    /* 无音频环境时静默 */
  }
}
