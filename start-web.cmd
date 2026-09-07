@echo off
REM Starts the interface on port 5173. The API must be running too.
cd /d "%~dp0web"
if not exist node_modules ( npm install )
npm run dev
