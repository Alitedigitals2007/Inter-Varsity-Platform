@echo off
title Inter-Varsity Competition Platform - Offline
cd /d "%~dp0"

REM ---------------------------------------------------------------------------
REM If the portable Node runtime was bundled, put it FIRST on PATH so that
REM every child process (prisma, next, tsx) uses the bundled interpreter and
REM never falls back to a Node installed elsewhere on this machine.
REM ---------------------------------------------------------------------------
set "NODE_BIN=node"
if exist "%~dp0runtime\node\node.exe" (
  set "NODE_BIN=%~dp0runtime\node\node.exe"
  set "PATH=%~dp0runtime\node;%PATH%"
) else (
  REM No bundled runtime here. Fall back to whatever Node is installed, but
  REM explain the problem instead of dying with "'node' is not recognized".
  where node >nul 2>&1
  if errorlevel 1 (
    echo.
    echo  This copy is missing its bundled Node runtime, and this machine
    echo  has no Node installed either.
    echo.
    echo  Re-copy the COMPLETE package, or re-run the installer.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo  ============================================
echo   Inter-Varsity Competition Platform
echo   Faculty of Science - University of Ibadan
echo  ============================================
echo.
echo  Starting the offline server, please wait...
echo  The FIRST run asks for your database URL and
echo  sets everything up (this can take a minute).
echo.

"%NODE_BIN%" "%~dp0scripts\offline.js"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo  The platform stopped with an error.
  echo  See the message above, or open SETUP.md for help.
  echo.
  pause
  exit /b %EXITCODE%
)

echo.
echo  Stopped. You can close this window.
echo.
pause
