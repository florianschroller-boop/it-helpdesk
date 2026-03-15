@echo off
chcp 65001 >nul 2>&1
title IT-Helpdesk — GitHub Installer

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║  IT-Helpdesk — GitHub Installer          ║
echo   ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
echo   [1/4] Voraussetzungen pruefen...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   X Node.js nicht gefunden.
    echo   Bitte installieren: https://nodejs.org/de/download
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   OK Node.js %%v

:: Check Git
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   X Git nicht gefunden.
    echo   Bitte installieren: https://git-scm.com/download/win
    pause
    exit /b 1
)
echo   OK Git gefunden

:: Clone or update
echo.
echo   [2/4] Repository klonen...
set INSTALL_DIR=%USERPROFILE%\IT-Helpdesk

if exist "%INSTALL_DIR%\.git" (
    echo   Verzeichnis existiert — aktualisiere...
    cd /d "%INSTALL_DIR%"
    git pull origin main
    echo   OK Aktualisiert
) else (
    git clone --depth 1 https://github.com/florianschroller-boop/it-helpdesk.git "%INSTALL_DIR%"
    echo   OK Geklont nach %INSTALL_DIR%
    cd /d "%INSTALL_DIR%"
)

:: npm install
echo.
echo   [3/4] Abhaengigkeiten installieren...
call npm install --production
echo   OK Pakete installiert

:: Setup
echo.
echo   [4/4] Konfiguration...
if exist ".env" (
    echo   .env existiert — uebersprungen
) else (
    node install.js
)

echo.
echo   ══════════════════════════════════════════
echo   Installation abgeschlossen!
echo   ══════════════════════════════════════════
echo.
echo   Verzeichnis:  %INSTALL_DIR%
echo   Starten:      START.bat
echo   Updates:      git pull ^&^& npm install
echo.
pause
