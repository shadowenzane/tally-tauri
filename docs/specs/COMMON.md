# 渲染层移植通用规范（四个子代理必读）

## 任务背景
将 PySide6 倒计时应用的 QPainter 绘制逻辑 1:1 移植为 TypeScript Canvas 2D 模块。
项目：/Users/shadowen/Documents/TRAE/tally-tauri（Tauri 2 + React，本任务只写纯 TS 渲染模块，不涉及 React/Tauri API）。

## 必读文件（先读再写）
- /Users/shadowen/Documents/TRAE/tally-tauri/src/shared/types.ts —— Frame/SpriteCtx/枚举表/字模表
- /Users/shadowen/Documents/TRAE/tally-tauri/src/shared/color.ts —— rgba()/hsla()/hexRgb()/WARN_COLOR
- /Users/shadowen/Documents/TRAE/tally-tauri/src/shared/effects.ts —— applyBlink/blinkScale/shimmerColor/shimmerAlpha/overtimeFill/paintOvertimeCard
- /Users/shadowen/Documents/TRAE/tally-tauri/src/shared/view.ts —— fmt()/deriveView()/dotText()/colonOn()
- /Users/shadowen/Documents/TRAE/tally-tauri/src/shared/canvas.ts —— roundRectPath()/fillEllipse()/strokeLine()
- Python 源：/Users/shadowen/Documents/TRAE/tally/windows.py（全部绘制逻辑）、必要时 tally/effects.py

## 额外约定
- 圆角矩形一律用 shared/canvas.ts 的 roundRectPath（不使用较新的 ctx.roundRect）。
- 点阵文本用 view.ts 的 dotText(remainingSec)；冒号闪烁用 colonOn(st, view.warning, t)。
- strokeText 可直接描边文字（霓虹辉光用 4 层不同 lineWidth/alpha 的 strokeText 实现，对应 Python 的 strokePath(glow_path)）。

## Qt → Canvas 转换规则（关键）
1. **坐标**：ctx 已按 devicePixelRatio 缩放，全部使用逻辑像素，与 Python 数值直接对应。
2. **颜色/透明度**：Python QColor.setAlpha(0..255) → `rgba(hex, a/255)`（color.ts）。QColor.fromHsl(h,s,l) → `hsla(h,s,l,a)`。
3. **文本**：QFont(family, pixelSize, Bold) → `ctx.font = \`bold ${px}px ${family || '"Helvetica Neue"'}\``（注意 family 为空时用默认）。drawText 居中 → ctx.textAlign/textBaseline 设置后 fillText。
4. **字体基线**：Qt `base_y = cy + fm.height()/2 - fm.descent()`。Canvas 近似：`const m = ctx.measureText('X'); const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent; const baseY = cy + (asc + desc) / 2 - desc;`（textBaseline='alphabetic'）。
5. **弧**：QPainterPath.arcTo(rect, startDeg, sweepDeg) 中 Qt 角度 90°=屏幕上方（数学系）。映射规则：Qt 角 θ → Canvas 角 -θ·π/180；正 sweep（屏幕逆时针）→ `ctx.arc(cx, cy, r, -start*D, -(start+sweep)*D, true)`；负 sweep → `..., false)`（D=Math.PI/180）。例：吃豆人 `arcTo(QRectF(-r,-r,size,size), mouth/2, 360-mouth)` → `ctx.arc(0,0,r, -mouth/2*D, -(mouth/2+360-mouth)*D, true)` 后 closePath。
6. **路径**：quadTo→quadraticCurveTo；cubicTo→bezierCurveTo；moveTo/lineTo/closeSubpath 同名；QPainterPath+drawPath+fill → beginPath+…+fill()。
7. **圆**：drawEllipse(QPointF(x,y), rx, ry) → `ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,2π); ctx.fill()`。
8. **变换**：p.rotate(deg) → ctx.rotate(deg·π/180)；p.translate→ctx.translate；p.shear(-0.08,0) → ctx.transform(1,0,-0.08,1,0,0)；setOpacity(a/255) → ctx.globalAlpha=a/255。
9. **画笔**：QPen(color, w, Solid, RoundCap, RoundJoin) → `ctx.strokeStyle=…; ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round'`。setDashPattern([a,b]) → ctx.setLineDash([a,b])。
10. **渐变**：QLinearGradient(x0,y0,x1,y1) → ctx.createLinearGradient；QRadialGradient(QPointF,r) → ctx.createRadialGradient(x,y,0,x,y,r)。
11. **状态**：所有修改全局状态的绘制用 ctx.save()/restore() 包裹；禁止泄漏状态。

## 编码约定
- TypeScript strict（无隐式 any）；零外部依赖（只用 shared/* 导入）；中文注释；逻辑与视觉效果逐行对齐 Python 源（数值常量不得改动）。
- 不运行 npm/tsc（项目未完整）；确保语法与类型正确即可。
- 模块级可缓存状态（如字形轮廓缓存、秒跳动画状态）用模块变量。
- paintOvertimeCard 在 shared/effects.ts 已实现，直接调用。
