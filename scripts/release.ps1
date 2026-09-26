<#
.SYNOPSIS
  Builds checkst and packages it with Velopack.

.EXAMPLE
  npm run release -- -Version 0.2.0
  npm run release -- -Version 0.2.0 -Upload        # also publishes a GitHub release (needs $env:GITHUB_TOKEN)
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [switch]$Upload,
  [string]$Repo = "https://github.com/checkst-app/checkst",
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.dotnet\tools;$env:PATH"

if ($Upload -and -not $Token) { throw "Für -Upload wird ein GitHub-Token benötigt (-Token oder `$env:GITHUB_TOKEN)." }
if (-not (Get-Command vpk -ErrorAction SilentlyContinue)) { dotnet tool install -g vpk }

Write-Host "==> Version $Version"
npm version $Version --no-git-tag-version --allow-same-version | Out-Null

Write-Host "==> Tests"
npm test
if ($LASTEXITCODE -ne 0) { throw "Tests fehlgeschlagen" }

Write-Host "==> Tauri-Build"
npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "Build fehlgeschlagen" }

$pack = "build\pack"
$out = "build\releases"
Remove-Item -Recurse -Force $pack -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pack, $out | Out-Null
Copy-Item "src-tauri\target\release\checkst.exe" $pack

if ($Upload) {
  Write-Host "==> Vorherige Version für Delta-Updates laden"
  vpk download github --repoUrl $Repo --token $Token -o $out
}

Write-Host "==> Velopack-Paket"
$packArgs = @(
  "pack", "-u", "checkst", "-v", $Version, "-p", $pack, "-e", "checkst.exe",
  "--packTitle", "checkst", "--packAuthors", "checkst",
  "-i", "src-tauri\icons\icon.ico", "-o", $out
)
if ($Notes) { $packArgs += @("--releaseNotes", $Notes) }
vpk @packArgs
if ($LASTEXITCODE -ne 0) { throw "vpk pack fehlgeschlagen" }

if ($Upload) {
  Write-Host "==> GitHub-Release v$Version"
  vpk upload github --repoUrl $Repo --token $Token -o $out --publish --releaseName "checkst $Version" --tag "v$Version"
  if ($LASTEXITCODE -ne 0) { throw "vpk upload fehlgeschlagen" }
}

Write-Host ""
Write-Host "Fertig. Installer: $out\checkst-win-Setup.exe"
