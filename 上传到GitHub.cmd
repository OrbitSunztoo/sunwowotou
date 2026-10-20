@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"
title ふわり Fuwari - 上传到 GitHub

rem ============================================================
rem  把本地改好的内容 + 图片推到 GitHub，Pages 会自动更新
rem  第一次运行会问你要两样东西（都只存在本机）：
rem    1. GitHub 仓库地址（owner/名称）
rem    2. GitHub 令牌（只勾 Contents: Read and write）
rem ============================================================

set "NODE=%~dp0.runtime\node.exe"
if not exist "%NODE%" (
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined SYS_NODE set "SYS_NODE=%%N"
  if defined SYS_NODE set "NODE=%SYS_NODE%"
)
if not exist "%NODE%" goto :no_node

rem 第一次上传前顺手装好图片压缩（装了 sharp 之后图片才会自动转 webp，网站加载快很多）
if not exist "%~dp0node_modules\sharp" call :install_sharp

"%NODE%" "%~dp0upload.js" %*
echo.
echo  按任意键关闭这个窗口...
pause >nul
exit /b 0

rem ------------------------------------------------------------
:install_sharp
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   这台电脑上没有 npm，图片会原样上传（不影响使用，只是网站加载会慢一点）
  echo.
  exit /b 0
)
echo.
echo   第一次上传前先装一个图片压缩工具（只需要这一次，大概十几秒）...
echo.
call npm install --no-audit --no-fund --loglevel=error
echo.
exit /b 0

rem ------------------------------------------------------------
:no_node
echo.
echo   ✗ 找不到 Node 运行时：先双击「打开后台.cmd」，它会自动准备环境。
echo.
echo   按任意键退出...
pause >nul
exit /b 1
