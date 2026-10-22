@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting MockInterview server...
start "" http://localhost:3000
npm start
pause
