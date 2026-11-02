# Änderungen

Die Versionsnummer des GMX-Plugins steht in plugin.json.

## 0.1.7

- Gleichzeitige IMAP-/SMTP-Verbindungsversuche werden gemeinsam abgewickelt; alte Verbindungen werden sauber geschlossen.
- Ordnerstatus respektiert laufende Postfachzugriffe. Fehlgeschlagene Ungelesen-Abfragen werden als Lücke statt als Null gemeldet.
- Mailtextverarbeitung gegen wiederholte, sehr langsame Suchläufe abgesichert.
- Serverdetails auch in teilweise erfolgreichen Such- und Versandantworten ausgeblendet.
- Anmeldung der optionalen ursprünglichen Web-Einrichtung auf origin-gebundene Bearer-Anfragen umgestellt; sie gehört weiterhin nicht zum GMX-Installer.
- Installer-Test gegen versehentlichen Start auf dem normalen Windows-Profil geschützt; Versionswechsel sowie Windows-Dateirechte zusätzlich geprüft.

## 0.1.6

- Einfacher Windows-Installer pro Benutzer mit privater Node-Laufzeit.
- Grafische Einrichtung des eigenen GMX-Kontos und getrennte Anmeldeprüfung.
- Automatische lokale Codex-Anbindung, Startmenü, erneute Einrichtung und Deinstallation.
- Erststart auf frischem Windows und UTF-8-Datenübergabe verbessert.

Die erste GitHub-Vorbereitung ergänzte öffentliche Dokumentation, einen bereinigten Quellbaum und lokale Build-Ausgabeordner.

## 0.1.5

- Große Anhänge und gemeinsame Größenrechnung verbessert.
- Textbegrenzung und eindeutige Auswahl gleichnamiger Anhänge.
- Atomare Kontospeicherung und geheimnisfreie Fehlerausgaben.
- Feste Paketdateiliste und Prüfung der Laufzeitvoraussetzungen.

## 0.1.4

- Saubere Prozessbeendigung beim Schließen der Verbindung verbessert.
