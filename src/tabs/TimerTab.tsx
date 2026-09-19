// 计时 Tab：时长预设/自定义 + 临近结束闪烁 + 霓虹主题 + 自定义快捷键（对照 panel.py _tab_timer）
import { useState } from 'react';
import type { Prefs, TimerState } from '../shared/types';
import { PRESETS, THEMES, BLINK_MODES } from '../shared/types';
import { seqFromEvent, type HotkeyAction } from '../app/hotkeys';
import {
  Group, Row, SliderRow, Segmented, SwatchRow, Hint, CheckRow, type TabProps,
} from '../components/ui';

export interface TimerTabProps extends TabProps {
  st: TimerState;
  setTotalSec: (sec: number) => void;
}

/** 快捷键动作与展示名（顺序对照 panel.py） */
const HOTKEY_ITEMS: [HotkeyAction, string][] = [
  ['start', '开始 / 继续'],
  ['pause', '暂停'],
  ['reset', '重置'],
  ['reset_start', '重置并开始'],
];

/** 字符串 → 区间内整数（非法输入归 0） */
const clampInt = (s: string, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number(s) || 0)));

/** 快捷键录制行：点击进入录制态，按键写入，Esc 取消，失焦退出 */
function HotkeyRow({ act, name, prefs, update }: {
  act: HotkeyAction;
  name: string;
  prefs: Prefs;
  update: (fn: (p: Prefs) => void) => void;
}) {
  const [recording, setRecording] = useState(false);
  const seq = prefs.hotkeys[act] ?? '';
  return (
    <div className="hk-row">
      <span className="row-label">{name}</span>
      <input
        className={`hk-input${recording ? ' rec' : ''}`}
        readOnly
        value={recording ? '按键录制中…' : seq}
        placeholder="未设置"
        onFocus={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          e.preventDefault();
          const el = e.currentTarget;
          if (e.key === 'Escape') { el.blur(); return; }   // Esc 取消录制
          const s = seqFromEvent(e.nativeEvent);
          if (!s) return;                                   // 纯修饰键：继续等待
          update((p) => { p.hotkeys[act] = s; });
          el.blur();                                        // 录制完成即退出
        }}
      />
      <button
        type="button"
        className="hk-clear"
        onClick={() => update((p) => { p.hotkeys[act] = ''; })}
      >清除</button>
    </div>
  );
}

export default function TimerTab({ prefs, update, setTotalSec }: TimerTabProps) {
  const total = prefs.total;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  // 变更总时长：同步计时引擎 + 持久化（合计 > 0 才生效）
  const setTotal = (t: number) => {
    if (t <= 0) return;
    setTotalSec(t);
    update((p) => { p.total = t; });
  };
  return (
    <div className="tab-page">
      <div className="sec-title">时长</div>

      {/* 预设芯片：每行 3 个，checkable 互斥 */}
      <div className="chips">
        {[0, 1, 2].map((r) => (
          <div className="chip-row" key={r}>
            {PRESETS.slice(r * 3, r * 3 + 3).map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${total === m * 60 ? ' on' : ''}`}
                onClick={() => setTotal(m * 60)}
              >{m} 分</button>
            ))}
          </div>
        ))}
      </div>

      {/* 自定义分/秒 */}
      <div className="custom-row">
        <span className="row-label">自定义</span>
        <input
          className="num-input"
          type="number"
          min={0}
          max={99}
          value={min}
          onChange={(e) => setTotal(clampInt(e.target.value, 0, 99) * 60 + sec)}
        />
        <span className="unit">分</span>
        <input
          className="num-input"
          type="number"
          min={0}
          max={59}
          value={sec}
          onChange={(e) => setTotal(min * 60 + clampInt(e.target.value, 0, 59))}
        />
        <span className="unit">秒</span>
      </div>

      <Group title="临近结束闪烁">
        <SliderRow
          label="提前量（剩余 ≤ 该值时闪烁）"
          value={prefs.warn_sec}
          min={5}
          max={120}
          step={5}
          unit=" 秒"
          onChange={(v) => update((p) => { p.warn_sec = v; })}
        />
        <Row label="闪烁方式">
          <Segmented
            value={prefs.blink_mode}
            options={BLINK_MODES}
            onChange={(v) => update((p) => { p.blink_mode = v; })}
          />
        </Row>
        <SliderRow
          label="闪烁频率"
          value={Math.round(prefs.blink_hz * 10)}
          min={5}
          max={40}
          step={1}
          fmt={(v) => `${(v / 10).toFixed(1)} Hz`}
          onChange={(v) => update((p) => { p.blink_hz = v / 10; })}
        />
        <Hint>{'呼吸：柔和淡出　硬闪：开关式明灭\n变色：与警示红交替　脉冲：缩放心跳'}</Hint>
      </Group>

      <Group title="PPT 放映联动">
        <CheckRow
          label="PPT 放映时自动开始倒计时"
          checked={prefs.auto_start_on_ppt}
          onChange={(v) => update((p) => { p.auto_start_on_ppt = v; })}
        />
        <Hint>
          {'检测到 PowerPoint / WPS / Keynote 进入全屏放映时，自动开始倒计时并最小化本窗口；倒计时窗口将悬浮于放映画面之上。\n原生接口检测（无需任何系统权限，后台开销可忽略）。仅在进入放映瞬间触发一次；退出放映后再次放映将重新触发。'}
        </Hint>
      </Group>

      <Group title="霓虹主题">
        <SwatchRow
          colors={THEMES.map(([c]) => c)}
          value={prefs.theme}
          onChange={(c) => update((p) => { p.theme = c; })}
        />
        <Hint>青霓 / 粉霓 / 绿霓 / 金霓 / 紫霓，控制台与显示窗口氛围同步换色。</Hint>
      </Group>

      <Group title="自定义快捷键（点击输入框后按键录制）">
        {HOTKEY_ITEMS.map(([act, name]) => (
          <HotkeyRow key={act} act={act} name={name} prefs={prefs} update={update} />
        ))}
        <Hint>{'支持组合键（如 Ctrl+Alt+S）或单键（如 F8）。置空并"清除"可停用对应快捷键；录制时按 Esc 取消。原快捷键保留：空格 开始/暂停、R 重置。'}</Hint>
      </Group>

      <Hint>{'空格 开始/暂停 · R 重置 · 拖动标题栏移动\n数字钟窗口可直接拖动，双击关闭条不影响\n© 2026 云南化石 · 版权所有'}</Hint>
    </div>
  );
}
