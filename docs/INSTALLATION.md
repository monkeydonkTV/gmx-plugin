# Installieren und das eigene GMX-Konto verbinden

## Voraussetzungen

- Windows mit x64-Unterstützung; praktisch geprüft ist Windows 11 x64.
- Codex ist installiert, mit deinem eigenen Konto angemeldet und unterstützt lokale Plugins.
- Du hast dein eigenes GMX-Konto und ein geeignetes App-Passwort.
- In den GMX-E-Mail-Einstellungen ist der Zugriff über POP3/IMAP freigegeben.

Für den Installer brauchst du keine separate Node.js- oder npm-Installation.

## Einrichten

1. Auf der Projektseite unter Releases die Datei **GMX-Plugin-Setup-0.1.7.exe** herunterladen.
2. Die Datei starten und die Installation abschließen. Das Konto-Einrichtungsfenster anschließend öffnen lassen.
3. Warten, bis die Verbindung mit Codex bestätigt wird.
4. Deine vollständige eigene GMX-Adresse und dein App-Passwort lokal eingeben.
5. **Speichern und prüfen** wählen. Die Prüfung bestätigt die Anmeldung und SMTP-Verbindung, verschickt aber keine Mail.
6. Codex neu laden. Beispielsweise „Zeige meine neuesten GMX-E-Mails“ eingeben.

Das Fenster lässt sich später im Windows-Startmenü über **GMX-Konto einrichten** erneut öffnen. Kennwörter gehören ausschließlich in das lokale Einrichtungsfenster.

## Wenn etwas noch nicht funktioniert

**Codex wird nicht gefunden:** Codex installieren, einmal öffnen und anmelden. Danach die GMX-Einrichtung erneut starten oder „Codex erneut verbinden“ wählen.

**Konto gespeichert, Verbindung nicht bestätigt:** Internetverbindung, IMAP-Freigabe und App-Passwort prüfen. Speichern und erfolgreiche Anmeldung sind getrennte Schritte. Ohne Internet kann ein Konto lokal gespeichert werden; die Verbindungsprüfung folgt später.

**Andere GMX-Installation bereits vorhanden:** Eine gleichnamige Verbindung aus einem anderen Ordner wird geschützt. Entferne für eine bewusste Migration zuerst die alte Plugin-Verbindung in Codex und öffne die neue Einrichtung erneut. Kontodaten bleiben getrennt gespeichert.

**Kennwort geändert:** Einrichtung erneut öffnen, das neue App-Passwort speichern und Codex neu laden.

## Entfernen und Aktualisieren

Für eine erneute Installation den passenden Installer starten. Die Kontodaten liegen getrennt von den Programmdateien und bleiben erhalten.

Zum Entfernen Codex und das Einrichtungsfenster schließen, dann in Windows unter „Installierte Apps“ das GMX Plugin deinstallieren. GMX Plugin vor Codex selbst entfernen, weil seine Verbindung über Codex abgemeldet wird. Fehlt Codex schon, dessen Installation zuerst wiederherstellen.

Kontodaten und heruntergeladene eigene Dateien bleiben bei der Deinstallation erhalten. Es werden keine Mails gelöscht.

[Bedienung](../BEDIENUNG.md) · [Datenschutzhinweise](DATENSCHUTZ.md)
