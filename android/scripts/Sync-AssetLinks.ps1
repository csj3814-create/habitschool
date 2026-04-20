param(
    [ValidateSet('check', 'write')]
    [string]$Mode = 'check',
    [string]$AndroidDir = (Split-Path -Parent $PSScriptRoot),
    [string]$PackageName = 'com.habitschool.app',
    [string]$AssetLinksPath = '',
    [switch]$IncludeDebugFingerprint,
    [switch]$ExactMatch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AssetLinksPath)) {
    $repoRoot = Split-Path -Parent $AndroidDir
    $AssetLinksPath = Join-Path $repoRoot '.well-known\assetlinks.json'
}

function Read-PropertiesFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    foreach ($rawLine in Get-Content -Path $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            continue
        }

        $parts = $line.Split('=', 2)
        if ($parts.Count -ne 2) {
            continue
        }

        $values[$parts[0].Trim()] = $parts[1].Trim()
    }

    return $values
}

function Get-ReleaseSigningConfig {
    param([string]$AndroidProjectDir)

    $combined = @{}
    foreach ($path in @(
        (Join-Path $AndroidProjectDir 'release-signing.properties'),
        (Join-Path $AndroidProjectDir 'release-signing.local.properties')
    )) {
        $props = Read-PropertiesFile -Path $path
        foreach ($entry in $props.GetEnumerator()) {
            $combined[$entry.Key] = $entry.Value
        }
    }

    $envMap = @{
        storeFile = 'HABITSCHOOL_ANDROID_STORE_FILE'
        storePassword = 'HABITSCHOOL_ANDROID_STORE_PASSWORD'
        keyAlias = 'HABITSCHOOL_ANDROID_KEY_ALIAS'
        keyPassword = 'HABITSCHOOL_ANDROID_KEY_PASSWORD'
    }

    foreach ($key in $envMap.Keys) {
        $envValue = [Environment]::GetEnvironmentVariable($envMap[$key])
        if (-not [string]::IsNullOrWhiteSpace($envValue)) {
            $combined[$key] = $envValue.Trim()
        }
    }

    return $combined
}

function Resolve-StorePath {
    param(
        [string]$AndroidProjectDir,
        [string]$StoreFile
    )

    if ([string]::IsNullOrWhiteSpace($StoreFile)) {
        return ''
    }

    if ([System.IO.Path]::IsPathRooted($StoreFile)) {
        return $StoreFile
    }

    return [System.IO.Path]::GetFullPath((Join-Path $AndroidProjectDir $StoreFile))
}

function Get-KeytoolPath {
    $command = Get-Command keytool -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw 'keytool not found in PATH. Install a JDK or set JAVA_HOME.'
}

function Get-KeystoreFingerprint {
    param(
        [string]$StorePath,
        [string]$Alias,
        [string]$StorePassword,
        [string]$KeyPassword
    )

    if (-not (Test-Path $StorePath)) {
        throw "Keystore not found: $StorePath"
    }

    $keytool = Get-KeytoolPath
    $arguments = @(
        '-list',
        '-v',
        '-keystore', $StorePath,
        '-alias', $Alias,
        '-storepass', $StorePassword
    )

    if (-not [string]::IsNullOrWhiteSpace($KeyPassword)) {
        $arguments += @('-keypass', $KeyPassword)
    }

    $output = & $keytool @arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "keytool failed for alias '$Alias'.`n$output"
    }

    $match = $output | Select-String -Pattern 'SHA256:\s*([0-9A-F:]+)' | Select-Object -First 1
    if (-not $match) {
        throw "Could not extract SHA256 fingerprint from keytool output for alias '$Alias'."
    }

    return $match.Matches[0].Groups[1].Value.ToUpperInvariant()
}

function Get-ExpectedFingerprints {
    param(
        [string]$AndroidProjectDir,
        [switch]$IncludeDebug
    )

    $fingerprints = New-Object System.Collections.Generic.List[string]
    $releaseSigning = Get-ReleaseSigningConfig -AndroidProjectDir $AndroidProjectDir
    $releaseKeys = @('storeFile', 'storePassword', 'keyAlias', 'keyPassword')
    $hasReleaseSigning = $releaseKeys | ForEach-Object { -not [string]::IsNullOrWhiteSpace($releaseSigning[$_]) } | Where-Object { $_ -eq $false } | Measure-Object | Select-Object -ExpandProperty Count
    $hasReleaseSigning = ($hasReleaseSigning -eq 0)

    if ($hasReleaseSigning) {
        $storePath = Resolve-StorePath -AndroidProjectDir $AndroidProjectDir -StoreFile $releaseSigning.storeFile
        $fingerprints.Add(
            (Get-KeystoreFingerprint -StorePath $storePath -Alias $releaseSigning.keyAlias -StorePassword $releaseSigning.storePassword -KeyPassword $releaseSigning.keyPassword)
        )
    }

    if ($IncludeDebug) {
        $debugStorePath = Join-Path $env:USERPROFILE '.android\debug.keystore'
        $fingerprints.Add(
            (Get-KeystoreFingerprint -StorePath $debugStorePath -Alias 'androiddebugkey' -StorePassword 'android' -KeyPassword 'android')
        )
    }

    if ($fingerprints.Count -eq 0) {
        throw 'No signing fingerprint could be resolved. Configure android/release-signing.properties or use -IncludeDebugFingerprint.'
    }

    return $fingerprints | Sort-Object -Unique
}

function Get-CurrentFingerprints {
    param(
        [string]$Path,
        [string]$Package
    )

    if (-not (Test-Path $Path)) {
        return @()
    }

    $json = Get-Content -Path $Path -Raw | ConvertFrom-Json
    foreach ($entry in @($json)) {
        if ($entry.target.package_name -eq $Package) {
            return @($entry.target.sha256_cert_fingerprints | ForEach-Object { $_.ToUpperInvariant() })
        }
    }

    return @()
}

$expectedFingerprints = @(Get-ExpectedFingerprints -AndroidProjectDir $AndroidDir -IncludeDebug:$IncludeDebugFingerprint)

$payload = @(
    @{
        relation = @('delegate_permission/common.handle_all_urls')
        target = @{
            namespace = 'android_app'
            package_name = $PackageName
            sha256_cert_fingerprints = $expectedFingerprints
        }
    }
)

$payloadJson = $payload | ConvertTo-Json -Depth 6

if ($Mode -eq 'write') {
    $targetDir = Split-Path -Parent $AssetLinksPath
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir | Out-Null
    }
    Set-Content -Path $AssetLinksPath -Value $payloadJson -Encoding utf8
    Write-Host "Updated asset links: $AssetLinksPath"
}

$currentFingerprints = @(Get-CurrentFingerprints -Path $AssetLinksPath -Package $PackageName)

Write-Host "Expected fingerprints:"
$expectedFingerprints | ForEach-Object { Write-Host " - $_" }

if ($currentFingerprints.Count -gt 0) {
    Write-Host "Current fingerprints:"
    $currentFingerprints | ForEach-Object { Write-Host " - $_" }
} else {
    Write-Host "Current assetlinks entry not found for $PackageName"
}

$missing = @($expectedFingerprints | Where-Object { $_ -notin $currentFingerprints })
$unexpected = @($currentFingerprints | Where-Object { $_ -notin $expectedFingerprints })
$hasUnexpected = $unexpected.Count -gt 0
$hasBlockingMismatch = $missing.Count -gt 0 -or ($ExactMatch -and $hasUnexpected)

if (-not $hasBlockingMismatch) {
    if ($hasUnexpected) {
        Write-Warning ("assetlinks.json includes additional fingerprints beyond the expected set: " + ($unexpected -join ', '))
        Write-Host 'Expected fingerprints are present, so the current assetlinks entry is usable.'
    } else {
        Write-Host 'assetlinks.json matches the expected signing fingerprint set.'
    }
    $payloadJson
    exit 0
}

Write-Warning 'assetlinks.json does not match the expected signing fingerprint set.'
if ($missing.Count -gt 0) {
    Write-Warning ("Missing fingerprints: " + ($missing -join ', '))
}
if ($hasUnexpected) {
    Write-Warning ("Unexpected fingerprints: " + ($unexpected -join ', '))
    if (-not $ExactMatch) {
        Write-Host 'Note: additional fingerprints are allowed in non-exact mode, but this check is still failing because at least one expected fingerprint is missing.'
    }
}

$payloadJson
if ($Mode -eq 'check') {
    exit 1
}
