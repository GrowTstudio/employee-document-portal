@echo off
setlocal
cd /d "%~dp0"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set STAMP=%%i
set DEST=backup_%STAMP%
mkdir "%DEST%" 2>nul
if exist "data" xcopy "data" "%DEST%\data\" /E /I /H /Y >nul
if exist "uploads" xcopy "uploads" "%DEST%\uploads\" /E /I /H /Y >nul
echo Backup created in folder: %DEST%
echo Keep this backup private because it contains employee personal data and documents.
pause
