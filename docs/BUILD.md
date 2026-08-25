# TALLY 打包指南

## 一、macOS dmg（本机直接打包）

```bash
cd tally-tauri
npm run tauri build          # 产物在 src-tauri/target/release/bundle/dmg/
```

若 `tauri build` 的 dmg 步骤失败（如在受限沙箱环境，hdiutil 无法挂载虚拟磁盘），
编译产物 .app 仍已生成，此时用一键脚本（在您自己的终端运行）：

```bash
bash make-dmg.sh             # 基于 .app 手工制作 dmg（含 Applications 快捷方式）
```

产物：
- `TALLY_1.0.0_aarch64.dmg` — 磁盘映像安装包
- `src-tauri/target/release/bundle/macos/TALLY.app` — 应用包（可直接双击运行）
- `release/TALLY_1.0.0_aarch64.app.zip` — 分发用压缩包

说明：
- 未签名/未公证。首次打开需右键 → 打开，或在"系统设置 → 隐私与安全性"中允许。
- 如需分发他人，建议加入 Apple 开发者签名与公证（`tauri signing` 配置）。
- 通用二进制（Intel+Apple Silicon）：`rustup target add x86_64-apple-darwin` 后
  `npx tauri build --target universal-apple-darwin`。

## 二、Windows exe

Tauri 不支持从 macOS 交叉编译 Windows 安装器（NSIS 工具链仅限 Windows）。两种方式：

### 方式 A：GitHub Actions（推荐，无需 Windows 机器）
1. 把 `tally-tauri/` 推到 GitHub 仓库（工作流已在 `.github/workflows/build.yml`）
2. 手动触发：仓库页 Actions → Build TALLY → Run workflow
3. 结束后在 Artifacts 下载 `TALLY-Windows-x64`（含 NSIS 安装器 exe + 便携 exe）
4. 打 `v*` 标签（如 `git tag v1.0.0 && git push --tags`）会自动创建 Release 并附产物

### 方式 B：Windows 机器本地打包
```powershell
# 前置：Node 20+、Rust（rustup）、VS Build Tools（C++ 桌面开发负载）
cd tally-tauri
npm install
npx tauri build               # NSIS 安装器 + 便携 exe
```
产物：`src-tauri\tauri.target\release\bundle\nsis\TALLY_1.0.0_x64-setup.exe`
便携版：`src-tauri\target\release\tally-tauri.exe`

## 三、Linux（可选）
```bash
npx tauri build --bundles deb,appimage
```

## 四、常用命令速查
| 命令 | 用途 |
|---|---|
| `npm run tauri dev` | 开发调试 |
| `npm run tauri build` | 当前平台打包 |
| `npx tauri build --debug` | 带 devtools 的发布包 |
