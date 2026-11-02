$ErrorActionPreference = 'Stop'
$script:InstallRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:MarketplaceRoot = Join-Path $script:InstallRoot 'marketplace'
$script:ReceiptPath = Join-Path $script:InstallRoot 'integration-state.json'
$script:PluginId = 'gmx-plugin@gmx-projekt'

function ConvertTo-GmxArgument([string]$Value) {
    return '"' + (($Value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}

function Start-GmxProcess([string]$Executable, [string[]]$Arguments, [string]$InputText = '', [string]$CodexHome = '') {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.Arguments = ($Arguments | ForEach-Object { ConvertTo-GmxArgument $_ }) -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    if ($CodexHome) { $info.EnvironmentVariables['CODEX_HOME'] = $CodexHome }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $started = $false
    try {
        if (-not $process.Start()) { throw 'Start failed' }
        $started = $true
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        # Windows PowerShell 5.1 lacks ProcessStartInfo.StandardInputEncoding.
        # Write UTF-8 bytes directly so umlauts in passwords survive unchanged.
        $inputBytes = [Text.Encoding]::UTF8.GetBytes($InputText)
        $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
        $process.StandardInput.BaseStream.Flush()
        [Array]::Clear($inputBytes, 0, $inputBytes.Length)
        $process.StandardInput.Close()
        return @{ Process=$process; Output=$outTask; Error=$errTask }
    } catch {
        if ($started -and -not $process.HasExited) { $process.Kill() }
        $process.Dispose()
        throw 'Ein benötigtes Programm konnte nicht gestartet werden. Bitte die Installation erneut ausführen.'
    }
}

function Invoke-GmxProcess([string]$Executable, [string[]]$Arguments, [string]$CodexHome = '') {
    $job = Start-GmxProcess $Executable $Arguments '' $CodexHome
    try {
        if (-not $job.Process.WaitForExit(30000)) {
            $job.Process.Kill(); $job.Process.WaitForExit()
            throw 'Codex antwortet nicht. Bitte Codex schließen und die Einrichtung erneut öffnen.'
        }
        $output = $job.Output.GetAwaiter().GetResult()
        $null = $job.Error.GetAwaiter().GetResult()
        if ($job.Process.ExitCode -ne 0) { throw 'Die Codex-Anbindung ist fehlgeschlagen. Bitte Codex aktualisieren oder schließen und erneut versuchen.' }
        try { return ($output | ConvertFrom-Json) } catch { throw 'Diese Codex-Version unterstützt die automatische Plugin-Einrichtung noch nicht. Bitte Codex aktualisieren.' }
    } finally { $job.Process.Dispose() }
}

function Find-GmxCodex {
    $command = Get-Command codex.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $bin = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if (Test-Path -LiteralPath $bin) {
        $candidate = Get-ChildItem -LiteralPath $bin -Filter codex.exe -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($candidate) { return $candidate.FullName }
    }
    # Packaged desktop installations may expose a CLI inside their own package.
    if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
        foreach ($app in @(Get-AppxPackage '*Codex*' -ErrorAction SilentlyContinue)) {
            $candidate = Get-ChildItem -LiteralPath $app.InstallLocation -Filter codex.exe -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch '\\WindowsApps\\[^\\]+\\app\\Codex.exe$' } |
                Select-Object -First 1
            if ($candidate) { return $candidate.FullName }
        }
    }
    throw 'Codex wurde nicht gefunden. Bitte Codex installieren, einmal öffnen und anmelden. Danach diese Einrichtung erneut starten.'
}

function Get-GmxCodexHome {
    if ($env:CODEX_HOME) { return [IO.Path]::GetFullPath($env:CODEX_HOME) }
    return Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
}

function Get-GmxMarketplace($Cli, $CodexHome) {
    $listed = Invoke-GmxProcess $Cli @('plugin','marketplace','list','--json') $CodexHome
    return @($listed.marketplaces | Where-Object { $_.name -ceq 'gmx-projekt' })
}

function Test-GmxSamePath([string]$Left, [string]$Right) {
    return [IO.Path]::GetFullPath($Left).TrimEnd('\') -ieq [IO.Path]::GetFullPath($Right).TrimEnd('\')
}

function Register-GmxPlugin {
    $cli = Find-GmxCodex
    $codexHome = Get-GmxCodexHome
    # The CLI requires an explicitly supplied CODEX_HOME to exist, including on
    # the first invocation of a freshly installed Codex. Never replace contents.
    try { $null = [IO.Directory]::CreateDirectory($codexHome) }
    catch { throw 'Der Codex-Benutzerordner ist nicht beschreibbar. Bitte Codex einmal regulär öffnen.' }
    $existing = @(Get-GmxMarketplace $cli $codexHome)
    if ($existing.Count -gt 1 -or ($existing.Count -eq 1 -and -not (Test-GmxSamePath $existing[0].root $script:MarketplaceRoot))) {
        throw 'Es gibt bereits eine GMX-Installation aus einem anderen Ordner. Diese wurde nicht verändert. Bitte zuerst deren Plugin-Verbindung entfernen; die GMX-Kontodaten bleiben erhalten.'
    }
    $receipt = @{ schema=1; pluginId=$script:PluginId; codexHome=$codexHome; marketplaceRoot=$script:MarketplaceRoot; installedPath=$null }
    # Persist ownership before registration so even an interrupted first install is removable.
    $receipt | ConvertTo-Json | Set-Content -LiteralPath $script:ReceiptPath -Encoding UTF8
    if ($existing.Count -eq 0) { $null = Invoke-GmxProcess $cli @('plugin','marketplace','add',$script:MarketplaceRoot,'--json') $codexHome }
    $installed = Invoke-GmxProcess $cli @('plugin','add',$script:PluginId,'--json') $codexHome
    if ($installed.pluginId -cne $script:PluginId -or -not $installed.installedPath) { throw 'Codex hat die GMX-Einrichtung nicht bestätigt. Bitte erneut versuchen.' }
    $receipt.installedPath = $installed.installedPath
    $receipt | ConvertTo-Json | Set-Content -LiteralPath $script:ReceiptPath -Encoding UTF8
    Write-Output 'GMX Plugin wurde mit Codex verbunden.'
}

function Unregister-GmxPlugin {
    $setupExecutable = Join-Path $script:InstallRoot 'GMX-Einrichten.exe'
    $setupRunning = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -and (Test-GmxSamePath $_.Path $setupExecutable) } catch { $false }
    })
    if ($setupRunning.Count) { throw 'Bitte zuerst das GMX-Einrichtungsfenster schließen und die Deinstallation erneut starten.' }
    if (-not (Test-Path -LiteralPath $script:ReceiptPath)) { return }
    try { $receipt = Get-Content -LiteralPath $script:ReceiptPath -Raw | ConvertFrom-Json } catch { throw 'Der Einrichtungsnachweis ist beschädigt. Bitte den Installer erneut ausführen.' }
    if ($receipt.schema -ne 1 -or $receipt.pluginId -cne $script:PluginId -or -not (Test-GmxSamePath $receipt.marketplaceRoot $script:MarketplaceRoot)) {
        throw 'Der Einrichtungsnachweis gehört nicht zu diesem Programmordner. Es wurde nichts entfernt.'
    }
    $cli = Find-GmxCodex
    $existing = @(Get-GmxMarketplace $cli $receipt.codexHome)
    if ($existing.Count -eq 0) { return }
    if ($existing.Count -ne 1 -or -not (Test-GmxSamePath $existing[0].root $script:MarketplaceRoot)) {
        throw 'Die GMX-Verbindung wurde inzwischen geändert. Bitte sie in Codex prüfen, bevor diese Installation entfernt wird.'
    }
    # The receipt may have been written just before a successful CLI call was
    # interrupted. Inspect only this plugin's exact cache namespace as well.
    $cacheRoot = Join-Path $receipt.codexHome 'plugins\cache\gmx-projekt\gmx-plugin'
    if ($receipt.installedPath -or (Test-Path -LiteralPath $cacheRoot)) {
        $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
            try { $_.Path -and $_.Path.StartsWith(([IO.Path]::GetFullPath($cacheRoot).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase) } catch { $false }
        })
        if ($running.Count) { throw 'Das GMX Plugin wird gerade verwendet. Bitte Codex schließen und die Deinstallation erneut starten.' }
        $null = Invoke-GmxProcess $cli @('plugin','remove',$script:PluginId,'--json') $receipt.codexHome
    }
    $null = Invoke-GmxProcess $cli @('plugin','marketplace','remove','gmx-projekt','--json') $receipt.codexHome
    Write-Output 'Die GMX-Verbindung wurde entfernt. Kontodaten und eigene Dateien bleiben erhalten.'
}
