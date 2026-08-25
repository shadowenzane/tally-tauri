// 数字钟 Tab：启用开关 + 显示模式与字体（含嵌套轮廓流光参数） + 独立配色（对照 panel.py _tab_clock）
import type { Prefs } from '../shared/types';
import { CLOCK_MODES, LED_STYLES, SWATCH_COLORS, BG_COLORS } from '../shared/types';
import {
  Group, Row, SliderRow, Segmented, SwatchRow, ComboRow, CheckRow, Hint, type TabProps,
} from '../components/ui';

/** 字体候选（datalist 选项；空 = 默认字体） */
const FONT_FAMILIES = [
  'Helvetica Neue', 'PingFang SC', 'Songti SC', 'Kaiti SC', 'Arial',
  'Courier New', 'Georgia', 'Impact', 'Times New Roman', 'Menlo',
];

/** 流光"彩虹"特殊块背景（对应 Python FLOW_RAINBOW_BG） */
const FLOW_RAINBOW_BG = 'linear-gradient(135deg,#FF453A,#FFB224,#3DDC84,#38BDF8,#A78BFA)';

export default function ClockTab({ prefs, update }: TabProps) {
  const c = prefs.clock;
  // 点阵/数码管为自绘图形，不使用字体——置灰字体选择避免误解
  const fontOk = c.mode === 'normal' || c.mode === 'analog';
  return (
    <div className="tab-page">
      <CheckRow
        label="启用数字钟（独立窗口）"
        checked={c.enabled}
        onChange={(v) => update((p) => { p.clock.enabled = v; })}
      />

      <Group title="显示模式与字体">
        <Row label="显示模式">
          <Segmented
            value={c.mode}
            options={CLOCK_MODES}
            onChange={(v) => update((p) => { p.clock.mode = v as Prefs['clock']['mode']; })}
          />
        </Row>
        <Row label="字体（大数字/圆环中心数字）">
          <input
            className="text-input"
            list="tally-fonts"
            placeholder="默认字体"
            value={c.font_family}
            disabled={!fontOk}
            title={fontOk
              ? '字体作用于大数字与圆环中心数字'
              : '当前模式（点阵/数码管）为自绘图形，不使用字体'}
            onChange={(e) => update((p) => { p.clock.font_family = e.target.value; })}
          />
        </Row>
        <datalist id="tally-fonts">
          <option value="" label="默认字体" />
          {FONT_FAMILIES.map((f) => <option key={f} value={f} />)}
        </datalist>
        <SliderRow
          label="字号（大数字/圆环/数码管）"
          value={c.font_size}
          min={30}
          max={300}
          onChange={(v) => update((p) => { p.clock.font_size = v; })}
        />
        <SliderRow
          label="点径（点阵模式）"
          value={c.dot_size}
          min={6}
          max={36}
          onChange={(v) => update((p) => { p.clock.dot_size = v; })}
        />
        <ComboRow
          label="数码管样式（数码管模式）"
          value={c.led_style}
          options={LED_STYLES}
          onChange={(v) => update((p) => { p.clock.led_style = v as Prefs['clock']['led_style']; })}
        />
        <SliderRow
          label="发光强度（数码管模式）"
          value={c.glow}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => update((p) => { p.clock.glow = v; })}
        />
        <CheckRow
          label="大数字模式：流光沿数字轮廓轨道奔跑（彗星拖尾）"
          checked={c.edge_flow}
          onChange={(v) => update((p) => { p.clock.edge_flow = v; })}
        />

        {/* 嵌套：轮廓流光参数（勾选启用后可用） */}
        <Group title="轮廓流光参数" disabled={!c.edge_flow}>
          <SliderRow
            label="奔跑速度（1.0× ≈ 5 秒/圈）"
            value={Math.round(c.flow_speed * 10)}
            min={2}
            max={40}
            step={1}
            fmt={(v) => `${(v / 10).toFixed(1)} ×`}
            onChange={(v) => update((p) => { p.clock.flow_speed = v / 10; })}
          />
          <Row label="流光颜色（彩虹 = 色相流动）">
            <SwatchRow
              colors={SWATCH_COLORS}
              value={c.flow_color}
              special={{ rainbow: { label: '彩虹', bg: FLOW_RAINBOW_BG } }}
              onChange={(col) => update((p) => { p.clock.flow_color = col; })}
            />
          </Row>
          <SliderRow
            label="流光透明度"
            value={c.flow_opacity}
            min={10}
            max={100}
            unit="%"
            onChange={(v) => update((p) => { p.clock.flow_opacity = v; })}
          />
          <SliderRow
            label="拖尾范围（占轮廓周长）"
            value={c.flow_range}
            min={5}
            max={80}
            unit="%"
            onChange={(v) => update((p) => { p.clock.flow_range = v; })}
          />
        </Group>

        <Hint>字体作用于大数字与圆环中心数字；点阵/数码管为自绘图形，不受字体影响。</Hint>
      </Group>

      <Group title="数字钟独立配色">
        <Row label="数字颜色">
          <SwatchRow
            colors={SWATCH_COLORS}
            value={c.digit_color}
            onChange={(col) => update((p) => { p.clock.digit_color = col; })}
          />
        </Row>
        <Row label="背景颜色">
          <SwatchRow
            colors={BG_COLORS}
            value={c.bg_color}
            onChange={(col) => update((p) => { p.clock.bg_color = col; })}
          />
        </Row>
        <SliderRow
          label="背景透明度（0 为纯透明）"
          value={c.bg_opacity}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => update((p) => { p.clock.bg_opacity = v; })}
        />
        <CheckRow
          label="数字钟窗口置顶"
          checked={c.topmost}
          onChange={(v) => update((p) => { p.clock.topmost = v; })}
        />
      </Group>
    </div>
  );
}
