// 全局类型与枚举表（与 Python 版 tally/constants.py、tally/prefs.py 1:1 对应）

// ---------------- 偏好设置 ----------------
export interface ClockPrefs {
  enabled: boolean;
  mode: 'normal' | 'dot' | 'analog' | 'led';   // 大数字 | 点阵 | 圆环 | 数码管
  led_style: 'classic' | 'capsule' | 'dot' | 'panel';
  glow: number;                 // 数码管发光强度（%）
  edge_flow: boolean;           // 大数字：流光沿数字轮廓轨道奔跑
  flow_speed: number;           // 倍速
  flow_color: string;           // 'rainbow' 或 #RRGGBB
  flow_opacity: number;         // %
  flow_range: number;           // 拖尾长度（占轮廓周长 %）
  font_family: string;          // '' = 默认
  font_size: number;            // px
  dot_size: number;             // 点阵点径
  digit_color: string;
  bg_color: string;
  bg_opacity: number;           // %
  topmost: boolean;
  pos: [number, number] | null; // 窗口位置
}

export interface BarPrefs {
  enabled: boolean;
  edge: 'top' | 'bottom' | 'left' | 'right' | 'around';
  length: number;               // 占边长 %
  offset: number;               // 条中心在边上的位置 %
  thickness: number;            // px
  color: string;
  opacity: number;              // %
  overtime_size: number;        // 超时提示字号 px
}

export interface RunnerPrefs {
  enabled: boolean;
  kind: string;                 // RUNNERS 中的角色 id
  size: number;
  speed: number;                // 全程绕屏圈数（单边为趟数）
  edge: 'around' | 'top' | 'bottom' | 'left' | 'right';
  trail: 'dots' | 'dash' | 'line' | 'drop' | 'dot';
  trail_color: string;
  trail_size: number;
  trail_opacity: number;        // %
  trail_width: number;          // 粗细倍率 %
  trail_gap: number;            // 间距倍率 %
}

export type BlinkMode = 'breathe' | 'flash' | 'color' | 'pulse';

export interface Prefs {
  total: number;                // 秒
  theme: string;
  warn_sec: number;
  blink_mode: BlinkMode;
  blink_hz: number;
  control_topmost: boolean;
  auto_start_on_ppt: boolean;   // PPT 全屏放映时自动开始倒计时
  hotkeys: Record<'start' | 'pause' | 'reset' | 'reset_start', string>;
  clock: ClockPrefs;
  bar: BarPrefs;
  runner: RunnerPrefs;
}

// ---------------- 计时状态（跨窗口广播） ----------------
// endAt 用 Date.now() 毫秒（跨窗口可比）；显示窗口每帧本地派生剩余时间。
export interface TimerState {
  running: boolean;
  finished: boolean;            // 已到 0（超时正计时中，持续到重置/重开）
  endAt: number | null;         // 运行中的目标时刻（epoch ms）
  remainingMs: number;          // 暂停/停止时的冻结值
  totalMs: number;
}

// ---------------- 显示视图派生 ----------------
export interface View {
  remainingMs: number;
  warning: boolean;             // 临近结束闪烁
  overtime: boolean;            // 超时正计时（finished && running）
  overtimeMs: number;
  progress: number;             // remaining / total ∈ [0,1]
}

// ---------------- 渲染帧（所有 paint 函数的统一入参） ----------------
export interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number;                    // 逻辑像素宽
  h: number;                    // 逻辑像素高
  t: number;                    // 动画时钟（秒，performance.now()/1000）
  prefs: Prefs;
  st: TimerState;
  view: View;
}

// ---------------- 精灵绘制上下文 ----------------
export interface SpriteCtx {
  ctx: CanvasRenderingContext2D;
  x: number; y: number;
  angle: number;                // 度（行进方向）
  size: number;
  t: number;                    // 动画时钟（秒）
  animHz: number;               // 弹跳/咀嚼频率
  finished: boolean;            // 通关状态（吃豆人闭嘴微笑 / 幽灵只剩眼睛）
}

// ---------------- 枚举表（id, 名称） ----------------
export const THEMES: [string, string][] = [
  ['#22D3EE', '青霓'], ['#F472B6', '粉霓'], ['#34D399', '绿霓'],
  ['#FBBF24', '金霓'], ['#A78BFA', '紫霓'],
];
export const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];
export const SWATCH_COLORS = ['#FFC53D', '#FF453A', '#3BE07C', '#3FC5FF', '#F5F6F8', '#FF5CD6'];
export const BG_COLORS = ['#0E0F12', '#F4F5F7', '#18213A', '#3A1620', '#0F2A1E', '#2E2118'];
export const BLINK_MODES: [BlinkMode, string][] = [
  ['breathe', '呼吸'], ['flash', '硬闪'], ['color', '变色'], ['pulse', '脉冲'],
];
export const RUNNERS: [string, string][] = [
  ['pacman', '吃豆人'], ['ghost', '小幽灵'], ['rocket', '小火箭'],
  ['fish', '小鱼'], ['bird', '小鸟'], ['bee', '小蜜蜂'], ['cat', '小猫'],
];
export const LED_STYLES: [string, string][] = [
  ['classic', '经典斜切'], ['capsule', '圆润胶囊'],
  ['dot', '点阵 LED'], ['panel', '复古面板'],
];
export const TRAILS: [string, string][] = [
  ['dots', '豆子'], ['dash', '虚线'], ['line', '线条'],
  ['drop', '水滴'], ['dot', '圆点'],
];
export const CLOCK_MODES: [string, string][] = [
  ['normal', '大数字'], ['dot', '点阵'], ['analog', '圆环'], ['led', '数码管'],
];
export const BAR_EDGES: [string, string][] = [
  ['top', '上'], ['bottom', '下'], ['left', '左'], ['right', '右'], ['around', '环绕四周'],
];
export const RUNNER_EDGES: [string, string][] = [
  ['around', '四周'], ['top', '上'], ['bottom', '下'], ['left', '左'], ['right', '右'],
];

// 5x7 点阵字模（点状计时钟用）
export const DOT_PATTERNS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '1', '1', '0', '1', '1', '0'],
};

// 七段数码管段码：a顶 b右上 c右下 d底 e左下 f左上 g中
export const SEG_PATTERNS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};
// 段的归一化矩形（相对单字符框）
export const SEG_RECTS: Record<string, [number, number, number, number, 'h' | 'v']> = {
  a: [0.08, 0.00, 0.84, 0.10, 'h'],
  g: [0.08, 0.45, 0.84, 0.10, 'h'],
  d: [0.08, 0.90, 0.84, 0.10, 'h'],
  f: [0.00, 0.09, 0.11, 0.36, 'v'],
  b: [0.89, 0.09, 0.11, 0.36, 'v'],
  e: [0.00, 0.55, 0.11, 0.36, 'v'],
  c: [0.89, 0.55, 0.11, 0.36, 'v'],
};

// 4x7 点阵字模（点阵 LED 数码管样式用）
export const LED_DOT_PATTERNS: Record<string, string[]> = {
  '0': ['0110', '1001', '1001', '1001', '1001', '1001', '0110'],
  '1': ['0010', '0110', '0010', '0010', '0010', '0010', '0111'],
  '2': ['0110', '1001', '0001', '0010', '0100', '1000', '1111'],
  '3': ['1110', '0001', '0001', '0110', '0001', '0001', '1110'],
  '4': ['0001', '0011', '0101', '1001', '1111', '0001', '0001'],
  '5': ['1111', '1000', '1110', '0001', '0001', '1001', '0110'],
  '6': ['0010', '0100', '1000', '1110', '1001', '1001', '0110'],
  '7': ['1111', '0001', '0010', '0010', '0100', '0100', '0100'],
  '8': ['0110', '1001', '1001', '0110', '1001', '1001', '0110'],
  '9': ['0110', '1001', '1001', '0111', '0001', '0010', '0100'],
};

// ---------------- 默认值 ----------------
export const ACCENT = '#22D3EE';

export function defaultPrefs(): Prefs {
  return {
    total: 300,
    theme: ACCENT,
    warn_sec: 30,
    blink_mode: 'color',
    blink_hz: 1.0,
    control_topmost: false,
    auto_start_on_ppt: false,
    hotkeys: {
      start: 'Control+Alt+S',
      pause: 'Control+Alt+P',
      reset: 'Control+Alt+R',
      reset_start: 'Control+Alt+G',
    },
    clock: {
      enabled: true,
      mode: 'normal',
      led_style: 'dot',
      glow: 100,
      edge_flow: false,
      flow_speed: 1.0,
      flow_color: 'rainbow',
      flow_opacity: 100,
      flow_range: 30,
      font_family: '',
      font_size: 96,
      dot_size: 16,
      digit_color: '#FFC53D',
      bg_color: '#0E0F12',
      bg_opacity: 85,
      topmost: true,
      pos: null,
    },
    bar: {
      enabled: false,
      edge: 'top',
      length: 60,
      offset: 50,
      thickness: 10,
      color: '#FFB224',
      opacity: 90,
      overtime_size: 16,
    },
    runner: {
      enabled: false,
      kind: 'pacman',
      size: 44,
      speed: 1.0,
      edge: 'around',
      trail: 'dots',
      trail_color: '#FFD9A0',
      trail_size: 10,
      trail_opacity: 90,
      trail_width: 100,
      trail_gap: 100,
    },
  };
}
