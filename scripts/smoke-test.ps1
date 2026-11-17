# Smoke test of what `npm run package` left in release/<version>:
#   1. installs KeepToMyShelf-Setup-<version>.exe silently in a temporary folder, runs the smoke
#      tests (tests/smoke) against the installed app and uninstalls it silently;
#   2. unzips KeepToMyShelf-Portable-<version>.zip and runs the same tests against it.
# The app always gets a temporary data folder (KTMS_USER_DATA_DIR): real data is never touched.
# Usage: npm run test:smoke (after npm run package). Runs in Windows PowerShell 5.1 and in pwsh 7.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -Encoding UTF8 (Join-Path $root 'package.json') | ConvertFrom-Json).version
$release = Join-Path $root "release\$version"
$installer = Join-Path $release "KeepToMyShelf-Setup-$version.exe"
$zip = Join-Path $release "KeepToMyShelf-Portable-$version.zip"
foreach ($file in $installer, $zip) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Missing $file. Run npm run package first." }
}

$uninstallKeys = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
function Get-InstalledApp {
  Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue |
    Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like 'KeepToMyShelf*' }
}

# The installer would replace an existing installation: never do that on someone's computer.
if (Get-InstalledApp) {
  throw 'KeepToMyShelf is already installed for this user. Uninstall it before running the smoke test.'
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("ktms-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null

function Invoke-SmokeTests([string]$exe, [string]$kind) {
  $data = Join-Path $work "data-$kind"
  New-Item -ItemType Directory -Path $data | Out-Null
  $env:KTMS_SMOKE_EXE = $exe
  $env:KTMS_SMOKE_KIND = $kind
  $env:KTMS_SMOKE_DATA = $data
  Write-Host "== Smoke tests: $kind app ($exe)"
  & npx playwright test --config (Join-Path $root 'playwright.smoke.config.ts')
  if ($LASTEXITCODE -ne 0) { throw "Smoke tests failed for the $kind app." }
}

$installDir = Join-Path $work 'installed'
try {
  # 1. Installer. /D must be the last argument and is never quoted (an NSIS rule).
  Write-Host "== Installing $installer"
  $setup = Start-Process -FilePath $installer -ArgumentList '/S', "/D=$installDir" -Wait -PassThru
  if ($setup.ExitCode -ne 0) { throw "The installer failed with exit code $($setup.ExitCode)." }
  $installedExe = Join-Path $installDir 'KeepToMyShelf.exe'
  if (-not (Test-Path -LiteralPath $installedExe)) { throw "The installer did not create $installedExe." }
  if (-not (Get-InstalledApp)) { throw 'The installer did not register the app for uninstalling.' }
  if (Test-Path -LiteralPath (Join-Path $installDir 'KeepToMyShelf Data')) {
    throw 'The installed app must not have a "KeepToMyShelf Data" folder: it would be portable.'
  }

  Invoke-SmokeTests $installedExe 'installed'

  # The uninstaller copies itself elsewhere and returns at once: wait until the app is gone.
  Write-Host '== Uninstalling'
  $uninstaller = Join-Path $installDir 'Uninstall KeepToMyShelf.exe'
  Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait | Out-Null
  $deadline = (Get-Date).AddSeconds(60)
  while (((Test-Path -LiteralPath $installedExe) -or (Get-InstalledApp)) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if (Test-Path -LiteralPath $installedExe) { throw 'The uninstaller did not remove the app.' }
  if (Get-InstalledApp) { throw 'The uninstaller did not remove the app from the installed programs.' }

  # 2. Portable zip, as a user would unzip it.
  Write-Host "== Unzipping $zip"
  $portableDir = Join-Path $work 'portable'
  Expand-Archive -LiteralPath $zip -DestinationPath $portableDir
  $portableExe = Join-Path $portableDir 'KeepToMyShelf\KeepToMyShelf.exe'
  if (-not (Test-Path -LiteralPath (Join-Path $portableDir 'KeepToMyShelf\KeepToMyShelf Data'))) {
    throw 'The portable zip has no "KeepToMyShelf Data" folder next to the .exe.'
  }

  Invoke-SmokeTests $portableExe 'portable'
  Write-Host '== Smoke tests passed'
}
finally {
  Remove-Item Env:KTMS_SMOKE_EXE, Env:KTMS_SMOKE_KIND, Env:KTMS_SMOKE_DATA -ErrorAction SilentlyContinue
  # If a step failed half-way, do not leave the app installed.
  if (Test-Path -LiteralPath (Join-Path $installDir 'Uninstall KeepToMyShelf.exe')) {
    Start-Process -FilePath (Join-Path $installDir 'Uninstall KeepToMyShelf.exe') -ArgumentList '/S' -Wait | Out-Null
    Start-Sleep -Seconds 5
  }
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
