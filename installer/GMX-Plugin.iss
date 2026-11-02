#ifndef PayloadDir
  #error PayloadDir missing
#endif
#ifndef OutputPath
  #error OutputPath missing
#endif
#ifndef PluginVersion
  #error PluginVersion missing
#endif
[Setup]
AppId={{86A29F82-5EB5-4FE9-B187-473D0132DA0C}
AppName=GMX Plugin
AppVersion={#PluginVersion}
AppPublisher=monkeydonkTV
DefaultDirName={localappdata}\Programs\GMXPlugin
DefaultGroupName=GMX Plugin
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputPath}
OutputBaseFilename=GMX-Plugin-Setup-{#PluginVersion}
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=GMX Plugin
CloseApplications=no
RestartApplications=no
ChangesAssociations=no
ChangesEnvironment=no
SetupLogging=no
InfoBeforeFile={#PayloadDir}\INSTALLATION.txt
[Languages]
Name: german; MessagesFile: compiler:Languages\German.isl
[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\GMX-Konto einrichten"; Filename: "{app}\GMX-Einrichten.exe"; WorkingDir: "{app}"
Name: "{group}\GMX Plugin entfernen"; Filename: "{uninstallexe}"
[Run]
Filename: "{app}\GMX-Einrichten.exe"; Description: "Eigenes GMX-Konto jetzt einrichten"; Flags: postinstall nowait skipifsilent
[UninstallDelete]
Type: files; Name: "{app}\integration-state.json"
[Code]
function InitializeUninstall(): Boolean;
var Code: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\tools\Integration-Codex.ps1') + '" -Action Unregister',
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Code);
  Result := Result and (Code = 0);
  if not Result then
    SuppressibleMsgBox('Die GMX-Verbindung konnte noch nicht entfernt werden. Bitte Codex schließen und erneut versuchen. Bei einer geänderten Codex-Installation zunächst die GMX-Einrichtung erneut öffnen. Deine Kontodaten bleiben erhalten.', mbError, MB_OK, IDOK);
end;
