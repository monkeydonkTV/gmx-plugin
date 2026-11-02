param([ValidateSet('Register','Unregister')][string]$Action = 'Register')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Integration-Common.ps1')
try {
    if ($Action -eq 'Register') { Register-GmxPlugin } else { Unregister-GmxPlugin }
    exit 0
} catch {
    # CLI output, profiles and environment variables may contain private details.
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
