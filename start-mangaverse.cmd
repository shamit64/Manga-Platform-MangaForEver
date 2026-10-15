@echo off
rem --------------------------------------------------------------
rem  MangaVerse - double-click to install (first time) and run.
rem  Needs an internet connection the first time. No admin rights,
rem  Docker or PostgreSQL install required.
rem --------------------------------------------------------------
setlocal EnableExtensions
title MangaVerse
cd /d "%~dp0"
if not exist logs mkdir logs

rem -- 1. Node.js 20.19+ (uses your installed Node, or downloads a portable copy into .tools)
set "NODE_OK="
where node >nul 2>nul && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)" >nul 2>nul && set "NODE_OK=1"
if not defined NODE_OK (
  for /d %%D in ("%~dp0.tools\node-v*-win-x64") do set "PATH=%%~fD;%PATH%"
  where node >nul 2>nul && node -e "process.exit(0)" >nul 2>nul && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)" >nul 2>nul && set "NODE_OK=1"
)
if not defined NODE_OK (
  echo Downloading a portable Node.js 22 into .tools ^(one time, about 30 MB^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';" ^
    "New-Item -ItemType Directory -Force '.tools' | Out-Null;" ^
    "try { $v = ((Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version } catch { $v = 'v22.14.0' };" ^
    "Invoke-WebRequest ('https://nodejs.org/dist/' + $v + '/node-' + $v + '-win-x64.zip') -OutFile '.tools\node.zip';" ^
    "Expand-Archive '.tools\node.zip' '.tools' -Force; Remove-Item '.tools\node.zip'" > logs\node-download.log 2>&1
  if errorlevel 1 (
    echo.
    echo Could not download Node.js. Install Node.js 22 LTS from https://nodejs.org and run this file again.
    type logs\node-download.log
    pause
    exit /b 1
  )
  for /d %%D in ("%~dp0.tools\node-v*-win-x64") do set "PATH=%%~fD;%PATH%"
)
for /f "delims=" %%V in ('node -v') do echo Using Node.js %%V

rem -- 2. Dependencies (first run, or after the project changes)
if not exist "node_modules\.package-lock.json" (
  echo Installing dependencies ^(first run, a few minutes^)...
  call npm install --no-audit --no-fund > logs\npm-install.log 2>&1
  if errorlevel 1 (
    echo.
    echo npm install failed. Last lines of logs\npm-install.log:
    powershell -NoProfile -Command "Get-Content logs\npm-install.log -Tail 30"
    pause
    exit /b 1
  )
  echo Dependencies installed.
)

rem -- 3. Database, build and servers
node scripts\local.mjs %*
echo.
echo MangaVerse has stopped.
pause
