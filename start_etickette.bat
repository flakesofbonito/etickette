@echo off
title eTickette System Launcher
color 1F
cls

echo.
echo  =========================================
echo    eTICKETTE SYSTEM LAUNCHER
echo    STI College Fairview
echo  =========================================
echo.

cd /d C:\Users\Kurt\Desktop\eTickette

:: CHECK PYTHON
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found.
    pause & exit
)

:: CHECK FLASK
pip show flask >nul 2>&1
if errorlevel 1 (
    echo  Installing Flask...
    pip install flask flask-cors pyusb --quiet
)

:: START PRINTER SERVER (local only - port 8000)
echo  [1/2] Starting Printer Server on port 8000...
start "" /min cmd /k "title [eTickette] Printer Server && color 2F && python python\printer_server.py"
timeout /t 3 /nobreak >nul

:: VERIFY PRINTER SERVER
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo         Printer server: STARTING...
) else (
    echo         Printer server: RUNNING on port 8000
)

echo  [2/2] Opening pages...
echo.

:: OPEN WEBSITE (Firebase Hosted)
start "" "https://etickette-78f74.web.app/website/index.html"
timeout /t 1 /nobreak >nul

:: OPEN MONITOR (Firebase Hosted)
start "" "https://etickette-78f74.web.app/monitor/index.html"
timeout /t 1 /nobreak >nul

:: OPEN KIOSK (Firebase Hosted - fullscreen)
start "" "https://etickette-78f74.web.app/kiosk/index.html"
timeout /t 2 /nobreak >nul

:: SEND F11 TO MAKE KIOSK FULLSCREEN
powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('{F11}')"

echo.
echo  =========================================
echo    ALL SYSTEMS RUNNING
echo  =========================================
echo.
echo    Printer Server : http://localhost:8000
echo    Health Check   : http://localhost:8000/health
echo.
echo    Website  : https://etickette-78f74.web.app/website/index.html
echo    Monitor  : https://etickette-78f74.web.app/monitor/index.html
echo    Kiosk    : https://etickette-78f74.web.app/kiosk/index.html
echo.
echo    Camera works on all devices (HTTPS)
echo    Share Kiosk URL to any phone to test
echo.
echo    To stop, run stop_etickette.bat
echo  =========================================
echo.
pause