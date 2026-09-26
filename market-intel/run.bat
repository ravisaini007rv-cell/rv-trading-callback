@echo off
REM RV Market Intelligence - one-click runner (Windows)
cd /d %~dp0

if not exist .venv (
  echo First run - setting up, 2-3 minute lagenge...
  python -m venv .venv
  .venv\Scripts\pip install --quiet -r requirements.txt
)

echo Starting RV Market Intelligence on http://localhost:8000
echo Phone se kholne ke liye (same WiFi): http://YOUR-IP:8000  ^(neeche IPv4 address dikhega^)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo   Phone URL: http://%%b:8000
)
start "" http://localhost:8000
.venv\Scripts\python -m uvicorn app:app --host 0.0.0.0 --port 8000
