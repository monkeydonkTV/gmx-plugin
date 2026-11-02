$ErrorActionPreference = 'Stop'

function Assert-GmxNodeVersion([string]$Version) {
    if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$' -or [version]($Version -replace '^v', '') -lt [version]'22.12.0') {
        throw 'GMX Plugin braucht Node.js ab Version 22.12. Bitte Node.js aktualisieren und Codex danach neu starten.'
    }
}

function Get-GmxNodeExecutable {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Dieses GMX Plugin ist fuer Windows vorgesehen.'
    }
    $privateNode = Join-Path $PSScriptRoot '../runtime/node.exe'
    $nodePath = if (Test-Path -LiteralPath $privateNode -PathType Leaf) {
        [IO.Path]::GetFullPath($privateNode)
    } else {
        $nodeCommand = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction SilentlyContinue
        if ($nodeCommand) { $nodeCommand.Source }
    }
    if (-not $nodePath) {
        throw 'Node.js fehlt. Installiere Node.js ab Version 22.12 und starte Codex danach neu.'
    }
    $nodeVersion = & $nodePath --version 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Node.js konnte nicht gestartet werden. Bitte die Node.js-Installation pruefen.' }
    Assert-GmxNodeVersion ([string]$nodeVersion)
    return $nodePath
}
