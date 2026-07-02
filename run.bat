@echo off
chcp 65001 >nul
echo ========================================
echo   A股分析 H5 应用 - 本地服务器启动
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [Error] Python not found. Please install Python 3.x first.
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] Python is installed
echo [OK] Starting local server with API proxy...
echo.
echo Access URL: http://localhost:8080
echo.
echo Tips: 
echo   - Browser will open automatically
echo   - Press Ctrl+C to stop server
echo   - Using REAL stock data via proxy (not mock data)
echo.
echo ========================================
echo.

REM Auto open browser
start http://localhost:8080

REM Start HTTP server with proxy
python "%~dp0server.py"

pause
