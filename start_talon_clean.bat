@echo off
chcp 65001 > nul
set PYTHONIOENCODING=utf-8
cls
echo ========================================
echo   TALON SYSTEM v2.0 - AVVIO
echo ========================================
echo.
cd /d F:\talon_app
F:\python\python.exe app.py
pause
