$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$buildOutputDirName = ".next-azure"
$buildOutputDir = Join-Path $root $buildOutputDirName
$standaloneDir = Join-Path $buildOutputDir "standalone"
$staticDir = Join-Path $buildOutputDir "static"
$publicDir = Join-Path $root "public"
$artifactDir = Join-Path $root ".azure_deploy_artifact"
$zipPath = Join-Path $root "ic2-clients-app-deploy.local.zip"

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $null = robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP

  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed copying '$Source' to '$Destination' (exit code $LASTEXITCODE)."
  }
}

if (Test-Path $buildOutputDir) {
  Remove-Item -LiteralPath $buildOutputDir -Recurse -Force
}

Push-Location $root
try {
  $env:BUILD_OUTPUT_DIR = $buildOutputDirName
  & npx next build --webpack

  if ($LASTEXITCODE -ne 0) {
    throw "next build --webpack failed (exit code $LASTEXITCODE)."
  }
}
finally {
  Remove-Item Env:BUILD_OUTPUT_DIR -ErrorAction SilentlyContinue
  Pop-Location
}

if (!(Test-Path $standaloneDir)) {
  throw "Standalone build output was not found after the Azure build."
}

if (Test-Path $artifactDir) {
  Remove-Item -LiteralPath $artifactDir -Recurse -Force
}

New-Item -ItemType Directory -Path $artifactDir | Out-Null

Copy-DirectoryContents -Source $standaloneDir -Destination $artifactDir

$artifactNextDir = Join-Path $artifactDir ".next"
$artifactBuildDir = Join-Path $artifactDir $buildOutputDirName
New-Item -ItemType Directory -Path $artifactNextDir -Force | Out-Null
New-Item -ItemType Directory -Path $artifactBuildDir -Force | Out-Null

if (Test-Path $staticDir) {
  Copy-DirectoryContents -Source $staticDir -Destination (Join-Path $artifactNextDir "static")
  Copy-DirectoryContents -Source $staticDir -Destination (Join-Path $artifactBuildDir "static")
}

if (Test-Path $publicDir) {
  Copy-DirectoryContents -Source $publicDir -Destination (Join-Path $artifactDir "public")
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Push-Location $artifactDir
try {
  & tar -a -cf $zipPath *

  if ($LASTEXITCODE -ne 0) {
    throw "tar failed creating '$zipPath' (exit code $LASTEXITCODE)."
  }
}
finally {
  Pop-Location
}

Write-Host "Azure deploy package created:"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "App Service startup command:"
Write-Host "  node server.js"
