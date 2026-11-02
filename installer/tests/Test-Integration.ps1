param([Parameter(Mandatory=$true)][string]$Payload,[Parameter(Mandatory=$true)][string]$WorkRoot)
$ErrorActionPreference='Stop'
$cli=(Get-Command codex.exe -CommandType Application).Source
$testRoot=Join-Path ([IO.Path]::GetFullPath($WorkRoot)) ('integration-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$program=Join-Path $testRoot 'Programm mit Ü und & Zeichen'
$profile=Join-Path $testRoot 'Codex mit Ü und & Zeichen'
New-Item -ItemType Directory -Path $program,$profile -Force | Out-Null
foreach($entry in Get-ChildItem -LiteralPath $Payload -Force){
 if($entry.Name -ne 'integration-state.json'){Copy-Item -LiteralPath $entry.FullName -Destination $program -Recurse}
}
$env:CODEX_HOME=$profile
[IO.File]::WriteAllText((Join-Path $profile 'config.toml'),'model_reasoning_effort = "high"'+"`n",[Text.UTF8Encoding]::new($false))
$checks=New-Object Collections.Generic.List[string]
function Run-Integration([string]$Action,[bool]$Success=$true){
 $savedPreference=$ErrorActionPreference; $ErrorActionPreference='Continue'
 $messages=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $program 'tools\Integration-Codex.ps1') -Action $Action 2>&1
 $exit=$LASTEXITCODE
 $ErrorActionPreference=$savedPreference
 if(($exit -eq 0) -ne $Success){throw ('Unexpected '+$Action+' result: '+($messages -join ' '))}
}
function Assert-True($Value,[string]$Message){if(-not $Value){throw $Message}}
try{
 Run-Integration 'Register'
 $receipt=Get-Content -LiteralPath (Join-Path $program 'integration-state.json') -Raw | ConvertFrom-Json
 Assert-True (Test-Path -LiteralPath (Join-Path $receipt.installedPath 'runtime\node.exe')) 'Private runtime missing from installed copy'
 $checks.Add('register-with-spaces-umlauts-and-ampersand')
 Run-Integration 'Register'; $checks.Add('repeat-registration')
 # A different source with the same marketplace name must not be overwritten.
 $other=Join-Path $testRoot 'other-installation'
 Copy-Item -LiteralPath $program -Destination $other -Recurse
 Remove-Item -LiteralPath (Join-Path $other 'integration-state.json')
 $ErrorActionPreference='Continue'
 $null=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $other 'tools\Integration-Codex.ps1') -Action Register 2>&1
 $conflictExit=$LASTEXITCODE; $ErrorActionPreference='Stop'
 Assert-True ($conflictExit -ne 0) 'Conflicting marketplace accepted'
 Assert-True (-not (Test-Path -LiteralPath (Join-Path $other 'integration-state.json'))) 'Conflicting source wrote ownership receipt'
 $checks.Add('conflicting-marketplace-preserved')
 # An active private runtime must prevent unregistering its cache.
 $process=Start-Process -FilePath (Join-Path $receipt.installedPath 'runtime\node.exe') -ArgumentList @('-e','"setTimeout(()=>{},60000)"') -WindowStyle Hidden -PassThru
 try {Run-Integration 'Unregister' $false; Assert-True (Test-Path -LiteralPath $receipt.installedPath) 'Active package deleted'}
 finally {if(-not $process.HasExited){$process.Kill();$process.WaitForExit()};$process.Dispose()}
 $checks.Add('active-plugin-blocks-removal')
 # Simulate interruption after plugin-add but before saving its returned path.
 $receipt.installedPath=$null
 $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $program 'integration-state.json') -Encoding UTF8
 Run-Integration 'Unregister'
 Assert-True (-not (Test-Path -LiteralPath (Join-Path $profile 'plugins\cache\gmx-projekt\gmx-plugin'))) 'Interrupted install left plugin cache'
 $checks.Add('interrupted-registration-cleanup')
 Run-Integration 'Register'
 $oldAccount=Join-Path $testRoot 'synthetic-account-data.txt'; [IO.File]::WriteAllText($oldAccount,'keep this synthetic data')
 # Updating the version uses the same identity and preserves user preferences.
 $currentVersion=[Version](Get-Content -LiteralPath (Join-Path $program 'marketplace\gmx-plugin\plugin.json') -Raw | ConvertFrom-Json).version
 $nextVersion='{0}.{1}.{2}' -f $currentVersion.Major,$currentVersion.Minor,($currentVersion.Build+1)
 foreach($name in @('plugin.json','package.json','.codex-plugin\plugin.json')){
  $file=Join-Path $program ('marketplace\gmx-plugin\'+$name)
  $json=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json; $json.version=$nextVersion
  [IO.File]::WriteAllText($file,($json|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
 }
 Run-Integration 'Register'
 $updated=Get-Content -LiteralPath (Join-Path $program 'integration-state.json') -Raw | ConvertFrom-Json
 Assert-True ((Split-Path -Leaf $updated.installedPath) -eq $nextVersion) 'Updated version not installed'
 $checks.Add('upgrade-registration')
 Run-Integration 'Unregister'; Run-Integration 'Unregister'
 $listed=& $cli plugin marketplace list --json | ConvertFrom-Json
 Assert-True (@($listed.marketplaces | Where-Object {$_.name -eq 'gmx-projekt'}).Count -eq 0) 'Marketplace not removed'
 Assert-True ((Get-Content -LiteralPath (Join-Path $profile 'config.toml') -Raw).Contains('model_reasoning_effort = "high"')) 'Unrelated preference changed'
 Assert-True ([IO.File]::ReadAllText($oldAccount) -eq 'keep this synthetic data') 'Unrelated data changed'
 $checks.Add('repeat-uninstall-and-unrelated-preference-preserved')
 [pscustomobject]@{success=$true;checks=$checks.ToArray();realProfileUsed=$false;mailSent=$false;testRoot=$testRoot} | ConvertTo-Json -Depth 5
} catch {throw}
