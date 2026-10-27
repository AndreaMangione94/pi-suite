@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reinstalla-PiSuite.ps1" %*
if errorlevel 1 (
    echo.
    echo Reinstallazione non completata. Leggi il messaggio precedente.
    pause
    exit /b 1
)
pause