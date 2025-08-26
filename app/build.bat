@echo off
echo Building Commentary Server .exe file...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if pip is available
pip --version >nul 2>&1
if errorlevel 1 (
    echo Error: pip is not installed or not in PATH
    pause
    exit /b 1
)

REM Install required packages
echo Installing required packages...
pip install pyinstaller
pip install -r requirements.txt

REM Test the build configuration
echo.
echo Testing build configuration...
python build_config.py
if errorlevel 1 (
    echo Build configuration test failed!
    pause
    exit /b 1
)

REM Build the .exe file
echo.
echo Building .exe file with PyInstaller...
pyinstaller --onefile --console --name CommentaryServer main.py

REM Alternative: Use the spec file if you want more control
REM pyinstaller build_exe.spec

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Build completed successfully!
echo The .exe file is located in the dist/ folder
echo.
echo Testing the executable...
echo.

REM Test the executable
if exist "dist\CommentaryServer.exe" (
    echo Running test of the executable...
    echo This will start the server - close it when done testing
    start /wait dist\CommentaryServer.exe
) else (
    echo Warning: Executable not found in dist/ folder
)

echo.
echo Build process completed!
pause
