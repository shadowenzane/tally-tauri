// 基础控件库：NEON 面板全部受控控件集中于此（对照 Python fields.py / widgets.py 的声明式控件）
import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { Prefs } from '../shared/types';

/** 各 Tab 统一 props */
export interface TabProps {
  prefs: Prefs;
  update: (fn: (p: Prefs) => void) => void;
}

/** QGroupBox 卡片（标题悬浮在边框线上） */
export function Group({ title, children, disabled }: {
  title: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <section className={`group${disabled ? ' disabled' : ''}`}>
      <div className="group-title">{title}</div>
      <div className="group-body">{children}</div>
    </section>
  );
}

/** 标签行：label 左，控件右 */
export function Row({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      {children != null && <div className="row-ctl">{children}</div>}
    </div>
  );
}

/** 滑杆行：标签 + 右对齐值标签（accent 色）+ 滑杆 */
export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;                 // 值后缀（如 ' px'、'%'）
  fmt?: (v: number) => string;   // 值格式化（优先于 unit，如 '{v:.1f} Hz'）
  disabled?: boolean;
  onChange: (v: number) => void;
}

export function SliderRow({ label, value, min, max, step = 1, unit = '', fmt,
                            disabled = false, onChange }: SliderRowProps) {
  const text = fmt ? fmt(value) : `${value}${unit}`;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="slider-row">
      <div className="row">
        <span className="row-label">{label}</span>
        <span className="ctlVal">{text}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** 互斥按钮组（闪烁方式 / 时钟模式 / 贴靠位置） */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={`seg-btn${v === value ? ' on' : ''}`}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 色板行：可选特殊块（如彩虹，排在最前）+ 预设色块 + '+' 自定义取色（隐藏 input[type=color] 触发） */
export interface SwatchSpecial { label: string; bg: string }

export function SwatchRow({ colors, value, onChange, special }: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
  special?: Record<string, SwatchSpecial>;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cur = value.toLowerCase();
  return (
    <div className="swatch-row">
      {special && Object.entries(special).map(([key, sp]) => (
        <button
          key={key}
          type="button"
          title={sp.label}
          className={`swatch${value === key ? ' on' : ''}`}
          style={{ background: sp.bg }}
          onClick={() => onChange(key)}
        />
      ))}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          className={`swatch${cur === c.toLowerCase() ? ' on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <button
        type="button"
        className="swatch-add"
        title="自定义颜色"
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          if (/^#[0-9a-f]{6}$/i.test(value)) el.value = value;   // 从当前颜色打开
          el.click();
        }}
      >+</button>
      {/* 隐藏的原生取色器，由 '+' 按钮程序化触发 */}
      <input
        ref={pickerRef}
        type="color"
        className="swatch-picker"
        tabIndex={-1}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
    </div>
  );
}

/** 下拉行 */
export function ComboRow<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <Row label={label}>
      <select className="combo" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </Row>
  );
}

/** 自绘复选框行 */
export function CheckRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box" />
      <span className="txt">{label}</span>
    </label>
  );
}

/** 灰色小字提示（支持 \n 换行） */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}
