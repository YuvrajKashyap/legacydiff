$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
& '.local/tools/spacetime/spacetimedb-standalone.exe' start --listen-addr '127.0.0.1:3000' --data-dir '.local/spacetime-data' --jwt-pub-key-path '.local/jwt-public.pem' --jwt-priv-key-path '.local/jwt-private.pem' --non-interactive
