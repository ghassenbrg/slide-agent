$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& node "$ProjectRoot\scripts\uninstall.mjs" @args
exit $LASTEXITCODE
