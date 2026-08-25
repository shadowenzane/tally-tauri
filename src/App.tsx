// 控制面板主组件：窗口 chrome（标题栏/置顶/退出确认/几何持久化）+ 四 Tab + 传输条 + 显示窗口联动
import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { hexRgb, WARN_COLOR } from './shared/color';
import { deriveView, fmt } from './shared/view';
import { loadKey, saveKey } from './shared/store';
import { usePrefsState } from './app/prefsState';
import { useTimer } from './app/timer';
import { focusGuard, useGlobalHotkeys } from './app/hotkeys';
import ParticlesBg from './ParticlesBg';
import TimerTab from './tabs/TimerTab';
import ClockTab from './tabs/ClockTab';
import BarTab from './tabs/BarTab';
import RunnerTab from './tabs/RunnerTab';

const TAB_NAMES = ['计时', '数字钟', '流光灯条', '跑动精灵'];
const DOT_IDLE = '#6A707C'; // 停止态状态灯颜色

interface MainGeo { x: number; y: number; w: number; h: number }

export default function App() {
  const { prefs, update } = usePrefsState();
  const { st, start, pause, reset, toggle, setTotalSec } = useTimer(prefs?.total ?? 300);
  const [tab, setTab] = useState(0);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // prefs 首次加载后：把持久化的总时长同步进计时引擎（useTimer 初值仅是占位）
  const totalSynced = useRef(false);
  useEffect(() => {
    if (!prefs || totalSynced.current) return;
    totalSynced.current = true;
    if (st.totalMs !== prefs.total * 1000) setTotalSec(prefs.total);
    // 仅在 prefs 首次就绪时执行一次
  }, [prefs]);

  // ---- 全局快捷键（handlers 每次渲染刷新，经 hotkeys.ts 内部 ref 调用） ----
  useGlobalHotkeys(prefs?.hotkeys ?? {}, {
    start: () => { if (!st.running) start(); },          // 未开始→开始，暂停→继续
    pause: () => { if (st.running) pause(); },           // 运行中→暂停
    reset: () => reset(),
    reset_start: () => { reset(); start(); },            // 恢复满时长后立即开始
  });

  // ---- 面板键盘：空格 开始/暂停 · R 重置（输入控件聚焦时让位） ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (focusGuard()) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.code === 'KeyR') { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, reset]);

  // ---- 心跳时钟：运行中每 100ms 重渲染（时间显示 / 状态灯 / 超时正计时） ----
  useEffect(() => {
    if (!st.running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [st.running]);

  // ---- 主题：--accent / --accent-rgb CSS 变量（全 UI 联动换色） ----
  useEffect(() => {
    if (!prefs) return;
    const [r, g, b] = hexRgb(prefs.theme);
    document.documentElement.style.setProperty('--accent', prefs.theme);
    document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  }, [prefs?.theme]);

  // ---- 控制窗置顶 ----
  useEffect(() => {
    if (!prefs) return;
    void getCurrentWindow().setAlwaysOnTop(prefs.control_topmost);
  }, [prefs?.control_topmost]);

  // ---- 显示窗口开关 / 置顶（仅对应键变化时调用；getByLabel 为异步） ----
  useEffect(() => {
    if (!prefs) return;
    void WebviewWindow.getByLabel('clock').then((w) => {
      if (w) void (prefs.clock.enabled ? w.show() : w.hide());
    });
  }, [prefs?.clock.enabled]);
  useEffect(() => {
    if (!prefs) return;
    void WebviewWindow.getByLabel('clock').then((w) => {
      if (w) void w.setAlwaysOnTop(prefs.clock.topmost);
    });
  }, [prefs?.clock.topmost]);
  useEffect(() => {
    if (!prefs) return;
    void WebviewWindow.getByLabel('bar').then((w) => {
      if (w) void (prefs.bar.enabled ? w.show() : w.hide());
    });
  }, [prefs?.bar.enabled]);
  useEffect(() => {
    if (!prefs) return;
    void WebviewWindow.getByLabel('runner').then((w) => {
      if (w) void (prefs.runner.enabled ? w.show() : w.hide());
    });
  }, [prefs?.runner.enabled]);

  // ---- 窗口几何持久化：启动恢复 + 移动/缩放合并 500ms 防抖落盘 ----
  const geoFlushRef = useRef<() => void>(() => {});
  useEffect(() => {
    const win = getCurrentWindow();
    let alive = true;
    let timer: number | undefined;
    let pending: MainGeo | null = null;
    const flush = () => {
      if (pending) { saveKey('mainGeo', pending); pending = null; }
    };
    geoFlushRef.current = flush;
    // 启动：恢复上次几何（存储为逻辑像素）
    void loadKey<MainGeo>('mainGeo').then((g) => {
      if (!alive || !g) return;
      void win.setPosition(new LogicalPosition(g.x, g.y));
      void win.setSize(new LogicalSize(g.w, g.h));
    });
    // 事件回调：物理像素 → 逻辑像素（除以 scaleFactor）
    const capture = () => {
      void Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor()])
        .then(([pos, size, sf]) => {
          if (!alive || sf <= 0) return;
          pending = { x: pos.x / sf, y: pos.y / sf, w: size.width / sf, h: size.height / sf };
          if (timer !== undefined) window.clearTimeout(timer);
          timer = window.setTimeout(flush, 500);
        });
    };
    let u1: (() => void) | undefined;
    let u2: (() => void) | undefined;
    void win.onMoved(() => capture()).then((u) => { if (alive) u1 = u; else u(); });
    void win.onResized(() => capture()).then((u) => { if (alive) u2 = u; else u(); });
    return () => {
      alive = false;
      geoFlushRef.current = () => {};
      u1?.();
      u2?.();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  // ---- 退出：运行中需确认（对应 Python closeEvent 弹窗） ----
  const doQuit = () => {
    geoFlushRef.current();          // 先落盘未写完的窗口几何
    setConfirmQuit(false);
    void invoke('quit_app');
  };
  const requestClose = () => {
    if (st.running) setConfirmQuit(true);
    else doQuit();
  };

  // prefs 未加载完成前不渲染
  if (!prefs) return null;

  // ---- 显示视图派生（剩余 / 超时正计时 / 临近结束警示） ----
  const view = deriveView(st, prefs, now);
  const overtime = view.overtime;
  const btnText = st.finished ? '重新开始'
    : st.running ? '暂停'
      : view.remainingMs < st.totalMs ? '继续' : '开始';
  const dotColor = (st.finished || view.warning) ? WARN_COLOR
    : st.running ? prefs.theme : DOT_IDLE;

  return (
    <div className="app">
      <ParticlesBg accent={prefs.theme} />
      <div className="app-inner">
        {/* 标题栏：状态灯 + 品牌 + 置顶/最小化/关闭；空白处按下拖动窗口 */}
        <header
          className="titlebar"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            void getCurrentWindow().startDragging();
          }}
        >
          <span
            className={`dot${st.running ? ' dot-run' : ''}`}
            style={{ color: dotColor }}
          >●</span>
          <span className="brand">TALLY</span>
          <span className="brand-sub">演讲倒计时 · 控制台</span>
          <div className="titlebar-actions">
            <button
              type="button"
              className={`icon-btn${prefs.control_topmost ? ' on' : ''}`}
              title="控制窗口始终保持在最前"
              onClick={() => update((p) => { p.control_topmost = !p.control_topmost; })}
            >置顶</button>
            <button
              type="button"
              className="close-btn"
              title="最小化"
              onClick={() => { void getCurrentWindow().minimize(); }}
            >–</button>
            <button
              type="button"
              className="close-btn"
              title="关闭（退出应用）"
              onClick={requestClose}
            >✕</button>
          </div>
        </header>

        {/* QTabWidget 式页签条 */}
        <nav className="tabs">
          {TAB_NAMES.map((t, i) => (
            <button
              key={t}
              type="button"
              className={`tab${tab === i ? ' on' : ''}`}
              onClick={() => setTab(i)}
            >{t}</button>
          ))}
        </nav>

        <div className="tab-body">
          {tab === 0 && <TimerTab prefs={prefs} update={update} st={st} setTotalSec={setTotalSec} />}
          {tab === 1 && <ClockTab prefs={prefs} update={update} />}
          {tab === 2 && <BarTab prefs={prefs} update={update} />}
          {tab === 3 && <RunnerTab prefs={prefs} update={update} />}
        </div>

        {/* 传输条：开始/暂停 + 重置 + 大号时间（超时红色正计时） */}
        <footer className="transport">
          <button type="button" className="btn-primary" onClick={toggle}>{btnText}</button>
          <button type="button" className="btn-ghost" onClick={reset}>重置</button>
          <div
            className={`mini-time${overtime ? ' over' : ''}`}
            style={{ color: overtime ? WARN_COLOR : prefs.theme }}
          >
            {fmt((overtime ? view.overtimeMs : view.remainingMs) / 1000)}
          </div>
        </footer>
      </div>

      {/* 退出确认层（运行中点 ✕ 时弹出） */}
      {confirmQuit && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-title">确认退出</div>
            <p className="dialog-text">倒计时正在进行，确定要退出吗？</p>
            <div className="dialog-actions">
              <button type="button" className="btn-primary" onClick={doQuit}>确认</button>
              <button type="button" className="btn-ghost" onClick={() => setConfirmQuit(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
