@echo off
title eTickette Kiosk Launcher
color 1F
cls
echo.
echo  =========================================
echo    eTICKETTE KIOSK LAUNCHER
echo    STI College Fairview
echo  =========================================
echo.
cd /d C:\Users\Kurt\Desktop\etickette

python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found.
    pause & exit
)

pip show flask >nul 2>&1
if errorlevel 1 (
    echo  Installing Flask...
    pip install flask flask-cors pyusb --quiet
)

echo  Starting Printer Server on port 8000...
start "" /min cmd /k "title [eTickette] Printer Server && color 2F && python python\printer_server.py"
timeout /t 3 /nobreak >nul

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo  Printer server: STARTING...
) else (
    echo  Printer server: RUNNING on port 8000
)

echo  Opening Kiosk...
start "" "http://localhost:8000/website/kiosk/index.html"
timeout /t 2 /nobreak >nul

powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('{F11}')"

echo.
echo  =========================================
echo    KIOSK RUNNING
echo  =========================================
echo.
echo    Printer Server : http://localhost:8000
echo    Kiosk          : http://localhost:8000/website/kiosk/index.html
echo.
echo  =========================================
echo.
pause