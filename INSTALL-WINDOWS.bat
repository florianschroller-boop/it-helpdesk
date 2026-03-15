@echo off
chcp 65001 >nul 2>&1
title IT-Helpdesk Installer

echo.
echo   ╔══════════════════════════════════════╗
echo   ║       IT-Helpdesk Installer          ║
echo   ║       Windows Edition                ║
echo   ╚══════════════════════════════════════╝
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [!] Node.js ist nicht installiert.
    echo.
    echo   Node.js wird jetzt heruntergeladen und installiert...
    echo.

    :: Download Node.js installer
    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs-setup.msi' }"

    if exist "%TEMP%\nodejs-setup.msi" (
        echo   Starte Node.js Installation...
        msiexec /i "%TEMP%\nodejs-setup.msi" /qn
        del "%TEMP%\nodejs-setup.msi"

        :: Refresh PATH
        set "PATH=%PATH%;C:\Program Files\nodejs"

        where node >nul 2>&1
        if %ERRORLEVEL% neq 0 (
            echo   [FEHLER] Node.js Installation fehlgeschlagen.
            echo   Bitte manuell installieren: https://nodejs.org/
            pause
            exit /b 1
        )
    ) else (
        echo   [FEHLER] Download fehlgeschlagen.
        echo   Bitte Node.js manuell installieren: https://nodejs.org/
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('node --version') do echo   [OK] Node.js %%v gefunden

:: Run the Node.js installer
echo.
echo   Starte interaktive Installation...
echo.
node "%~dp0install.js" --demo

if %ERRORLEVEL% neq 0 (
    echo.
    echo   [FEHLER] Installation fehlgeschlagen.
    pause
    exit /b 1
)

pause
