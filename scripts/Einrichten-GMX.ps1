$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Check-Runtime-GMX.ps1')
$nodePath = Get-GmxNodeExecutable
. (Join-Path $PSScriptRoot 'Store-GMX.ps1')
Initialize-GmxStore
$mailAddress = Read-Host 'Deine vollständige GMX-E-Mail-Adresse'
$mailSecret = Read-Host 'GMX-Kennwort oder anwendungsspezifisches Kennwort' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mailSecret)
try {
    $setupData = @{ email = $mailAddress; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) } | ConvertTo-Json -Compress
    $setupData | & $nodePath (Join-Path $PSScriptRoot '../dist/gmx-setup.js')
    if ($LASTEXITCODE -ne 0) { throw 'GMX-Einrichtung fehlgeschlagen.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $setupData = $null
    $mailSecret.Dispose()
}
