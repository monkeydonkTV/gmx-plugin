$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Check-Runtime-GMX.ps1')
$nodePath = Get-GmxNodeExecutable
& $nodePath (Join-Path $PSScriptRoot 'launch-gmx.mjs')
exit $LASTEXITCODE
