@echo off
REM Starts the forecasting API on port 8000.
cd /d "%~dp0api"
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
