@echo off
title eTickette Shutdown
color 4F
cls

echo.
echo  Stopping eTickette local services...
echo.

:: Stop printer server
taskkill /f /im python.exe >nul 2>&1
echo  [OK] Printer server stopped.

echo.
echo  Note: Firebase Hosting stays live online.
echo  Only the local printer server was stopped.
echo.
timeout /t 3
exit