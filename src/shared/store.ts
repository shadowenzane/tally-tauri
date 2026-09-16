// 偏好持久化：tauri-plugin-store（文件级，对应 Python 的 QSettings）
// 仅主窗口写入；显示窗口靠事件同步，不直接读。

import { load, type Store } from '@tauri-apps/plugin-store';
import type { Prefs } from './types';
import { defaultPrefs, ACCENT, BLINK_MODES, LED_STYLES, RUNNERS, TRAILS } from './types';

let _store: Store | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

async function store(): Promise<Store> {
  if (!_store) _store = await load('tally-store.json', { autoSave: true });
  return _store;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inDict = (v: string, table: [string, string][], dft: string) =>
  (table.some(([id]) => id === v) ? v : dft);

/** 合法性校验（移植 prefs.sanitize）：就地修正异常值 */
export function sanitize(p: Prefs): Prefs {
  p.total = clamp(Math.round(p.total), 1, 99 * 3600 + 59 * 60 + 59);
  p.warn_sec = clamp(Math.round(p.warn_sec), 5, 120);
  p.blink_hz = clamp(p.blink_hz, 0.5, 4.0);
  p.auto_start_on_ppt = !!p.auto_start_on_ppt;
  if (!/^#[0-9a-f]{6}$/i.test(p.theme)) p.theme = ACCENT;
  else p.theme = p.theme.toUpperCase();
  p.blink_mode = (BLINK_MODES.some(([id]) => id === p.blink_mode) ? p.blink_mode : 'color') as Prefs['blink_mode'];
  const c = p.clock;
  c.mode = (['normal', 'dot', 'analog', 'led'] as const).includes(c.mode as never) ? c.mode : 'normal';
  c.led_style = inDict(c.led_style, LED_STYLES, 'dot') as Prefs['clock']['led_style'];
  c.glow = clamp(Math.round(c.glow), 0, 200);
  c.edge_flow = !!c.edge_flow;
  c.flow_speed = clamp(c.flow_speed, 0.2, 4.0);
  if (c.flow_color !== 'rainbow') {
    c.flow_color = /^#[0-9a-f]{6}$/i.test(c.flow_color) ? c.flow_color.toUpperCase() : 'rainbow';
  }
  c.flow_opacity = clamp(Math.round(c.flow_opacity), 10, 100);
  c.flow_range = clamp(Math.round(c.flow_range), 5, 80);
  c.font_size = clamp(Math.round(c.font_size), 30, 300);
  c.dot_size = clamp(Math.round(c.dot_size), 6, 36);
  c.bg_opacity = clamp(Math.round(c.bg_opacity), 0, 100);
  const b = p.bar;
  b.edge = (['top', 'bottom', 'left', 'right', 'around'] as const).includes(b.edge as never)
    ? b.edge : 'top';
  b.length = clamp(Math.round(b.length), 10, 100);
  b.offset = clamp(Math.round(b.offset), 0, 100);
  b.thickness = clamp(Math.round(b.thickness), 4, 40);
  b.opacity = clamp(Math.round(b.opacity), 10, 100);
  b.overtime_size = clamp(Math.round(b.overtime_size), 10, 60);
  const r = p.runner;
  r.kind = inDict(r.kind, RUNNERS, 'pacman');
  r.size = clamp(Math.round(r.size), 20, 90);
  r.speed = clamp(r.speed, 1.0, 8.0);
  r.edge = (['around', 'top', 'bottom', 'left', 'right'] as const).includes(r.edge as never)
    ? r.edge : 'around';
  r.trail = inDict(r.trail, TRAILS, 'dots') as Prefs['runner']['trail'];
  r.trail_size = clamp(Math.round(r.trail_size), 4, 24);
  r.trail_opacity = clamp(Math.round(r.trail_opacity), 10, 100);
  r.trail_width = clamp(Math.round(r.trail_width), 50, 250);
  r.trail_gap = clamp(Math.round(r.trail_gap), 50, 250);
  // 快捷键：类型校验 + 避开固定键（空格 / R）
  const hk = (p.hotkeys && typeof p.hotkeys === 'object') ? p.hotkeys : ({} as Prefs['hotkeys']);
  const dft = defaultPrefs().hotkeys;
  const merged = {} as Prefs['hotkeys'];
  for (const act of ['start', 'pause', 'reset', 'reset_start'] as const) {
    let seq = typeof hk[act] === 'string' ? hk[act] : dft[act];
    if (seq.trim().toUpperCase() === 'SPACE' || seq.trim().toUpperCase() === 'R') seq = '';
    merged[act] = seq;
  }
  p.hotkeys = merged;
  return p;
}

/** 深合并（旧存储缺字段时补默认值） */
function mergePrefs(raw: unknown): Prefs {
  const dft = defaultPrefs();
  if (!raw || typeof raw !== 'object') return dft;
  const p = { ...dft, ...(raw as Prefs) };
  p.clock = { ...dft.clock, ...(p.clock ?? {}) };
  p.bar = { ...dft.bar, ...(p.bar ?? {}) };
  p.runner = { ...dft.runner, ...(p.runner ?? {}) };
  p.hotkeys = { ...dft.hotkeys, ...(p.hotkeys ?? {}) };
  return sanitize(p);
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const s = await store();
    const raw = await s.get<unknown>('prefs');
    return mergePrefs(raw);
  } catch {
    return defaultPrefs();
  }
}

/** 保存（200ms 防抖，避免拖动滑杆时高频写盘） */
export function savePrefs(prefs: Prefs): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    void store().then((s) => s.set('prefs', prefs));
  }, 200);
}

/** 通用键值（窗口几何等） */
export async function loadKey<T>(key: string): Promise<T | undefined> {
  try {
    const s = await store();
    return await s.get<T>(key);
  } catch {
    return undefined;
  }
}

export function saveKey(key: string, value: unknown): void {
  void store().then((s) => s.set(key, value));
}
