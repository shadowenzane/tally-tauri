// 流光灯条 Tab：启用开关 + 灯条设置（贴靠位置联动动态文案，对照 panel.py _tab_bar / _update_bar_ui_state）
import type { Prefs } from '../shared/types';
import { BAR_EDGES, SWATCH_COLORS } from '../shared/types';
import {
  Group, Row, SliderRow, Segmented, SwatchRow, CheckRow, Hint, type TabProps,
} from '../components/ui';

export default function BarTab({ prefs, update }: TabProps) {
  const b = prefs.bar;
  const around = b.edge === 'around';
  // 贴靠边中文名（非环绕时使用；环绕文案单独处理）
  const edgeName = around ? '' : (BAR_EDGES.find(([id]) => id === b.edge)?.[1] ?? '上');
  const horiz = b.edge === 'top' || b.edge === 'bottom';
  // 长度/偏移行 label 随贴靠位置动态变化
  const lenLabel = around
    ? '长度（环绕模式为完整一圈）'
    : `长度（占${edgeName}边${horiz ? '宽度' : '高度'}比例）`;
  const offLabel = around
    ? '偏移（倒计时起点位置）'
    : `偏移（离屏幕${edgeName}边缘的距离）`;
  // 动态提示文案（对照 panel.py 2812-2836 行）
  const note = around
    ? '环绕模式：灯条沿屏幕四周连成一整圈，亮段代表剩余时间，从起点（白色标记）顺时针收缩；拖动偏移时起点标记即时移动。'
    : `灯条沿屏幕${edgeName}边${horiz ? '水平居中' : '垂直居中'}放置，长度代表总时长，亮段随剩余时间收缩；偏移控制灯条离${edgeName}边缘的距离——0% 贴边，100% 移到屏幕中央。`;
  return (
    <div className="tab-page">
      <CheckRow
        label="启用流光灯条（贴屏幕边缘）"
        checked={b.enabled}
        onChange={(v) => update((p) => { p.bar.enabled = v; })}
      />

      <Group title="灯条设置">
        <Row label="贴靠位置">
          <Segmented
            value={b.edge}
            options={BAR_EDGES}
            onChange={(v) => update((p) => { p.bar.edge = v as Prefs['bar']['edge']; })}
          />
        </Row>
        <SliderRow
          label={lenLabel}
          value={b.length}
          min={10}
          max={100}
          unit="%"
          disabled={around}
          onChange={(v) => update((p) => { p.bar.length = v; })}
        />
        <SliderRow
          label={offLabel}
          value={b.offset}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => update((p) => { p.bar.offset = v; })}
        />
        <SliderRow
          label="粗细"
          value={b.thickness}
          min={4}
          max={40}
          unit=" px"
          onChange={(v) => update((p) => { p.bar.thickness = v; })}
        />
        <Row label="颜色">
          <SwatchRow
            colors={SWATCH_COLORS}
            value={b.color}
            onChange={(col) => update((p) => { p.bar.color = col; })}
          />
        </Row>
        <SliderRow
          label="透明度"
          value={b.opacity}
          min={10}
          max={100}
          unit="%"
          onChange={(v) => update((p) => { p.bar.opacity = v; })}
        />
        <SliderRow
          label="超时提示字号"
          value={b.overtime_size}
          min={10}
          max={60}
          unit=" px"
          onChange={(v) => update((p) => { p.bar.overtime_size = v; })}
        />
        <Hint>{note}</Hint>
      </Group>
    </div>
  );
}
