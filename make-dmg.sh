#!/usr/bin/env bash
# 一键生成 TALLY dmg（在您自己的终端运行；沙箱内执行会被系统限制）
# 用法：cd tally-tauri && bash make-dmg.sh
set -e

APP="src-tauri/target/release/bundle/macos/TALLY.app"
OUT="src-tauri/target/release/bundle/dmg/TALLY_1.0.0_aarch64.dmg"
STAGE="src-tauri/target/release/bundle/dmg/stage"

if [ ! -d "$APP" ]; then
  echo "未找到 $APP，先执行: npx tauri build --bundles app"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -sfn /Applications "$STAGE/Applications"

hdiutil create -volname "TALLY" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
rm -rf "$STAGE"
echo "完成：$OUT"
