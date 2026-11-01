@echo off
cd /d "%~dp0"
chcp 65001 >nul
rem 旧名称，保留以兼容旧的快捷方式；新的入口是 Start MotionParty.cmd。
call "%~dp0启动体感派对.cmd"
