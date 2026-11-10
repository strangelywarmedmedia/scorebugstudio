@echo off
REM build_windows.bat - builds a standalone Scorebug Studio app folder for Windows.
REM Run this ON THE WINDOWS PC that will run the broadcast (PyInstaller can't cross-compile).
REM Needs Python 3 from python.org (tick "Add python.exe to PATH" when installing).
cd /d "%~dp0"

echo Installing build dependencies...
python -m pip install --quiet pyserial websockets pyinstaller
if errorlevel 1 goto :fail

echo Building...
python -m PyInstaller --onefile --name ScorebugStudio --console --collect-submodules serial --collect-submodules websockets --noconfirm --clean scorebug_server.py
if errorlevel 1 goto :fail

echo Assembling dist\ScorebugStudio-Windows ...
if exist "dist\ScorebugStudio-Windows" rmdir /s /q "dist\ScorebugStudio-Windows"
mkdir "dist\ScorebugStudio-Windows"
move /y "dist\ScorebugStudio.exe" "dist\ScorebugStudio-Windows\" >nul
xcopy /e /i /q web "dist\ScorebugStudio-Windows\web" >nul
copy /y scorebug_config.json "dist\ScorebugStudio-Windows\" >nul
if exist README.md copy /y README.md "dist\ScorebugStudio-Windows\" >nul

echo.
echo Done. Your app folder: dist\ScorebugStudio-Windows
echo Keep ScorebugStudio.exe, the web folder and scorebug_config.json together.
echo First launch: SmartScreen may warn (the app is not signed) - click More info, then Run anyway.
pause
exit /b 0

:fail
echo.
echo Build failed - see the messages above. Make sure Python 3 is installed and on PATH.
pause
exit /b 1
