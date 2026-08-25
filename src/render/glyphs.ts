// 文字轮廓轨道提取（大数字边缘流光用）。
// Canvas 无法像 Qt QPainterPath.toSubpathPolygons() 直接取字形轮廓多边形，
// 这里用「离屏渲染 + 边界像素就近链接」得到等价的闭合折线赛道。
// 对应 Python tally/windows.py ClockWindow._paint_digits 的轨道构建（任务行号 850-877）。

/** 流光轨道：pts 顺序连成一条「赛道」；lens[i] 为 pts[i]→pts[i+1] 段长，-1 表示轮廓间跳变段 */
export interface FlowTrack {
  pts: { x: number; y: number }[];
  lens: number[];
  cum: number[];       // cum[i] = 第 i 段起点的累积弧长（跳变段宽度为 0）
  total: number;       // 正长度段总长（跳变段不计入）
  jumps: number[];     // jumps[i] = 第 i 段之前出现的跳变段个数
}

// ---- 模块级轨道缓存：key=(text, round(x0,1), round(baselineY,1), fontCss)，容量超 8 清空 ----
const _trackCache = new Map<string, FlowTrack>();

/** 半径 2.3px 内的候选偏移，按距离升序（近者优先；与追踪半径一致） */
const _OFFS = (() => {
  const list: { dx: number; dy: number; d2: number }[] = [];
  const r2 = 2.3 * 2.3;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 <= r2) list.push({ dx, dy, d2 });
    }
  }
  list.sort((a, b) => a.d2 - b.d2);
  return list;
})();

/** 空轨道（异常 / 空文本兜底） */
function _emptyTrack(): FlowTrack {
  return { pts: [], lens: [], cum: [], total: 0, jumps: [] };
}

/**
 * 提取 text 在 (x0, baselineY) 以 fontCss 渲染时的字形轮廓轨道。
 * 布局与 digits.ts 的显示完全一致：等宽字距（'0' 的 advance），每个字符在单元内水平居中，
 * 等价于 Python 逐字符 addText 后 toSubpathPolygons 的拼接方式。
 */
export function glyphTrack(text: string, x0: number, baselineY: number, fontCss: string): FlowTrack {
  if (!text) return _emptyTrack();
  const key =
    `${text}\u0001${Math.round(x0 * 10) / 10}` +
    `\u0001${Math.round(baselineY * 10) / 10}\u0001${fontCss}`;
  const hit = _trackCache.get(key);
  if (hit) return hit;
  const tr = _buildTrack(text, x0, baselineY, fontCss);
  _trackCache.set(key, tr);
  if (_trackCache.size > 8) _trackCache.clear();   // 容量超 8 清空
  return tr;
}

function _buildTrack(text: string, x0: number, baselineY: number, fontCss: string): FlowTrack {
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d');
  if (!c) return _emptyTrack();

  // ---- 1. 布局测量：chW = '0' 的 advance；第 i 个字符左缘 = x0 + i*chW + (chW - adv_i)/2 ----
  c.font = fontCss;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const chars = [...text];
  const chW = c.measureText('0').width;
  const px: number[] = [];
  let inkL = Infinity;
  let inkR = -Infinity;
  let asc = 0;
  let desc = 0;
  for (let i = 0; i < chars.length; i++) {
    const m = c.measureText(chars[i]);
    px.push(x0 + i * chW + (chW - m.width) / 2);
    inkL = Math.min(inkL, px[i] - (m.actualBoundingBoxLeft ?? 0));
    inkR = Math.max(inkR, px[i] + (m.actualBoundingBoxRight ?? m.width));
    asc = Math.max(asc, m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 0);
    desc = Math.max(desc, m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0);
  }

  // ---- 2. 离屏渲染（白色；L/T 为整数平移，保证与主画布同亚像素位置栅格化） ----
  const pad = 8;
  const L = Math.floor(inkL) - pad;
  const T = Math.floor(baselineY - asc) - pad;
  const W = Math.max(1, Math.ceil(inkR) + pad - L);
  const H = Math.max(1, Math.ceil(baselineY + desc) + pad - T);
  cv.width = W;
  cv.height = H;
  c.font = fontCss;                 // 修改画布尺寸会重置状态，需重新设置
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff';
  for (let i = 0; i < chars.length; i++) {
    c.fillText(chars[i], px[i] - L, baselineY - T);
  }
  const data = c.getImageData(0, 0, W, H).data;

  // ---- 3. 边界像素：alpha≥128 且 4 邻域存在 alpha<128（画布外视作透明） ----
  const alphaAt = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3];
  const bound = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] >= 128 &&
          (alphaAt(x - 1, y) < 128 || alphaAt(x + 1, y) < 128 ||
           alphaAt(x, y - 1) < 128 || alphaAt(x, y + 1) < 128)) {
        bound[y * W + x] = 1;
      }
    }
  }

  // ---- 4. 就近链接成闭合折线：按扫描顺序（文档顺序）逐条提取 ----
  const visited = new Uint8Array(W * H);
  const closeR2 = 2.3 * 2.3;        // 「回到起点附近」的判定半径
  const pts: { x: number; y: number }[] = [];
  const lens: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!bound[y * W + x] || visited[y * W + x]) continue;
      // 从未访问边界像素出发贪婪追踪：每步取半径 2.3px 内最近的未访问边界像素
      const start = { x: x + L, y: y + T };
      const poly: { x: number; y: number }[] = [start];
      visited[y * W + x] = 1;
      let cx = x;
      let cy = y;
      for (;;) {
        const ddx = cx - x;
        const ddy = cy - y;
        if (poly.length >= 8 && ddx * ddx + ddy * ddy <= closeR2) break;   // 回到起点附近 → 闭环
        let moved = false;
        for (const o of _OFFS) {
          const nx = cx + o.dx;
          const ny = cy + o.dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (bound[ni] && !visited[ni]) {
            visited[ni] = 1;
            poly.push({ x: nx + L, y: ny + T });   // 相异像素间距必 ≥1px，天然满足去重要求
            cx = nx;
            cy = ny;
            moved = true;
            break;
          }
        }
        if (!moved) break;          // 走到尽头（闭环自然停在起点旁）
      }
      poly.push(poly[0]);           // 末尾补回起点，与 Qt 闭合多边形结构一致
      if (poly.length < 6) continue;          // 退化轮廓丢弃（同 Python len(ps)<6）
      if (pts.length > 0) lens.push(-1.0);    // 轮廓之间的跳变段
      for (const p of poly) pts.push(p);
      for (let k = 0; k + 1 < poly.length; k++) {
        lens.push(Math.hypot(poly[k + 1].x - poly[k].x, poly[k + 1].y - poly[k].y));
      }
    }
  }

  // ---- 5. 累积弧长与跳变计数（对应 Python 的 cum/tot/jumps） ----
  const cum: number[] = [];
  const jumps: number[] = [];
  let total = 0;
  let j = 0;
  for (const seg of lens) {
    cum.push(total);
    if (seg > 0) total += seg;
    jumps.push(j);
    if (seg < 0) j += 1;
  }
  return { pts, lens, cum, total, jumps };
}

/**
 * 弧长参数 s → 轨道坐标与所在段号（移植 Python _pt(s)，任务行号 880-891）。
 * s 可为任意实数：内部对 total 取模并归一到 [0, total)（Python 的 % 恒非负，JS 需手动归一）。
 */
export function trackPoint(tr: FlowTrack, s: number): { x: number; y: number; seg: number } {
  if (tr.total <= 0 || tr.lens.length === 0) return { x: 0, y: 0, seg: 0 };   // 空轨道兜底
  let sv = s % tr.total;
  if (sv < 0) sv += tr.total;
  const i0 = _bisectRight(tr.cum, sv) - 1;
  let i = i0 >= tr.lens.length ? tr.lens.length - 1 : i0;
  while (tr.lens[i] <= 0) {         // 跳过跳变段 / 零长段
    i = (i + 1) % tr.lens.length;
  }
  const segLen = tr.lens[i];
  const u = segLen <= 0 ? 0 : Math.max(0, Math.min(1, (sv - tr.cum[i]) / segLen));
  const a = tr.pts[i];
  const b = tr.pts[i + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, seg: i };
}

/** 升序数组中 v 的右插入位置（等价 Python bisect.bisect_right） */
function _bisectRight(arr: number[], v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}