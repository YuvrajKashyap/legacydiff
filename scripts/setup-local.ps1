$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Force '.local/tools/spacetime' | Out-Null
$archive = Join-Path $projectRoot '.local/tools/spacetime.zip'
$expectedHash = '71adfafd162c996695c4f28a5cdc7b659de1511b21336bdacc8fd8ca98b6dd47'
if (-not (Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest 'https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.14.1/spacetime-x86_64-pc-windows-msvc.zip' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $expectedHash) {
  throw 'Spacetime archive checksum mismatch.'
}
if (-not (Test-Path -LiteralPath '.local/tools/spacetime/spacetimedb-cli.exe')) {
  Expand-Archive -LiteralPath $archive -DestinationPath '.local/tools/spacetime'
}
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Root dependency installation failed.' }
npm ci --prefix backend/database/spacetimedb
if ($LASTEXITCODE -ne 0) { throw 'Module dependency installation failed.' }
node scripts/create-local-keys.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local key initialization failed.' }
Write-Output 'Local dependencies ready. Follow README startup order. Nothing was published publicly.'
