#!/bin/bash
source "$(dirname "$0")/scripts/mac-common.sh"
umask 077
printf '\n正在为这台 Mac 生成本地连接证书…\n\n'
if "$SL_NODE" scripts/setup-https.js; then
  printf '\n配置完成后，请关闭正在运行的游戏，再双击“启动挥杆之间.command”。\n'
else
  printf '\n配置未完成，请根据上方提示重试。\n'
fi
read -r -p '按回车键关闭窗口。' _ || true
