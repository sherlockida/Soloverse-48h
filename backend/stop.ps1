# 杀所有 uvicorn 后端进程（含 --reload 孤儿子进程，防烧 token）
Write-Host "=== 杀所有 uvicorn 后端进程（含 --reload 孤儿子进程）===" -ForegroundColor Yellow
$killed = 0
Get-CimInstance Win32_Process -Filter "name='python.exe'" | Where-Object {
    $_.CommandLine -match 'uvicorn|app\.main|spawn_main|multiprocessing-fork|watchfiles'
} | ForEach-Object {
    Write-Host ("  killing PID " + $_.ProcessId + " : " + ($_.CommandLine -replace '\s+', ' ').Substring(0, [Math]::Min(60, $_.CommandLine.Length)))
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $killed++ } catch { Write-Host ("    (PID " + $_.ProcessId + " 已退出或无权限)") }
}
if ($killed -eq 0) { Write-Host "  (没有 uvicorn 进程在跑)" }

Write-Host ""
Write-Host "=== 验证端口 8000 ===" -ForegroundColor Yellow
Start-Sleep -Milliseconds 500
$listen = netstat -ano | Select-String ":8000.*LISTENING"
if ($listen) {
    Write-Host "  [警告] 仍有进程监听 8000，再双击一次 stop.bat" -ForegroundColor Red
} else {
    Write-Host "  [OK] 端口 8000 已清空，停止烧 token" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== 验证无 python 残留 ===" -ForegroundColor Yellow
$py = Get-Process python -ErrorAction SilentlyContinue
if ($py) {
    Write-Host "  [警告] 仍有 python 进程，可能是别的（非 uvicorn）或孤儿，再跑一次：" -ForegroundColor Red
    $py | Format-Table Id, ProcessName, WorkingSet -AutoSize
} else {
    Write-Host "  [OK] 无任何 python 进程，彻底干净" -ForegroundColor Green
}
