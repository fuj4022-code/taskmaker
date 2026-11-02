@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js LTS from https://nodejs.org and try again.
 pause
 exit /b 1
)
start "" http://localhost:5173
node server.mjs
pause
