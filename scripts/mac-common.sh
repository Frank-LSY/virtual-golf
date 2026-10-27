#!/bin/bash
# 由根目录中的 .command 启动器载入。
set -eu
SL_ROOT="$(cd "$(dirname "$0")" && pwd -P)"
cd "$SL_ROOT"
sl_fail() { printf '\n%s\n' "$1"; read -r -p '按回车键关闭窗口。' _ || true; exit 1; }
if [ "$(uname -s)" != 'Darwin' ]; then sl_fail '这是 Mac 启动器。Windows 请使用“启动挥杆之间.cmd”。'; fi
if [ -f "$SL_ROOT/runtime/node" ]; then
  SL_NODE="$SL_ROOT/runtime/node"
elif command -v node >/dev/null 2>&1; then
  SL_NODE="$(command -v node)"
else
  sl_fail '找不到运行环境。请完整解压 Mac 启动包，或安装 Node.js 20 及以上版本。'
fi
if ! "$SL_NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' >/dev/null 2>&1; then
  sl_fail '运行环境无法启动。请确认下载的是与你的 Mac 芯片对应的版本；开发环境需要 Node.js 20 及以上。'
fi
if [ ! -f "$SL_ROOT/node_modules/three/package.json" ] || [ ! -f "$SL_ROOT/node_modules/ws/package.json" ] || [ ! -f "$SL_ROOT/node_modules/qrcode/package.json" ]; then
  sl_fail '游戏依赖不完整。请重新解压完整启动包；源代码版请先运行 npm ci。'
fi
export SL_ROOT SL_NODE
