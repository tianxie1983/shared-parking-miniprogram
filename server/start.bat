@echo off
chcp 65001 >nul
title 共享停车 - 本地后端服务器
echo ========================================
echo   共享停车 - 本地后端服务器
echo ========================================
echo.
echo 正在启动服务器...
echo.
node "%~dp0server.js"
pause
