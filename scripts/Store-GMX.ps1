$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
function Protect-GmxPath([string]$Target, [bool]$Directory) {
    $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowed = @($userSid, 'S-1-5-18', 'S-1-5-32-544')
    $suffix = if ($Directory) { '(OI)(CI)F' } else { 'F' }
    & icacls.exe $Target '/inheritance:r' '/grant:r' "*${userSid}:$suffix" "*S-1-5-18:$suffix" "*S-1-5-32-544:$suffix" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Windows konnte die GMX-Ablage nicht schützen.' }
    foreach ($rule in @((Get-Acl -LiteralPath $Target).Access)) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -eq 'Deny' -or $sid -notin $allowed) {
            $option = if ($rule.AccessControlType -eq 'Deny') { '/remove:d' } else { '/remove:g' }
            & icacls.exe $Target $option "*$sid" | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Unerwartete Zugriffsrechte in der GMX-Ablage.' }
        }
    }
    $checkedAcl = Get-Acl -LiteralPath $Target
    if (-not $checkedAcl.AreAccessRulesProtected) { throw 'GMX-Dateirechte wurden nicht übernommen.' }
    foreach ($rule in $checkedAcl.Access) {
        if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'GMX-Dateirechte sind unerwartet.' }
    }
}
function Initialize-GmxStore {
    if (-not $env:GMX_PLUGIN_DATA_DIR) { $env:GMX_PLUGIN_DATA_DIR = Join-Path $env:LOCALAPPDATA 'GMXPlugin' }
    $storePath = [IO.Path]::GetFullPath($env:GMX_PLUGIN_DATA_DIR)
    if (-not (Test-Path -LiteralPath $storePath)) { New-Item -ItemType Directory -Path $storePath -Force | Out-Null }
    $entry = Get-Item -LiteralPath $storePath -Force
    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Ungültiger GMX-Datenordner.' }
    Protect-GmxPath $storePath $true
    foreach ($name in @('.key', 'accounts.json')) {
        $filePath = Join-Path $storePath $name
        if (Test-Path -LiteralPath $filePath) {
            if ((Get-Item -LiteralPath $filePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unzulässige Dateiverknüpfung in der Kennwortablage.' }
            Protect-GmxPath $filePath $false
        }
    }
    $env:IMAP_MCP_CONFIG_DIR = $storePath
    $env:IMAP_DOWNLOAD_DIR = Join-Path $storePath 'Files'
    if ((Test-Path -LiteralPath $env:IMAP_DOWNLOAD_DIR) -and ((Get-Item -LiteralPath $env:IMAP_DOWNLOAD_DIR -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unzulässige Verknüpfung im GMX-Dateiordner.' }
    New-Item -ItemType Directory -Path $env:IMAP_DOWNLOAD_DIR -Force | Out-Null
    Protect-GmxPath $env:IMAP_DOWNLOAD_DIR $true
    $pendingFolders = [Collections.Generic.Queue[string]]::new()
    $pendingFolders.Enqueue($env:IMAP_DOWNLOAD_DIR)
    while ($pendingFolders.Count -gt 0) {
        foreach ($child in Get-ChildItem -LiteralPath $pendingFolders.Dequeue() -Force) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Dateiverknüpfung im GMX-Dateiordner nicht erlaubt.' }
            Protect-GmxPath $child.FullName $child.PSIsContainer
            if ($child.PSIsContainer) { $pendingFolders.Enqueue($child.FullName) }
        }
    }
}
