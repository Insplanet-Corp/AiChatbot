@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem  Resume bulk DB seeder - launcher
rem
rem  Usage (double-click, or run in cmd / PowerShell):
rem    seed-resumes.bat                 process resumes-inbox\
rem    seed-resumes.bat "D:\folder"     process another folder
rem    seed-resumes.bat --dry-run       parse only, no DB write
rem    seed-resumes.bat --no-move       save but keep files in place
rem    seed-resumes.bat --verbose       extra logging
rem
rem  NOTE: In PowerShell you must prefix with .\  ->  .\seed-resumes.bat
rem ============================================================

rem Move to this .bat's folder (project root) so .env is loaded.
cd /d "%~dp0"

rem Find node: PATH first, then the default Windows install path.
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if /i not "%NODE_EXE%"=="node" if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js not found on PATH or at "C:\Program Files\nodejs\node.exe".
  echo         Install Node.js from https://nodejs.org and run again.
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo ============================================
echo   Resume bulk DB seeding
echo ============================================
"%NODE_EXE%" "%~dp0scripts\seedResumesToDB.mjs" %*
set "EXITCODE=%errorlevel%"

echo.
if "%EXITCODE%"=="0" (
  echo [DONE] Finished successfully.
) else (
  echo [WARN] Finished with errors or partial failures ^(exit code %EXITCODE%^).
)
echo.
echo Press any key to close...
pause >nul
exit /b %EXITCODE%
