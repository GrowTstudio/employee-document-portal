@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  echo First run START_PORTAL.bat once to create the configuration.
  pause
  exit /b 1
)
echo Choose a strong password. Do not reuse your email or banking password.
set /p NEWPASS=Enter new admin password: 
if "%NEWPASS%"=="" (
  echo Password cannot be blank.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = $env:NEWPASS; $f = '.env'; $lines = Get-Content $f; $found = $false; $lines = $lines | ForEach-Object { if ($_ -match '^ADMIN_PASSWORD=') { $found = $true; 'ADMIN_PASSWORD=' + $p } else { $_ } }; if (-not $found) { $lines += 'ADMIN_PASSWORD=' + $p }; Set-Content -Encoding ascii $f $lines"
if errorlevel 1 (
  echo Could not update password.
) else (
  echo Admin password updated. Stop and restart the portal for it to take effect.
)
set NEWPASS=
pause
