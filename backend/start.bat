@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 启动后端（演示模式：无 --reload，Ctrl+C 可干净停止，不会留孤儿）===
echo === 若要开发热重载，手动用: uvicorn app.main:app --reload --port 8000 ===
echo === 关不掉就双击 stop.bat ===
echo.
uvicorn app.main:app --port 8000
