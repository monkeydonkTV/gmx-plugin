# GMX Plugin für Codex unter Windows

GMX-E-Mails in Codex suchen, lesen, beantworten, weiterleiten und auf eigenen Auftrag versenden.

Ein Projekt von **[monkeydonkTV](https://github.com/monkeydonkTV)** (Shakir Alman). Kostenlose Weiterentwicklung des MIT-lizenzierten Projekts imap-mcp-server. Kein offizielles Produkt von GMX oder OpenAI.

## Installation

1. Öffne auf der GitHub-Projektseite den Bereich **Releases**.
2. Lade **GMX-Plugin-Setup-0.1.7.exe** herunter und starte die Datei.
3. Gib im Einrichtungsfenster deine eigene GMX-Adresse und dein eigenes App-Passwort ein.
4. Wähle **Speichern und prüfen** und lade Codex anschließend neu.

Vorausgesetzt werden Windows mit x64-Unterstützung, eine installierte und angemeldete Codex-Version mit lokalen Plugins sowie ein GMX-Konto mit aktiviertem IMAP-Zugriff. Praktisch geprüft wurde Windows 11 x64. Node.js wird vom Installer mitgeliefert.

Die Verbindungsprüfung meldet sich bei GMX an und versendet dabei keine Mail. Jedes Konto wird vom jeweiligen Nutzer selbst eingerichtet.

[Ausführliche Installation](docs/INSTALLATION.md) · [Bedienung](BEDIENUNG.md) · [Datenschutzhinweise](docs/DATENSCHUTZ.md)

## Funktionen

- Ordner, ungelesene und neueste Nachrichten anzeigen; E-Mails suchen und lesen.
- Auf ausdrücklichen Auftrag senden, antworten und weiterleiten.
- Anhänge herunterladen oder zum Versand bereitstellen; gleichnamige Anhänge eindeutig auswählen.
- Zwölf ausgewählte Werkzeuge. Löschen, Verschieben und Kontoverwaltung sind im GMX-Plugin nicht verfügbar.

Beim Versand dürfen Anhänge zusammen höchstens 14 MiB, vollständige Nachrichten höchstens 20 MiB groß sein. Der Mailanbieter kann zusätzliche Grenzen setzen. Vorhandene Nachrichten werden vor der gekürzten Ausgabe vollständig eingelesen; die Versandgrenzen begrenzen diesen Abruf nicht. Das Plugin enthält keine PDF-Texterkennung.

Kann die Übersicht ungelesener Nachrichten einen Ordner nicht abfragen, meldet sie die Lücke ausdrücklich. `imap_get_unread_count` liefert dann `complete: false`, den Ordnerwert `null` und `foldersErrored`; `totalUnread` ist nur die bestätigte Teilsumme.

## Deine Daten

Kontodaten werden auf deinem PC getrennt von den Programmdateien gespeichert. Der Download enthält keine eingerichteten Konten. Kennwörter sind verschlüsselt; der Schlüssel liegt im selben durch Windows-Rechte geschützten Ordner. Programme unter deinem Benutzerkonto können grundsätzlich darauf zugreifen. Heruntergeladene Anhänge liegen unverschlüsselt vor.

An Codex zurückgegebene Mailinhalte werden auch vom verbundenen KI-Dienst verarbeitet. Lies vor der Nutzung die [Datenschutzhinweise](docs/DATENSCHUTZ.md).

## Entwicklungsstand

Version **0.1.7**. Installation, Kontoeinrichtung, Wiederinstallation, Entfernung und Erhalt der Kontodaten wurden in einer frischen Windows-11-Testumgebung geprüft. Die Mailfunktionen wurden zusätzlich mit eigenen Testkonten praktisch erprobt. Ein vollständiger Erstdurchlauf eines weiteren Nutzers auf einem anderen physischen PC steht noch aus.

[Prüfstand und Grenzen](docs/PRUEFSTAND.md) · [Änderungen](CHANGELOG.md)

## Quellcode selbst bauen

Die Pluginversion steht in plugin.json. package.json enthält weiterhin die Versionskennung 2.2.0 der zugrunde liegenden IMAP-Engine und ist für npm-Veröffentlichungen gesperrt.

```powershell
npm ci
npm run lint
npm run build
npm test
npm run build:plugin
```

Der reine Pluginordner entsteht unter **.build/plugin**. Den vollständigen Windows-Installer baust du mit der [Entwickleranleitung](docs/ENTWICKLUNG.md). Für die normale Installation ist kein eigener Bau nötig.

## Herkunft und Lizenz

Grundlage: [imap-mcp-server](https://github.com/nikolausm/imap-mcp-server), Version 2.2.0. Urheber- und Lizenzhinweise bleiben erhalten. [LICENSE](LICENSE) · [Herkunft](NOTICE.md) · [Beiträge](CONTRIBUTING.md) · [Sicherheitshinweise](SECURITY.md)
