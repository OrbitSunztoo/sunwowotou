@echo off
chcp 65001 >nul
setlocal enableextensions
cd /d "%~dp0"
title ふわり Fuwari - 本地编辑

rem ============================================================
rem  ふわり Fuwari · 双击打开本地编辑窗口（不需要安装任何东西）
rem     · 第一次会从 Windows 自带的 Node 运行时拷一份到 .runtime\
rem     · 然后启动后端，用 Edge 应用窗口打开管理后台
rem     · 关掉那个窗口 = 关掉编辑
rem ============================================================

set "NODE=%~dp0.runtime\node.exe"
if not exist "%NODE%" call :prepare
if not exist "%NODE%" (
  rem 没有打包运行时，就找系统里已装的 Node
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined SYS_NODE set "SYS_NODE=%%N"
  if defined SYS_NODE set "NODE=%SYS_NODE%"
)

if not exist "%NODE%" goto :no_node

"%NODE%" "%~dp0server\desktop.js" %*
echo.
echo  按任意键关闭这个窗口...
pause >nul
exit /b 0

rem ------------------------------------------------------------
:prepare
echo.
echo   第一次使用，正在准备运行环境（只需要做一次）...
echo.
if not exist "%~dp0.runtime" mkdir "%~dp0.runtime" >nul 2>nul

set "NODEEXE="
for /f "delims=" %%P in ('where node 2^>nul') do if not defined NODEEXE set "NODEEXE=%%P"
if not defined NODEEXE goto :try_npm
echo   从 %NODEEXE% 复制运行时...
copy /y "%NODEEXE%" "%~dp0.runtime\node.exe" >nul 2>nul
if exist "%~dp0.runtime\node.exe" goto :prepare_done

:try_npm
if exist "%~dp0.runtime\npm.cmd" goto :prepare_done
where npm >nul 2>nul
if errorlevel 1 goto :prepare_done
echo   从 npm 自带的运行时复制...
call :find_npm_node
if exist "%~dp0.runtime\node.exe" goto :prepare_done

:prepare_done
if exist "%~dp0.runtime\node.exe" (
  echo   运行环境准备好了 ✓
  echo.
  exit /b 0
)
if exist "%~dp0.runtime\npm.cmd" (
  echo   运行环境准备好了 ✓
  echo.
  exit /b 0
)
exit /b 1

:find_npm_node
for /f "delims=" %%N in ('where npm 2^>nul') do call :copy_from_npm "%%~dpN"
exit /b 0

:copy_from_npm
set "NPMDIR=%~1"
if not exist "%NPMDIR%node.exe" exit /b 0
copy /y "%NPMDIR%node.exe" "%~dp0.runtime\node.exe" >nul 2>nul
if exist "%NPMDIR%npm.cmd" copy /y "%NPMDIR%npm.cmd" "%~dp0.runtime\npm.cmd" >nul 2>nul
if not exist "%~dp0.runtime\node_modules\npm" (
  xcopy /e /i /q /y "%NPMDIR%node_modules\npm" "%~dp0.runtime\node_modules\npm" >nul 2>nul
)
exit /b 0

rem ------------------------------------------------------------
:no_node
echo.
echo   ✗ 这台电脑上暂时找不到可以用的 Node 运行时。
echo.
echo   办法一：安装 Node.js 18 或更新版本（https://nodejs.org 下载 LTS）
echo           装完之后再双击这个文件就行。
echo.
echo   办法二：如果你是在 GitHub 下载的源码压缩包，看看有没有
echo           runtime-windows-x64.zip，解压到 .runtime 文件夹里。
echo.
echo   按任意键退出...
pause >nul
exit /b 1
