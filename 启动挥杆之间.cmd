@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 20 及以上版本，然后重新打开此文件。
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --omit=dev
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
echo 挥杆之间 · 中文版
echo 游戏就绪后将自动打开浏览器。保留此窗口，按 Ctrl+C 停止。
node scripts/start-local.js
pause
