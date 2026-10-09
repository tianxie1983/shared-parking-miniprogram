@echo off
setlocal EnableExtensions

set "CPOLAR_EXE=C:\Users\Administrator\cpolar\cpolar.exe"
set "PATCH_PS=%~dp0patch_baseurl.ps1"

if not exist "%CPOLAR_EXE%" (
  echo [ERROR] cpolar.exe not found at:
  echo   %CPOLAR_EXE%
  echo Please install cpolar first, then re-run this script.
  pause
  exit /b 1
)

REM ---- clean previous cpolar / backend to avoid EADDRINUSE and double tunnel ----
taskkill /F /IM cpolar.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

REM ---- ensure node is on PATH (double-clicked cmd often lacks it) ----
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs"

echo ===================================================
echo  Shared Parking - start backend + cpolar tunnel
echo ===================================================
echo.
echo  Step 1/3: starting local backend (node server.js)...
pushd "%~dp0"
start "SharedParkingBackend" cmd /k "node server.js"
echo            backend window opened (http://localhost:3000)
echo.
echo  Step 2/3: starting cpolar tunnel...
start "cpolar" cmd /k ""%CPOLAR_EXE%" http 3000"
echo.
echo  Step 3/3: A new "cpolar" window just opened.
echo    Wait until it shows:  Tunnel Status  online
echo    Then copy the line:   Forwarding https://XXXX.cpolar.top -^> ...
echo.
echo  ==================================================
echo   PASTE the public https URL from the cpolar window,
echo   then press Enter. This auto-updates BASE_URL in all
echo   3 mini programs (no manual editing needed).
echo  ==================================================
echo.

set /p "TUNNEL_URL=  Paste public URL (https://...cpolar.top): "

REM ---- normalize: strip spaces, force https ----
set "TUNNEL_URL=%TUNNEL_URL: =%"
set "TUNNEL_URL=%TUNNEL_URL:http://=https://%"

if "%TUNNEL_URL%"=="" (
  echo.
  echo [WARN] No URL entered - skipped BASE_URL update.
  echo         Tunnel is still running; you can edit BASE_URL manually.
  goto :done
)

echo.
echo  Updating BASE_URL to: %TUNNEL_URL%
echo.

if not exist "%PATCH_PS%" goto :nopatch
echo  [patch] running patch_baseurl.ps1 for all 3 mini programs...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PATCH_PS%" "%TUNNEL_URL%"
goto :done

:nopatch
echo [WARN] patch_baseurl.ps1 not found - skipped auto-update.

:done
echo.
echo  Done. Now in WeChat DevTools: recompile the mini program.
echo  Real device also needs https://...cpolar.top added to
echo  request legal domains in the mini program admin console.
echo.
pause
