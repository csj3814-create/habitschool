$ports = @(4000, 4400, 4500, 5000, 5001, 8080, 9099, 9199, 9299, 9499)
$pattern = ($ports | ForEach-Object { ":$_" }) -join "|"

$lines = netstat -ano | Select-String $pattern | Where-Object { $_.ToString() -match "LISTENING" }
$pids = @()

foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split "\s+")
    if ($parts.Count -gt 0) {
        $last = $parts[-1]
        if ($last -match '^\d+$') {
            $pids += [int]$last
        }
    }
}

$pids = $pids | Sort-Object -Unique

if (-not $pids -or $pids.Count -eq 0) {
    Write-Host "중지할 Firebase emulator 프로세스를 찾지 못했습니다."
    exit 0
}

Write-Host "Firebase emulator 프로세스를 중지합니다: $($pids -join ', ')" -ForegroundColor Yellow

foreach ($pidValue in $pids) {
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
Write-Host "정리 완료"
