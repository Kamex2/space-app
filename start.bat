@echo off
rem 3D Solar System Explorer launcher
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
start "" http://localhost:5173
npm run dev
