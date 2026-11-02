param([switch]$CheckConnection)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
. (Join-Path $PSScriptRoot 'Integration-Common.ps1')
$pluginRoot=Join-Path $script:MarketplaceRoot 'gmx-plugin'
. (Join-Path $pluginRoot 'scripts\Check-Runtime-GMX.ps1')
. (Join-Path $pluginRoot 'scripts\Store-GMX.ps1')
try {
    $node=Get-GmxNodeExecutable
    Initialize-GmxStore
    $inputData=[Console]::In.ReadToEnd()
    if($inputData.Length -gt 16384){throw 'Input too large'}
    $job=Start-GmxProcess $node @((Join-Path $pluginRoot 'dist\gmx-setup.js')) $inputData
    $inputData=$null
    try {
        if(-not $job.Process.WaitForExit(15000)){$job.Process.Kill();throw 'Timeout'}
        $null=$job.Output.GetAwaiter().GetResult();$null=$job.Error.GetAwaiter().GetResult()
        if($job.Process.ExitCode -ne 0){throw 'Setup failed'}
    } finally {$job.Process.Dispose()}
    if($CheckConnection){
        $job=Start-GmxProcess $node @((Join-Path $pluginRoot 'dist\gmx-check.js'))
        try {
            if(-not $job.Process.WaitForExit(40000)){$job.Process.Kill();exit 2}
            $null=$job.Output.GetAwaiter().GetResult();$null=$job.Error.GetAwaiter().GetResult()
            if($job.Process.ExitCode -ne 0){exit 2}
        } finally {$job.Process.Dispose()}
    }
    exit 0
} catch {
    [Console]::Error.WriteLine('Konto konnte nicht lokal gespeichert werden. Bitte Eingabe und lokale Ablage prüfen.')
    exit 1
}
