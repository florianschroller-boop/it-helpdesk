@echo off
chcp 65001 >nul 2>&1
title IT-Helpdesk

:loop
echo.
echo  Starte IT-Helpdesk...
echo  (Server startet nach Beendigung automatisch neu)
echo.
node api\index.js
echo.
echo  Server beendet. Neustart in 2 Sekunden...
echo  (Strg+C zum Beenden)
timeout /t 2 /nobreak >nul
goto loop
