# Prüfstand der Version 0.1.7

Stand: 2. November 2026.

## Aktuelle Prüfung

- TypeScript, Build und 590 automatisierte Tests erfolgreich; kein Fehler, ein vorhandener POSIX-Modusbit-Test unter Windows übersprungen.
- Öffentliche Quellkopie unabhängig installiert, gebaut und mit denselben 590 erfolgreichen Tests geprüft.
- Installer auf frischem Windows 11 Build 26100 ohne Netzwerk, globales Node oder geteiltes Benutzerprofil geprüft.
- Alle 26 installierten Nutzdateien stimmen mit den geprüften Bauinhalten überein.
- Installation, Startmenü, fehlendes Codex, anschließende reale Codex-CLI-Anbindung, künstliche Kontoeinrichtung, zwölf MCP-Werkzeuge und sauberes Prozessende geprüft.
- Windows-Zugriffsrechte auf Nutzer/SYSTEM/Administratoren begrenzt; ein umgeleiteter Dateiordner wurde abgewiesen.
- Erneute Installation und Entfernung bewahren Kontodatei und Schlüssel unverändert.
- Unicode- und BOM-Eingaben, Kontoaktualisierung sowie unveränderte Daten bei fehlerhaftem Einrichtungsaufruf geprüft.
- Getrennte Codex-Testprofile: Versionswechsel, wiederholte Registrierung, fremde Installation geschützt, laufender Prozess blockiert Entfernung, unterbrochene Registrierung und wiederholte Entfernung geprüft.
- npm-Prüfung der Laufzeitbibliotheken: keine bekannten Sicherheitsmeldungen zum Prüfzeitpunkt.

## Korrekturen und zusätzliche Sicherheitsprüfung

Parallele Verbindungsversuche werden zusammengeführt. Ordnerstatus-Abfragen respektieren laufende Postfachzugriffe; fehlgeschlagene Ungelesen-Abfragen erscheinen als Lücke statt als Null. Ungefilterte Servermeldungen werden auch bei Teilerfolgen entfernt.

Zwei langsame Suchläufe bei der Mailtextverarbeitung wurden durch begrenzte lokale Regressionstests nachgewiesen und durch lineare Verarbeitung ersetzt. Die ursprüngliche optionale Web-Einrichtung verwendet jetzt origin-gebundene Bearer-Anfragen statt Cookies; sie gehört nicht zum GMX-Installer.

Eine zusätzliche lokale Codex-Security-Prüfung bestätigte den Fehler bei der Mailtextverarbeitung. Ihr Architektur- und Windows-Teil wurde abgeschlossen. Die abschließende Ausgabe eines weiteren Prüflaufs wurde vom Dienst blockiert; die zusätzliche Sicherheitsprüfung hat deshalb ausdrücklich nur teilweise Abdeckung. Dies ist keine vollständige Sicherheitszertifizierung und kein Nachweis, dass keinerlei weitere Fehler existieren.

## GitHub-Fassung und Download

Der angebotene Installer ist genau die getestete Datei. SHA-256:

```text
814C4572199A8A2D5D48072BCC2961FB3F2CD6A5BB1B348D830C460821B15902
```

Die öffentliche Quellkopie enthält die zugehörigen Laufzeitquellen und den unveränderten Abhängigkeits-Lockfile. Dokumentation, Build-Ausgabeordner und npm-Veröffentlichungsschutz sind an eine eigenständige Projektablage angepasst. Private Entwicklungshistorie, Konten und interne Testbelege sind ausgeschlossen.

Reiner Pluginbau und vollständiger Installerbau aus der öffentlichen Kopie wurden geprüft. Die drei gebündelten Laufzeitdateien gmx.js, gmx-setup.js und gmx-check.js sind bytegleich zu denen des geprüften Download-Installers. Ein eigener vollständiger Installerbau kann durch Compiler-Metadaten einen anderen Hash erhalten; bitgenaue Reproduzierbarkeit der gesamten EXE wird nicht behauptet.

## Grenzen

Mit dem neuen Paket 0.1.7 wurden nach ausdrücklicher Freigabe zwei Testmails ausschließlich zwischen eigenen GMX- und Gmail-Konten versendet. Der Empfang wurde in beiden Zielpostfächern bestätigt; Umlaute und Emoji blieben erhalten. Die GMX-Gesendet-Kopie und parallele Suche, Ordnerstatus- und Ungelesen-Abfragen wurden ebenfalls geprüft. Andere Mailinhalte waren nicht Teil dieses Tests. Antworten und Weiterleitungen mit Anhängen wurden bereits im vorherigen Stand geprüft und sind weiterhin durch automatisierte Tests abgedeckt.

Ein vollständiger Erstdurchlauf eines weiteren Nutzers mit eigenem angemeldetem Codex auf einem anderen physischen PC steht noch aus. Windows 10, ARM und sämtliche Unternehmensrichtlinien wurden nicht umfassend abgenommen. Der Gasttest verwendet die reale Codex-CLI, aber keine angemeldete Codex-Oberfläche. Die lokalen Versandgrenzen begrenzen nicht die vollständige Verarbeitung eingehender Nachrichten.
