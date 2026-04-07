@echo off
setlocal enabledelayedexpansion
title eTickette Kiosk Launcher
color 1F
cls

:: ── Auto-elevate to Administrator ──────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo  Requesting administrator rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo.
echo  =========================================
echo    eTICKETTE KIOSK + TABLET LAUNCHER
echo    STI College Fairview
echo  =========================================
echo.

:: ── Go to project folder ───────────────────────────────────────────────────
cd /d C:\Users\Kurt\Desktop\etickette
if errorlevel 1 (
    echo  [ERROR] Folder not found: C:\Users\Kurt\Desktop\etickette
    echo  Update the path in this bat file to match your folder.
    pause & exit /b
)
echo  [OK] Project folder found
echo.

:: ── Check Python ───────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Please install Python and add it to PATH.
    pause & exit /b
)
echo  [OK] Python found

:: ── Check / install Flask ──────────────────────────────────────────────────
pip show flask >nul 2>&1
if errorlevel 1 (
    echo  [INSTALLING] Flask, flask-cors, pyusb...
    pip install flask flask-cors pyusb --quiet
    echo  [OK] Dependencies installed
) else (
    echo  [OK] Flask already installed
)
echo.

:: ── Check printer_server.py exists ────────────────────────────────────────
if not exist "python\printer_server.py" (
    echo  [ERROR] python\printer_server.py not found!
    echo  Make sure your folder structure is correct.
    pause & exit /b
)
echo  [OK] printer_server.py found

:: ── Firewall rule ─────────────────────────────────────────────────────────
netsh advfirewall firewall show rule name="eTickette Kiosk" >nul 2>&1
if errorlevel 1 (
    echo  [ADDING] Firewall rule for port 8000...
    netsh advfirewall firewall add rule name="eTickette Kiosk" dir=in action=allow protocol=TCP localport=8000 >nul
    echo  [OK] Firewall rule added
) else (
    echo  [OK] Firewall rule already exists
)
echo.

:: ── Kill anything already on port 8000 ────────────────────────────────────
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo  [INFO] Stopping old process on port 8000 (PID %%a)
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Start server (visible window so you can see errors) ───────────────────
echo  [STARTING] eTickette Server on port 8000...
start "eTickette Server" cmd /k "cd /d C:\Users\Kurt\Desktop\etickette && python python\printer_server.py"

:: ── Wait up to 10 seconds for server to be ready ──────────────────────────
set /a TRIES=0
:WAIT_LOOP
timeout /t 1 /nobreak >nul
set /a TRIES+=1
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if not errorlevel 1 goto SERVER_READY
if !TRIES! lss 10 goto WAIT_LOOP

echo.
echo  [ERROR] Server did not start after 10 seconds!
echo  Check the "eTickette Server" window for the Python error.
echo.
echo  Common causes:
echo    1. Missing package  ->  run:  pip install flask flask-cors pyusb
echo    2. Port 8000 blocked by another program
echo    3. Syntax error in printer_server.py
echo.
pause & exit /b

:SERVER_READY
echo  [OK] Server is RUNNING on port 8000
echo.

:: ── Get local IP via PowerShell (reliable) ────────────────────────────────
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command ^
  "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress"`) do (
    set LOCAL_IP=%%i
)
if "!LOCAL_IP!"=="" set LOCAL_IP=127.0.0.1

echo  =========================================
echo    KIOSK READY
echo  =========================================
echo.
echo    Local Kiosk  :  https://localhost:8000/kiosk/
echo    Tablet URL   :  https://!LOCAL_IP!:8000/kiosk/
echo    Setup Page   :  https://localhost:8000/setup
echo    Printer Test :  https://localhost:8000/health
echo.
echo  =========================================
echo.

:: ── Open Setup Page then Kiosk ────────────────────────────────────────────
echo  Opening Setup Page (has QR code for tablet)...
start "" "https://localhost:8000/setup"
timeout /t 2 /nobreak >nul

echo  Opening Local Kiosk...
start "" "https://localhost:8000/kiosk/"

echo.
echo  All done! The server window must stay open while kiosk is in use.
echo.
pause