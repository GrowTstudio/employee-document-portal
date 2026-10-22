@echo off
setlocal
cd /d "%~dp0"
title Employee Document Portal

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js LTS from https://nodejs.org/ and then run this file again.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

if not exist ".env" (
  echo Creating secure first-run configuration...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$secret = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_}); @('ADMIN_PASSWORD=PortalAdmin!7xQ#2026','SESSION_SECRET=' + $secret,'PORT=3000','NODE_ENV=development') | Set-Content -Encoding ascii '.env'"
  if errorlevel 1 (
    echo Could not create .env automatically. Please check Windows PowerShell is available.
    pause
    exit /b 1
  )
  echo.
  echo FIRST-RUN ADMIN PASSWORD: PortalAdmin!7xQ#2026
  echo Use CHANGE_ADMIN_PASSWORD.bat to change it before using real employee documents.
  echo.
)

if not exist "node_modules" (
  echo Installing app components. This needs an internet connection and may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Employee Document Portal...
start "Employee Portal Browser" cmd /c "timeout /t 3 /nobreak ^>nul ^& start http://localhost:3000"
call npm start
pause
