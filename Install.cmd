@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1" %*
if errorlevel 1 (
    echo.
    echo Installazione o aggiornamento non completato. Leggi il messaggio precedente.
    pause
    exit /b 1
)
exit /b 0
