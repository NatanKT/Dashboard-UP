@echo off
title Dashboard UP - Rencana vs Produksi
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8787"
python app.py
echo.
pause
