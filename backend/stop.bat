@echo off
chcp 65001 >nul
echo === 杀所有 uvicorn 后端进程（含 --reload 孤儿子进程，防烧 token）===
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | Where-Object { $_.CommandLine -match 'uvicorn|app\.main|spawn_main|multiprocessing-fork|watchfiles' } | ForEach-Object { Write-Host ('  killing PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"
echo.
echo === 验证端口 8000 ===
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel%==0 (echo   [警告] 仍有进程监听 8000，再跑一次本脚本) else (echo   [OK] 端口 8000 已清空，停止烧 token)
echo.
pause
