@echo off
setlocal
title walletdecrypt setup

echo.
echo   ============================================
echo     walletdecrypt - setup
echo     MetaMask + Exodus wallet recovery
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [X] Node.js was not found on this system.
    echo.
    echo       Please install Node.js 20 or newer from:
    echo       https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo   [OK] Node.js detected: %NODE_VER%
echo.

echo   [*] Installing dependencies ...
call npm install
if errorlevel 1 (
    echo.
    echo   [X] npm install failed. Check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo   ============================================
echo     Setup complete!
echo.
echo     Starting the tool...
echo   ============================================
echo.

call npm run start
if errorlevel 1 (
    echo.
    echo   [X] Failed to start the tool.
    echo.
    pause
    exit /b 1
)

exit /b 0
