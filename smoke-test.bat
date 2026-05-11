@echo off
setlocal

cd /d "%~dp0"
title Auralia - One Click Smoke Test

echo [Auralia] Running one-click smoke test...

where npm >nul 2>nul
if errorlevel 1 (
  echo [Auralia] ERROR: npm not found. Please install Node.js 20+ first.
  pause
  exit /b 1
)

call npm run mvp:smoke
set RESULT=%ERRORLEVEL%

if not "%RESULT%"=="0" (
  echo [Auralia] Smoke test failed.
  pause
  exit /b %RESULT%
)

echo [Auralia] Smoke test passed.
pause
endlocal
