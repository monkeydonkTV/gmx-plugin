param([Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
$inputData=[Console]::In.ReadToEnd()
. (Join-Path $Payload 'tools\Integration-Common.ps1')
# Reproduce the .NET Framework pipe preamble seen on a fresh Windows profile.
# This test receives only synthetic input from check-setup-worker.mjs.
[Console]::InputEncoding=New-Object Text.UTF8Encoding($true)
$job=Start-GmxProcess (Join-Path $PSHOME 'powershell.exe') @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $Payload 'tools\Setup-Account.ps1')) $inputData
$inputData=$null
try {
    if(-not $job.Process.WaitForExit(20000)){$job.Process.Kill();throw 'Test worker timed out'}
    [Console]::Out.Write($job.Output.GetAwaiter().GetResult())
    [Console]::Error.Write($job.Error.GetAwaiter().GetResult())
    exit $job.Process.ExitCode
} finally {$job.Process.Dispose()}
