@echo off
setlocal EnableExtensions
title Forge Seat
echo.
echo Forge Seat
echo Leave MetaTrader 5 open and logged in on this PC.
echo Leave this window open. Closing it stops the live feed.
echo.

set "DESK=http://2.28.37.51:8096"
set "ROOT=%LOCALAPPDATA%\ForgeSeat"
set "PY=%ROOT%\Python\python.exe"
if not exist "%ROOT%" mkdir "%ROOT%"

if exist "%PY%" goto havpy
echo First run downloads Python from the desk. This happens once.
call :download "%DESK%/bootstrap/python-setup.exe" "%ROOT%\python-setup.exe"
if errorlevel 1 goto fail
if exist "%ROOT%\Python" rmdir /s /q "%ROOT%\Python"
echo Installing Python. A progress window may appear.
"%ROOT%\python-setup.exe" /passive InstallAllUsers=0 PrependPath=0 Include_pip=1 Include_test=0 Include_doc=0 Include_launcher=0 Include_tcltk=0 Shortcuts=0 AssociateFiles=0 CompileAll=0 TargetDir="%ROOT%\Python"
if not exist "%PY%" (
  echo Python did not finish installing.
  goto fail
)
:havpy

"%PY%" -m pip --version >nul 2>&1
if errorlevel 1 "%PY%" -m ensurepip --upgrade >nul 2>&1

set "NUMPY=numpy-2.5.5-cp312-cp312-win_amd64.whl"
set "MT5W=metatrader5-5.0.6231-cp312-cp312-win_amd64.whl"
if exist "%ROOT%\numpy.whl" if not exist "%ROOT%\%NUMPY%" ren "%ROOT%\numpy.whl" "%NUMPY%"
if exist "%ROOT%\MetaTrader5.whl" if not exist "%ROOT%\%MT5W%" ren "%ROOT%\MetaTrader5.whl" "%MT5W%"
if exist "%ROOT%\%NUMPY%" if exist "%ROOT%\%MT5W%" goto havewheels
call :download "%DESK%/bootstrap/%NUMPY%" "%ROOT%\%NUMPY%"
if errorlevel 1 goto fail
call :download "%DESK%/bootstrap/%MT5W%" "%ROOT%\%MT5W%"
if errorlevel 1 goto fail
:havewheels
echo Checking the MetaTrader connector...
"%PY%" -c "import MetaTrader5" >nul 2>&1
if not errorlevel 1 goto havemt5
"%PY%" -m pip install --disable-pip-version-check --no-warn-script-location "%ROOT%\%NUMPY%" "%ROOT%\%MT5W%"
if errorlevel 1 goto fail
:havemt5

call :download "%DESK%/bridge/mt5_bridge.py" "%ROOT%\mt5_bridge.py"
if errorlevel 1 goto fail

if exist "%ROOT%\token.txt" goto readtoken
echo.
echo Paste the desk token and press Enter.
set /p TOKEN=Token: 
if "%TOKEN%"=="" goto fail
>"%ROOT%\token.txt" echo %TOKEN%
goto symbols
:readtoken
set /p TOKEN=<"%ROOT%\token.txt"
:symbols
if exist "%ROOT%\symbols.txt" goto readsymbols
echo.
echo Type the symbols exactly as they appear in MT5 Market Watch.
echo Example: XAUUSD,EURUSD
set /p SYMBOLS=Symbols: 
if "%SYMBOLS%"=="" goto fail
>"%ROOT%\symbols.txt" echo %SYMBOLS%
goto run
:readsymbols
set /p SYMBOLS=<"%ROOT%\symbols.txt"
if "%SYMBOLS%"=="" goto fail
:run
echo.
echo Connected symbols: %SYMBOLS%
echo To change them later, delete this file and run again:
echo %ROOT%\symbols.txt
echo.
"%PY%" "%ROOT%\mt5_bridge.py" --url "%DESK%" --token "%TOKEN%" --symbols "%SYMBOLS%"
echo.
echo The bridge stopped.
goto fail

:download
echo Downloading %~nx2 ...
where curl.exe >nul 2>&1
if errorlevel 1 goto psdownload
curl.exe -fL --retry 3 --retry-delay 2 -o "%~2" "%~1"
if errorlevel 1 exit /b 1
exit /b 0
:psdownload
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%~1' -OutFile '%~2'; exit 0 } catch { exit 1 }"
if errorlevel 1 exit /b 1
exit /b 0

:fail
echo.
pause
exit /b 1
