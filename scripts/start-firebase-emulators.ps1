param(
    [switch]$Restart,
    [switch]$Background,
    [switch]$ChildProcess
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$allPorts = @(4000, 4400, 4500, 5000, 5001, 8080, 9099, 9199, 9299, 9499)
$corePorts = @(4000, 5000, 5001, 8080, 9099, 9199)

function Get-ListeningEntries {
    param(
        [int[]]$TargetPorts
    )

    $pattern = ($TargetPorts | ForEach-Object { ":$_" }) -join "|"
    $lines = netstat -ano | Select-String $pattern | Where-Object { $_.ToString() -match "LISTENING" }

    $entries = @()
    foreach ($line in $lines) {
        $parts = ($line.ToString().Trim() -split "\s+")
        if ($parts.Count -lt 4) {
            continue
        }

        $localAddress = $parts[1]
        $pidValue = $parts[-1]
        if ($localAddress -match ':(\d+)$' -and $pidValue -match '^\d+$') {
            $entries += [pscustomobject]@{
                Port = [int]$matches[1]
                Pid = [int]$pidValue
            }
        }
    }

    return $entries | Sort-Object Port, Pid -Unique
}

function Format-NumberList {
    param(
        [int[]]$Values
    )

    if (-not $Values -or $Values.Count -eq 0) {
        return "(none)"
    }

    return (($Values | Sort-Object) -join ", ")
}

Set-Location $repoRoot

$existingEntries = @(Get-ListeningEntries -TargetPorts $allPorts)
$existingPids = @($existingEntries | Select-Object -ExpandProperty Pid -Unique)
$listeningCorePorts = @(
    $existingEntries |
        Where-Object { $_.Port -in $corePorts } |
        Select-Object -ExpandProperty Port -Unique
)
$missingCorePorts = @($corePorts | Where-Object { $_ -notin $listeningCorePorts })
$hasPartialState = ($listeningCorePorts.Count -gt 0) -and ($missingCorePorts.Count -gt 0)

if ($Background -and -not $ChildProcess) {
    if ($hasPartialState -and -not $Restart) {
        Write-Host ""
        Write-Host "Firebase emulators are only partially running." -ForegroundColor Red
        Write-Host "Listening core ports: $(Format-NumberList -Values $listeningCorePorts)"
        Write-Host "Missing core ports:   $(Format-NumberList -Values $missingCorePorts)"
        Write-Host ""
        Write-Host "Run the restart command below to recover the full local stack:" -ForegroundColor Yellow
        Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1 -Background -Restart"
        exit 1
    }

    if ($existingPids.Count -gt 0 -and -not $Restart) {
        Write-Host ""
        Write-Host "Firebase emulators are already running." -ForegroundColor Yellow
        Write-Host "Reuse the current local URLs below." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "App:         http://127.0.0.1:5000"
        Write-Host "Admin:       http://127.0.0.1:5000/admin.html"
        Write-Host "History:     http://127.0.0.1:5000/community-history.html"
        Write-Host "Emulator UI: http://127.0.0.1:4000"
        Write-Host ""
        Write-Host "To restart them, run:" -ForegroundColor Cyan
        Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1 -Background -Restart"
        exit 0
    }

    $logDir = Join-Path $repoRoot ".firebase"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir | Out-Null
    }

    $stdoutLog = Join-Path $logDir "emulators.out.log"
    $stderrLog = Join-Path $logDir "emulators.err.log"

    $childArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $PSCommandPath,
        "-ChildProcess"
    )

    if ($Restart) {
        $childArgs += "-Restart"
    }

    Start-Process -FilePath "powershell.exe" `
        -ArgumentList $childArgs `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog | Out-Null

    Write-Host ""
    Write-Host "Firebase emulators are starting in the background." -ForegroundColor Green
    Write-Host "App:         http://127.0.0.1:5000"
    Write-Host "Admin:       http://127.0.0.1:5000/admin.html"
    Write-Host "History:     http://127.0.0.1:5000/community-history.html"
    Write-Host "Emulator UI: http://127.0.0.1:4000"
    Write-Host "stdout log:  $stdoutLog"
    Write-Host "stderr log:  $stderrLog"
    exit 0
}

if ($hasPartialState -and -not $Restart) {
    Write-Host ""
    Write-Host "Firebase emulators are only partially running." -ForegroundColor Red
    Write-Host "Listening core ports: $(Format-NumberList -Values $listeningCorePorts)"
    Write-Host "Missing core ports:   $(Format-NumberList -Values $missingCorePorts)"
    Write-Host ""
    Write-Host "Run the restart command below to recover the full local stack:" -ForegroundColor Yellow
    Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1 -Background -Restart"
    exit 1
}

if ($existingPids.Count -gt 0 -and -not $Restart) {
    Write-Host ""
    Write-Host "Firebase emulators are already running." -ForegroundColor Yellow
    Write-Host "Reuse the current local URLs below." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "App:         http://127.0.0.1:5000"
    Write-Host "Admin:       http://127.0.0.1:5000/admin.html"
    Write-Host "History:     http://127.0.0.1:5000/community-history.html"
    Write-Host "Emulator UI: http://127.0.0.1:4000"
    Write-Host ""
    Write-Host "To restart them, run:" -ForegroundColor Cyan
    Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1 -Background -Restart"
    exit 0
}

if ($existingPids.Count -gt 0 -and $Restart) {
    Write-Host "Stopping existing emulator processes: $($existingPids -join ', ')" -ForegroundColor Yellow
    foreach ($pidValue in $existingPids) {
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

firebase emulators:start --project staging --debug
