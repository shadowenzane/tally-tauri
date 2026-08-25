// 颜色工具：hex 解析 + rgba/hsla 生成（替代 QColor 的 alpha 调整）

export const WARN_COLOR = '#FF453A';

const _cache = new Map<string, [number, number, number]>();

/** '#RRGGBB' → [r, g, b]（带缓存；无效色返回白色） */
export function hexRgb(hex: string): [number, number, number] {
  const hit = _cache.get(hex);
  if (hit) return hit;
  let out: [number, number, number] = [255, 255, 255];
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  _cache.set(hex, out);
  return out;
}

/** hex + 透明度(0..1) → 'rgba(r,g,b,a)' */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/** hsl + 透明度 → 'hsla(h,s%,l%,a)'。
 *  s/l 按 Qt 的 0-255 标度传入（QColor.fromHsl 兼容），内部换算为百分比。 */
export function hsla(h: number, s: number, l: number, a: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = (Math.max(0, Math.min(255, s)) / 255) * 100;
  const ll = (Math.max(0, Math.min(255, l)) / 255) * 100;
  return `hsla(${hh},${ss}%,${ll}%,${Math.max(0, Math.min(1, a))})`;
}
