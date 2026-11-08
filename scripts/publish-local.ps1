$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
& '.local/tools/spacetime/spacetimedb-cli.exe' publish legacydiff-local-v2 --server 'http://127.0.0.1:3000' --module-path 'spacetime/spacetimedb' --no-config --yes
if ($LASTEXITCODE -ne 0) { throw 'Local module publication failed; no automatic data deletion is allowed.' }
& '.local/tools/spacetime/spacetimedb-cli.exe' generate --lang typescript --out-dir 'packages/client/generated' --module-path 'spacetime/spacetimedb' --yes
if ($LASTEXITCODE -ne 0) { throw 'Binding generation failed.' }
