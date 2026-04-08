param(
    [string]$AndroidDir = (Split-Path -Parent $PSScriptRoot),
    [string]$AssetLinksPath = '',
    [switch]$IncludeDebugFingerprint,
    [switch]$WriteAssetLinks,
    [switch]$BuildRelease
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $AndroidDir
$gradleWrapper = Join-Path $AndroidDir 'gradlew.bat'
$assetLinksScript = Join-Path $PSScriptRoot 'Sync-AssetLinks.ps1'

function Invoke-NativeCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    function Quote-Argument {
        param([string]$Value)

        if ($null -eq $Value) {
            return '""'
        }

        if ($Value -notmatch '[\s"]') {
            return $Value
        }

        return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
    }

    $resolvedFilePath = $FilePath
    $workingDirectory = (Get-Location).Path
    if (Test-Path $FilePath) {
        $resolvedFilePath = (Resolve-Path $FilePath).Path
        $workingDirectory = Split-Path -Parent $resolvedFilePath
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $startInfo.WorkingDirectory = $workingDirectory

    $extension = [System.IO.Path]::GetExtension($FilePath)
    $quotedArgs = @($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' '

    if ($extension -in @('.bat', '.cmd')) {
        $startInfo.FileName = 'cmd.exe'
        $startInfo.Arguments = "/d /c $(Quote-Argument $resolvedFilePath) $quotedArgs"
    } else {
        $startInfo.FileName = $resolvedFilePath
        $startInfo.Arguments = $quotedArgs
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $null = $process.Start()

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $output = @()
    foreach ($streamOutput in @($stdout, $stderr)) {
        if ([string]::IsNullOrWhiteSpace($streamOutput)) {
            continue
        }

        $output += $streamOutput.TrimEnd("`r", "`n").Split("`n") | ForEach-Object { $_.TrimEnd("`r") }
    }
    $exitCode = $process.ExitCode

    return [pscustomobject]@{
        Output = @($output)
        ExitCode = $exitCode
    }
}

Write-Host '== TWA release readiness =='
Write-Host ''

Write-Host '[1/3] Release signing'
$signingResult = Invoke-NativeCommand -FilePath $gradleWrapper -Arguments @('-q', 'printReleaseSigningStatus')
$signingResult.Output | ForEach-Object { Write-Host $_ }
$hasReleaseSigning = $signingResult.Output -match 'Release signing configured:'
if (-not $hasReleaseSigning) {
    Write-Warning 'Release signing is not configured yet.'
}

Write-Host ''
Write-Host '[2/3] Asset links'
$canCheckAssetLinks = $hasReleaseSigning -or $IncludeDebugFingerprint
$assetLinksOk = $false

if (-not $canCheckAssetLinks) {
    Write-Warning 'Skipping assetlinks check because no release signing is configured.'
    Write-Host 'Next: copy android\release-signing.properties.example to android\release-signing.properties and fill the real keystore values.'
} else {
    $assetLinksArgs = @(
        '-ExecutionPolicy', 'Bypass',
        '-File', $assetLinksScript,
        '-Mode', $(if ($WriteAssetLinks) { 'write' } else { 'check' }),
        '-AndroidDir', $AndroidDir
    )
    if (-not [string]::IsNullOrWhiteSpace($AssetLinksPath)) {
        $assetLinksArgs += @('-AssetLinksPath', $AssetLinksPath)
    }
    if ($IncludeDebugFingerprint) {
        $assetLinksArgs += '-IncludeDebugFingerprint'
    }

    $assetLinksResult = Invoke-NativeCommand -FilePath 'powershell.exe' -Arguments $assetLinksArgs
    $assetLinksResult.Output | ForEach-Object { Write-Host $_ }
    $assetLinksOk = ($assetLinksResult.ExitCode -eq 0)
    if (-not $assetLinksOk) {
        Write-Warning 'assetlinks status is not ready yet.'
    }
}

Write-Host ''
Write-Host '[3/3] Release artifact'
if ($BuildRelease) {
    if (-not $hasReleaseSigning) {
        throw 'Cannot build release without release signing. Configure android/release-signing.properties first.'
    }

    $buildResult = Invoke-NativeCommand -FilePath $gradleWrapper -Arguments @(':app:assembleRelease')
    $buildResult.Output | ForEach-Object { Write-Host $_ }
    if ($buildResult.ExitCode -ne 0) {
        throw 'Release build failed.'
    }
} else {
    Write-Host 'Release build skipped. Re-run with -BuildRelease to assemble the signed artifact.'
}

Write-Host ''
Write-Host '== Next step =='
if (-not $hasReleaseSigning) {
    Write-Host '1. Add the real keystore values to android\release-signing.properties.'
    Write-Host '2. Re-run Check-TwaReleaseReadiness.ps1.'
    exit 1
}

if (-not $assetLinksOk) {
    if ($WriteAssetLinks) {
        Write-Host '1. Deploy hosting so the updated assetlinks.json goes live.'
        Write-Host '2. Install the release APK on device and confirm fullscreen TWA.'
    } else {
        Write-Host '1. Re-run Check-TwaReleaseReadiness.ps1 -WriteAssetLinks.'
        Write-Host '2. Deploy hosting after assetlinks.json is updated.'
    }
    exit 1
}

if (-not $BuildRelease) {
    Write-Host '1. Re-run Check-TwaReleaseReadiness.ps1 -BuildRelease when you are ready to build the signed release.'
    Write-Host '2. Install the release APK on device and confirm fullscreen TWA.'
    exit 0
}

Write-Host '1. Install android\app\build\outputs\apk\release\app-release.apk on device.'
Write-Host '2. Open the app and confirm the verified fullscreen TWA without the browser chrome.'
