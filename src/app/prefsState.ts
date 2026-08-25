// 偏好状态（主窗口专用）：加载 / 变更 / 持久化 / 跨窗口广播

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Prefs } from '../shared/types';
import { loadPrefs, savePrefs } from '../shared/store';
import { broadcastPrefs, onReady } from '../shared/protocol';

export interface PrefsApi {
  prefs: Prefs | null;                    // null = 尚未加载完成
  /** 就地修改（传入变更函数；自动克隆/持久化/广播） */
  update: (fn: (p: Prefs) => void) => void;
}

export function usePrefsState(): PrefsApi {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const ref = useRef<Prefs | null>(null);

  useEffect(() => {
    let un: (() => void) | undefined;
    let alive = true;
    void loadPrefs().then((p) => {
      if (!alive) return;
      ref.current = p;
      setPrefs(p);
      broadcastPrefs(p);
    });
    // 显示窗口就绪握手：回播当前设置
    void onReady(() => {
      if (ref.current) broadcastPrefs(ref.current);
    }).then((u) => {
      if (alive) un = u; else u();
    });
    return () => { alive = false; un?.(); };
  }, []);

  const update = useCallback((fn: (p: Prefs) => void) => {
    const cur = ref.current;
    if (!cur) return;
    const next: Prefs = structuredClone(cur);
    fn(next);
    ref.current = next;
    setPrefs(next);
    savePrefs(next);          // 内部 200ms 防抖
    broadcastPrefs(next);
  }, []);

  return { prefs, update };
}
