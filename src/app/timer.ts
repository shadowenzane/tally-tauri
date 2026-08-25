// 计时引擎（主窗口专用）：状态机 + 跨窗口广播（对应 Python TimerCore + panel 计时段）

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimerState } from '../shared/types';
import { broadcastState, onReady } from '../shared/protocol';
import { beep } from './audio';

export interface TimerApi {
  st: TimerState;
  /** 开始 / 继续（已结束后从满时长重新开始） */
  start: () => void;
  pause: () => void;
  /** 停止并恢复满时长 */
  reset: () => void;
  /** 空格行为：运行中→暂停，否则→开始 */
  toggle: () => void;
  /** 变更总时长（秒）并复位 */
  setTotalSec: (sec: number) => void;
}

export function useTimer(initialTotalSec: number): TimerApi {
  const [st, setSt] = useState<TimerState>(() => ({
    running: false,
    finished: false,
    endAt: null,
    remainingMs: initialTotalSec * 1000,
    totalMs: initialTotalSec * 1000,
  }));
  // 权威状态镜像：回调/心跳内读写，避免闭包过期
  const ref = useRef(st);

  const set = useCallback((next: TimerState) => {
    ref.current = next;
    setSt(next);
    broadcastState(next);
  }, []);

  const start = useCallback(() => {
    const c = ref.current;
    const remaining = c.finished ? c.totalMs : c.remainingMs;
    set({ ...c, remainingMs: remaining, finished: false, running: true,
          endAt: Date.now() + remaining });
  }, [set]);

  const pause = useCallback(() => {
    const c = ref.current;
    if (!c.running || c.endAt == null) return;
    set({ ...c, running: false, endAt: null,
          remainingMs: Math.max(0, c.endAt - Date.now()) });
  }, [set]);

  const reset = useCallback(() => {
    const c = ref.current;
    set({ ...c, running: false, finished: false, endAt: null,
          remainingMs: c.totalMs });
  }, [set]);

  const toggle = useCallback(() => {
    if (ref.current.running) pause();
    else start();
  }, [pause, start]);

  const setTotalSec = useCallback((sec: number) => {
    const ms = Math.round(sec * 1000);
    set({ running: false, finished: false, endAt: null,
          remainingMs: ms, totalMs: ms });
  }, [set]);

  // 心跳：推进 + 首次归零迁移（三声蜂鸣 + 进入超时正计时）
  useEffect(() => {
    const id = window.setInterval(() => {
      const c = ref.current;
      if (!c.running || c.endAt == null) return;
      if (Date.now() >= c.endAt && !c.finished) {
        set({ ...c, finished: true, remainingMs: 0 });
        beep(3);
      }
    }, 60);
    return () => window.clearInterval(id);
  }, [set]);

  // 显示窗口就绪握手：回播当前状态
  useEffect(() => {
    let un: (() => void) | undefined;
    let alive = true;
    void onReady(() => broadcastState(ref.current)).then((u) => {
      if (alive) un = u; else u();
    });
    return () => { alive = false; un?.(); };
  }, []);

  return { st, start, pause, reset, toggle, setTotalSec };
}
