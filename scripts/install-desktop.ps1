param(
    [string]$DesktopDirectory = 'D:\deepseek_harness\DeepSeek Harness',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$desktopExe = Join-Path $DesktopDirectory 'DeepSeek Harness.exe'
$desktopCli = Join-Path $DesktopDirectory 'resources\runtime\cli\bin\dsh.cmd'
if (!(Test-Path -LiteralPath $desktopCli) -or !(Test-Path -LiteralPath $desktopExe)) {
    throw 'DSH desktop runtime not found. Pass -DesktopDirectory with the desktop installation directory.'
}
$desktopVersion = (Get-Item -LiteralPath $desktopExe).VersionInfo.FileVersion
$running = @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
Write-Host "Desktop: $DesktopDirectory ($desktopVersion)"
Write-Host "Profile: desktop; running processes: $($running.Count)"
if ($CheckOnly) { exit 0 }
if ($running.Count -gt 0) {
    throw 'Please fully quit DSH, including the system tray, then rerun npm run install:desktop. The installer never terminates user sessions.'
}
Push-Location -LiteralPath $workspace
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Plugin build failed.' }
    $packOutput = & npm.cmd pack --json
    if ($LASTEXITCODE -ne 0) { throw 'Plugin packaging failed.' }
    $packageInfo = ($packOutput -join "`n") | ConvertFrom-Json
    $tarball = Join-Path $workspace $packageInfo[0].filename
    $profileDirectory = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
    $backupDirectory = Join-Path $workspace ('artifacts\desktop-profile-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    foreach ($manifest in @('package.json', 'pnpm-lock.yaml')) {
        $source = Join-Path $profileDirectory $manifest
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $backupDirectory $manifest) }
    }
    # Only the CLI bundled with the desktop app may change its desktop profile.
    & $desktopCli plugin --profile desktop add $tarball
    if ($LASTEXITCODE -ne 0) { throw "Desktop plugin installation failed. Profile manifest backup: $backupDirectory" }
    $profile = Get-Content -LiteralPath (Join-Path $profileDirectory 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$profile.dependencies.'dsh-plugin-archside' -or !($profile.dsh.profile.bundles -contains 'dsh-plugin-archside')) {
        throw 'The CLI finished, but the desktop profile does not list the plugin dependency and bundle. Inspect the profile before launching.'
    }
    Write-Host 'ArchSide installed in the desktop profile. Start DSH, open a project conversation, and click the Architecture button in its header.'
    Write-Host "Backup: $backupDirectory"
}
finally { Pop-Location }
