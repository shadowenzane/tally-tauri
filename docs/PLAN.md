# TALLY Tauri 版实现计划

> **For agentic workers:** 本计划由主会话执行；渲染层任务以子代理并行移植，接口契约见下文。

**Goal:** 将 PySide6 版 TALLY 演讲倒计时完整移植为 Tauri 2（Rust + React + TypeScript）桌面应用，功能 1:1 对齐。

**Architecture:** 四窗口架构——`main`（控制面板，计时引擎与设置中枢）+ `clock` / `bar` / `runner` 三个独立显示窗口（无边框、透明、置顶）。主窗口每 60ms 广播 `tally://state` 计时状态、设置变更时广播 `tally://prefs`；显示窗口订阅事件并用 Canvas 2D 以 rAF 渲染。持久化用 tauri-plugin-store（对应 Python 的 QSettings）。

**Tech Stack:** Tauri 2 / React 18 / TypeScript / Vite 多页 / Canvas 2D / tauri-plugin-global-shortcut / tauri-plugin-store

---

## 目录结构

```
tally-tauri/
├── index.html  clock.html  bar.html  runner.html   # 四窗口入口
├── src/
│   ├── shared/        types / color / view / protocol / store / effects
│   ├── render/        glyphs / digits / dots / analog / led / bar / sprites / trail
│   ├── windows/       clock / bar / runner 窗口胶水
│   ├── app/           prefsStore / timer / hotkeys / audio
│   ├── components/    面板控件（Slider/Segmented/Swatch/Combo/Check/Hotkey）
│   ├── tabs/          计时/数字钟/流光灯条/跑动精灵 四个设置页
│   └── App.tsx  main.tsx  styles.css  ParticlesBg.tsx
└── src-tauri/         Rust 侧 + tauri.conf.json + capabilities + icons
```

## 核心接口契约（shared/types.ts）

```ts
interface TimerState { running: boolean; finished: boolean; endAt: number | null; remainingMs: number; totalMs: number }
interface View { remainingMs: number; warning: boolean; overtime: boolean; overtimeMs: number; progress: number }
interface Frame { ctx: CanvasRenderingContext2D; w: number; h: number; t: number; prefs: Prefs; st: TimerState; view: View }
```

渲染函数（render/，全部接收 Frame）：`paintDigits / paintDots / paintAnalog / paintLed / paintBar / paintTrail / paintBrushTrail`，精灵表 `SPRITES: Record<string, (s: SpriteCtx) => void>`，字形轮廓 `glyphContours(text, fontCSS, px)`，灯条几何 `computeBarGeometry(bp, mon)`，路径数学 `perFor / posAt / trailSegments`。

## 事件协议

- `tally://state`：主窗口每 60ms 广播 TimerState（显示窗口本地用 Date.now() 派生剩余时间）
- `tally://prefs`：设置变更广播全量 Prefs；显示窗口据此自显隐（enabled）、重定位、重布局

## 移植源（Python，路径固定）

- `tally/windows.py` — 三窗口全部绘制逻辑
- `tally/effects.py` — 闪烁/流光/超时卡片
- `tally/constants.py` — 字模/段码/枚举表
- `tally/panel.py` / `tally/prefs.py` — 面板行为与持久化

## 任务分解

1. ✅ Rust 工具链
2. 工程骨架（配置/HTML/Rust/capabilities/图标）
3. 共享层六模块（含 effects.ts 全量移植）
4. 渲染层并行移植（4 子代理：A=digits+glyphs；B=dots+analog+led；C=bar；D=sprites+trail）
5. 控制面板 React（计时引擎/四 Tab/快捷键/主题/持久化/关闭确认）
6. 显示窗口胶水（clock 拖拽缩放/自布局；bar/runner 穿透+贴边定位）
7. NEON 设计语言 CSS
8. 编译验证（tsc / vite build / cargo check / tauri dev 冒烟）

## 验证清单（功能对齐）

预设时长+自定义、空格/R + 4 自定义全局快捷键（录制/清除/防冲突）、四闪烁模式×频率、五主题换肤、数字钟四模式×字体/字号/点径/LED样式×发光/轮廓流光四参数/配色/透明度/置顶、灯条五贴靠×长度/偏移/粗细/颜色/透明度/超时字号、精灵七角色×大小/速度/五路径样式×颜色/大小/粗细/间距/透明度、毛笔尾迹、超时正计时（红闪+卡片）、蜂鸣、窗口位置记忆、鼠标穿透。
