$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$standaloneDir = Join-Path $root ".next\\standalone"
$staticDir = Join-Path $root ".next\\static"
$publicDir = Join-Path $root "public"
$artifactDir = Join-Path $root ".deploy_artifact"
$zipPath = Join-Path $root "ic2-clients-app-deploy.zip"

if (!(Test-Path $standaloneDir)) {
  throw "Standalone build output was not found. Run 'npm run build' first."
}

if (Test-Path $artifactDir) {
  Remove-Item -LiteralPath $artifactDir -Recurse -Force
}

New-Item -ItemType Directory -Path $artifactDir | Out-Null

Copy-Item -LiteralPath (Join-Path $standaloneDir "*") -Destination $artifactDir -Recurse -Force

$artifactNextDir = Join-Path $artifactDir ".next"
New-Item -ItemType Directory -Path $artifactNextDir -Force | Out-Null

if (Test-Path $staticDir) {
  Copy-Item -LiteralPath $staticDir -Destination (Join-Path $artifactNextDir "static") -Recurse -Force
}

if (Test-Path $publicDir) {
  Copy-Item -LiteralPath $publicDir -Destination (Join-Path $artifactDir "public") -Recurse -Force
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $artifactDir "*") -DestinationPath $zipPath -Force

Write-Host "Azure deploy package created:"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "App Service startup command:"
Write-Host "  node server.js"
