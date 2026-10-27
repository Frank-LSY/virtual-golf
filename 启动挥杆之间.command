#!/bin/bash
source "$(dirname "$0")/scripts/mac-common.sh"
printf '\n挥杆之间 · Mac 中文版\n保留此窗口即可持续运行游戏，按 Control+C 停止。\n\n'
if "$SL_NODE" scripts/start-local.js; then exit 0; else
  sl_result=$?
  read -r -p '启动失败，按回车键关闭窗口。' _ || true
  exit "$sl_result"
fi
