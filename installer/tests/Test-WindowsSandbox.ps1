$ErrorActionPreference='Stop'
# This script installs/removes software in the current profile: never run it on the host.
if([Environment]::UserName -ne 'WDAGUtilityAccount'){throw 'Run this test only inside Windows Sandbox.'}
$installers=@(Get-ChildItem -LiteralPath 'C:\GMXInput' -Filter 'GMX-Plugin-Setup-*.exe' -File)
if($installers.Count -ne 1){throw 'Provide exactly one installer in C:\GMXInput.'}
$installer=$installers[0].FullName
$resultPath='C:\GMXResults\result.json'
$checks=New-Object Collections.Generic.List[string]
function Assert-Gmx($Value,[string]$Message){if(-not $Value){throw $Message}}
function Install-Gmx {
 $p=Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-') -WindowStyle Hidden -PassThru -Wait
 Assert-Gmx ($p.ExitCode -eq 0) 'Installer exit code'
}
try {
 Assert-Gmx (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) 'Global Node unexpectedly present'
 $checks.Add('fresh-windows-without-node')
 $program=Join-Path $env:LOCALAPPDATA 'Programs\GMXPlugin'
 $accountDir=Join-Path $env:LOCALAPPDATA 'GMXPlugin'
 $env:GMX_PLUGIN_DATA_DIR=$accountDir
 $env:CODEX_HOME=Join-Path $env:USERPROFILE '.codex'
 Install-Gmx
 Assert-Gmx (Test-Path -LiteralPath (Join-Path $program 'GMX-Einrichten.exe')) 'GUI missing'
 Assert-Gmx (Test-Path -LiteralPath (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\GMX Plugin\GMX-Konto einrichten.lnk')) 'Start menu shortcut missing'
 $manifest=Get-Content -LiteralPath 'C:\GMXInput\payload-hashes.json' -Raw | ConvertFrom-Json
 foreach($file in $manifest){Assert-Gmx ((Get-FileHash -LiteralPath (Join-Path $program $file.path)).Hash -eq $file.sha256) ('Payload mismatch: '+$file.path)}
 $checks.Add(('all-'+$manifest.Count+'-installed-payload-files-identical'))
 # Missing Codex is reported, and does not claim successful registration.
 $ErrorActionPreference='Continue'
 $null=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $program 'tools\Integration-Codex.ps1') -Action Register 2>&1
 $missingCode=$LASTEXITCODE;$ErrorActionPreference='Stop'
 Assert-Gmx ($missingCode -ne 0) 'Missing Codex accepted'
 Assert-Gmx (-not (Test-Path -LiteralPath (Join-Path $program 'integration-state.json'))) 'False registration receipt'
 $checks.Add('missing-codex-handled')
 New-Item -ItemType Directory -Path 'C:\GMXTestTools' -Force | Out-Null
 Copy-Item -LiteralPath 'C:\GMXInput\codex.exe' -Destination 'C:\GMXTestTools\codex.exe'
 $env:PATH='C:\GMXTestTools;'+$env:PATH
 & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $program 'tools\Integration-Codex.ps1') -Action Register | Out-Null
 Assert-Gmx ($LASTEXITCODE -eq 0) 'Codex registration failed'
 $checks.Add('real-codex-cli-offline-registration')
 . (Join-Path $program 'tools\Integration-Common.ps1')
 $job=Start-GmxProcess (Join-Path $PSHOME 'powershell.exe') @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $program 'tools\Setup-Account.ps1')) '{"email":"synthetic@example.test","password":"synthetic-ä-🔐-offline"}'
 Assert-Gmx ($job.Process.WaitForExit(20000)) 'Setup timeout'
 Assert-Gmx ($job.Process.ExitCode -eq 0) 'Setup failed'
 $job.Process.Dispose()
 $accountFile=Join-Path $accountDir 'accounts.json';$keyFile=Join-Path $accountDir '.key'
 $oldHash=(Get-FileHash -LiteralPath $accountFile).Hash;$keyHash=(Get-FileHash -LiteralPath $keyFile).Hash
 Assert-Gmx (-not ([IO.File]::ReadAllText($accountFile).Contains('synthetic-ä-🔐-offline'))) 'Password plaintext'
 $checks.Add('default-per-user-store-encrypted')
 # Verify effective ACL boundaries and reject a redirected attachment directory.
 . (Join-Path $program 'marketplace\gmx-plugin\scripts\Store-GMX.ps1')
 Initialize-GmxStore
 $allowedSids=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
 foreach($protected in @($accountDir,$accountFile,$keyFile,(Join-Path $accountDir 'Files'))){
  $acl=Get-Acl -LiteralPath $protected
  Assert-Gmx $acl.AreAccessRulesProtected 'Credential ACL inherits broad permissions'
  foreach($rule in $acl.Access){Assert-Gmx ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -in $allowedSids) 'Unexpected credential ACL principal'}
 }
 $checks.Add('windows-store-acl-only-user-system-administrators')
 $redirectRoot='C:\GMXTestTools\redirect-store';$outside='C:\GMXTestTools\outside'
 New-Item -ItemType Directory -Path $redirectRoot,$outside -Force | Out-Null
 New-Item -ItemType Junction -Path (Join-Path $redirectRoot 'Files') -Target $outside | Out-Null
 $env:GMX_PLUGIN_DATA_DIR=$redirectRoot;$rejected=$false
 try {Initialize-GmxStore} catch {$rejected=$true}
 Assert-Gmx $rejected 'Attachment junction accepted'
 $env:GMX_PLUGIN_DATA_DIR=$accountDir;Initialize-GmxStore
 $checks.Add('redirected-files-directory-rejected')
 $receipt=Get-Content -LiteralPath (Join-Path $program 'integration-state.json') -Raw | ConvertFrom-Json
 $node=Join-Path $receipt.installedPath 'runtime\node.exe'
 $protocol=& $node 'C:\GMXInput\check-mcp-offline.mjs' $receipt.installedPath
 Assert-Gmx ($LASTEXITCODE -eq 0) 'Offline MCP failed'
 $protocol | Set-Content -LiteralPath 'C:\GMXResults\mcp.json' -Encoding UTF8
 $checks.Add('private-runtime-12-tools-dryrun-clean-exit')
 Install-Gmx
 Assert-Gmx ((Get-FileHash -LiteralPath $accountFile).Hash -eq $oldHash) 'Reinstall changed account'
 Assert-Gmx ((Get-FileHash -LiteralPath $keyFile).Hash -eq $keyHash) 'Reinstall changed key'
 $checks.Add('reinstall-preserves-account-and-key')
 $p=Start-Process -FilePath (Join-Path $program 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -PassThru -Wait
 Assert-Gmx ($p.ExitCode -eq 0) 'Uninstall failed'
 Assert-Gmx (-not (Test-Path -LiteralPath (Join-Path $program 'GMX-Einrichten.exe'))) 'Program remains'
 Assert-Gmx (-not (Test-Path -LiteralPath $receipt.installedPath)) 'Plugin cache remains'
 Assert-Gmx ((Get-FileHash -LiteralPath $accountFile).Hash -eq $oldHash) 'Uninstall changed account'
 Assert-Gmx ((Get-FileHash -LiteralPath $keyFile).Hash -eq $keyHash) 'Uninstall changed key'
 $listed=& 'C:\GMXTestTools\codex.exe' plugin marketplace list --json | ConvertFrom-Json
 Assert-Gmx (@($listed.marketplaces|Where-Object {$_.name -eq 'gmx-projekt'}).Count -eq 0) 'Marketplace remains'
 $checks.Add('uninstall-removes-integration-preserves-own-data')
 [pscustomobject]@{success=$true;checks=$checks.ToArray();networkDisabled=$true;realCredentialsUsed=$false;hostProfileShared=$false;windows=[Environment]::OSVersion.Version.ToString()} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
 [pscustomobject]@{success=$false;checks=$checks.ToArray();error=$_.Exception.Message} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding UTF8
 exit 1
}
