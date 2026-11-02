# Entwicklung und Bau

## Versionen und Herkunft

Pluginversion: 0.1.7 in plugin.json. Die ursprüngliche IMAP-Engine führt weiter ihre Paketversion 2.2.0. package.json ist mit private=true gegen eine versehentliche npm-Veröffentlichung gesperrt. Es enthält keinen Verweis auf fremde Veröffentlichungs- oder Supportziele.

Die Windows-Mailfunktionen, Einrichtungshelfer und Tests stammen aus dem geprüften GMX-Entwicklungsstand. Für diese GitHub-Fassung wurden Dokumentation und Ausgabeordner portabel gemacht. Die ursprüngliche private Git-Historie wird nicht mitgeliefert. Herkunft und ursprüngliche MIT-Lizenz stehen in NOTICE.md und LICENSE.

## Voraussetzungen für Entwickler

- Windows für den vollständigen GMX- und Installer-Test.
- Node.js ab 22.12, empfohlen eine aktuelle unterstützte 24er-Version.
- npm und die mitgelieferte package-lock.json. npm ci installiert die darin festgelegten Versionen und prüft deren Integritätsangaben.
- Für den Installer zusätzlich Inno Setup 7.1.1 und der integrierte .NET-Framework-C#-Compiler von Windows.

## Prüfen und Plugin bauen

```powershell
npm ci
npm run lint
npm run build
npm test
npm run build:plugin
```

Der gebündelte reine Pluginordner entsteht unter **.build/plugin**. Dieser alternative Ordner benötigt eine eigene unterstützte Node-Laufzeit. Das normale Installationspaket bringt eine private Laufzeit mit.

Für den SMTP-freien Pakettest:

```powershell
node scripts/smoke-gmx.mjs .build/plugin
```

Der Pakettest erstellt ausschließlich seine eigenen künstlichen Konten. Niemals auf eine echte Kontoablage umbiegen.

## Vollständigen Installer bauen

1. Inno Setup 7.1.1 vom Hersteller bereitstellen.
2. Node 24.22.2 aus der offiziellen Distribution für win-x64 beziehen und die offiziellen Prüfsummen kontrollieren.
3. node.exe und LICENSE in einen separaten lokalen Laufzeitordner entpacken. Der Builder prüft beide Dateien gegen installer/runtime-lock.json.
4. Den Compiler- und Laufzeitpfad explizit angeben:

```powershell
npm run build:installer -- --compiler "C:/Tools/InnoSetup7/ISCC.exe" --runtime "C:/Tools/node-runtime"
```

Diese Pfade sind Beispiele für selbst gewählte Werkzeugordner. Das Ergebnis entsteht unter **.build/release**, Zwischenstände unter **.build/installer**. Ein schon vorhandener gleichnamiger Installer wird nicht überschrieben. Der fertige Payload hat eine feste Dateiliste; Kontodaten und Entwicklerprofile werden nicht eingepackt.

Der bestehende Download-Installer wurde separat abgenommen und wird unverändert angeboten. Ein eigener Neubau kann durch Compiler-, Zeit- oder Dokumentationsunterschiede einen anderen Dateihash haben; bitgenaue Reproduzierbarkeit der vollständigen EXE wird nicht behauptet. Der veröffentlichten Prüfsumme entspricht die zum Download bereitgestellte Datei.

## Zusätzliche lokale Prüfungen

Unter installer/tests liegen Prüfungen der tatsächlichen Windows-Helfer und der Codex-CLI. Test-Integration.ps1 und check-setup-worker.mjs nur gegen eine frisch gebaute Testkopie und einen eigenen Arbeitsordner ausführen.

Test-WindowsSandbox.ps1 ist ausschließlich für eine wegwerfbare, netzlose Windows-Sandbox mit C:/GMXInput und C:/GMXResults bestimmt. Es verweigert den Start außerhalb des Sandbox-Benutzers. Unter C:/GMXInput muss genau ein GMX-Plugin-Setup-*.exe liegen, zusammen mit codex.exe, payload-hashes.json aus dem Baunachweis und check-mcp-offline.mjs. Die Testskripte verwenden künstliche Konten. Reale Mailtests sind manuell und benötigen eigene ausdrückliche Freigaben.

Die normale Testsuite arbeitet mit Mocks und künstlichen Daten. Sie benötigt keine echten Mailzugänge, GitHub-Schlüssel oder KI-API-Schlüssel. In dieser GitHub-Fassung ist keine automatische Veröffentlichung vorbereitet.

[Prüfstand](PRUEFSTAND.md) · [Beitragen](../CONTRIBUTING.md)
