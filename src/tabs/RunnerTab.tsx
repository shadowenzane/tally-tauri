// 跑动精灵 Tab：启用开关 + 精灵设置（嵌套路径样式，对照 panel.py _tab_runner）
import type { Prefs } from '../shared/types';
import { RUNNER_EDGES, RUNNERS, TRAILS, SWATCH_COLORS } from '../shared/types';
import {
  Group, Row, SliderRow, Segmented, SwatchRow, ComboRow, CheckRow, Hint, type TabProps,
} from '../components/ui';

export default function RunnerTab({ prefs, update }: TabProps) {
  const r = prefs.runner;
  return (
    <div className="tab-page">
      <CheckRow
        label="启用跑动精灵（沿屏幕边缘）"
        checked={r.enabled}
        onChange={(v) => update((p) => { p.runner.enabled = v; })}
      />

      <Group title="精灵设置">
        <Row label="贴靠位置">
          <Segmented
            value={r.edge}
            options={RUNNER_EDGES}
            onChange={(v) => update((p) => { p.runner.edge = v as Prefs['runner']['edge']; })}
          />
        </Row>
        <ComboRow
          label="角色"
          value={r.kind}
          options={RUNNERS}
          onChange={(v) => update((p) => { p.runner.kind = v; })}
        />
        <SliderRow
          label="大小"
          value={r.size}
          min={20}
          max={90}
          onChange={(v) => update((p) => { p.runner.size = v; })}
        />
        <SliderRow
          label="奔跑速度（全程绕屏圈数）"
          value={Math.round(r.speed * 10)}
          min={10}
          max={80}
          step={1}
          fmt={(v) => `${(v / 10).toFixed(1)} ×`}
          onChange={(v) => update((p) => { p.runner.speed = v / 10; })}
        />

        {/* 嵌套：路径样式 */}
        <Group title="路径样式">
          <ComboRow
            label="样式"
            value={r.trail}
            options={TRAILS}
            onChange={(v) => update((p) => { p.runner.trail = v as Prefs['runner']['trail']; })}
          />
          <Row label="路径颜色">
            <SwatchRow
              colors={SWATCH_COLORS}
              value={r.trail_color}
              onChange={(col) => update((p) => { p.runner.trail_color = col; })}
            />
          </Row>
          <SliderRow
            label="大小 / 密度"
            value={r.trail_size}
            min={4}
            max={24}
            onChange={(v) => update((p) => { p.runner.trail_size = v; })}
          />
          <SliderRow
            label="粗细（线宽 / 元素大小）"
            value={r.trail_width}
            min={50}
            max={250}
            unit="%"
            onChange={(v) => update((p) => { p.runner.trail_width = v; })}
          />
          <SliderRow
            label="间距（元素间隔 / 虚线空隔）"
            value={r.trail_gap}
            min={50}
            max={250}
            unit="%"
            onChange={(v) => update((p) => { p.runner.trail_gap = v; })}
          />
          <SliderRow
            label="路径透明度"
            value={r.trail_opacity}
            min={10}
            max={100}
            unit="%"
            onChange={(v) => update((p) => { p.runner.trail_opacity = v; })}
          />
          <Hint>{'豆子：经典吃豆人豆粒，每 1/4 圈一颗大豆；虚线/线条：沿路径描线；水滴：顺行进方向的泪滴；圆点：带光晕的等距圆点。\n粗细：虚线/线条的线宽、点状元素的尺寸；间距：点状元素间隔、虚线空隔。\n精灵跑过的路径元素会被"吃掉"，当前圈结束后重新出现。'}</Hint>
        </Group>

        <Hint>{'七种自绘角色沿屏幕四周顺时针奔跑，跑过的路径元素被吃掉。\n贴靠位置可选四周环绕或上/下/左/右单边（单边时速度 = 全程趟数）。\n奔跑速度 = 整个倒计时绕屏圈数：2.0× 即跑两圈、速度翻倍。\n该覆盖层鼠标完全穿透，不影响 PPT / 其他窗口操作。'}</Hint>
      </Group>
    </div>
  );
}
