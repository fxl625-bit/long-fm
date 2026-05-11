@echo off
setlocal

cd /d "%~dp0"
title Auralia - One Click Start
set "INIT_STAMP=.auralia_initialized"
set "DB_FILE=prisma\dev.db"

echo [Auralia] Starting in one click...

where npm >nul 2>nul
if errorlevel 1 (
  echo [Auralia] ERROR: npm not found. Please install Node.js 20+ first.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [Auralia] .env not found, creating from .env.example
  copy /y ".env.example" ".env" >nul
)

if not exist "node_modules" (
  echo [Auralia] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Auralia] ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo [Auralia] Releasing local dev locks...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like '*auralia-radio*next*dev*' -or $_.CommandLine -like '*auralia-radio*npm-cli.js* run dev*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

set "NEED_SETUP=0"
if "%AURALIA_FORCE_SETUP%"=="1" set "NEED_SETUP=1"
if not exist "%INIT_STAMP%" set "NEED_SETUP=1"
if not exist "%DB_FILE%" set "NEED_SETUP=1"

if "%NEED_SETUP%"=="1" (
  echo [Auralia] Preparing database and demo data...
  call npm run setup
  if errorlevel 1 (
    echo [Auralia] ERROR: setup failed.
    echo [Auralia] Retry command: npm run setup
    pause
    exit /b 1
  )
  echo initialized>"%INIT_STAMP%"
)

echo [Auralia] Launching app at http://localhost:3000
call npm run dev:netease-api
call npm run dev

endlocal
