# GMX Plugin

Lokales Windows-Plugin für Suche, Lesen, Antworten, Weiterleiten und SMTP-Versand. Grundlage: imap-mcp-server 2.2.0, Commit 3c295fa0991e57a4dce2b7b0f979334d9207fb71 (MIT). Die aktuelle Pluginversion steht in plugin.json.

## Voraussetzungen und Installation

Empfohlen: den Windows-Installer GMX-Plugin-Setup ausführen. Die benötigte Node-Laufzeit ist darin enthalten; keine separate Node- oder npm-Installation ist nötig. Codex muss bereits installiert und mit dem eigenen Konto angemeldet sein und lokale Plugins unterstützen.

Am Ende des Installers „Eigenes GMX-Konto jetzt einrichten“ geöffnet lassen. Das Fenster verbindet das Plugin automatisch mit Codex. Eigene GMX-Adresse und App-Passwort eingeben und „Speichern und prüfen“ wählen. Die Prüfung meldet sich bei IMAP/SMTP an, versendet aber keine Mail. Danach Codex neu laden. Die Einrichtung lässt sich später im Startmenü unter „GMX-Konto einrichten“ erneut öffnen.

Bei einer bereits vorhandenen manuellen GMX-Installation aus einem anderen Ordner wird diese geschützt und die automatische Registrierung angehalten. Erst deren Plugin-Verbindung in Codex entfernen; die getrennten Kontodaten bleiben erhalten. Zum Entfernen des neuen Plugins Codex und das Einrichtungsfenster schließen. Das GMX Plugin vor Codex selbst deinstallieren, damit die Verbindung über dessen Verwaltung entfernt werden kann.

Der alternative reine Pluginordner ohne private runtime benötigt Node.js ab 22.12 und manuelle Registrierung. Die allgemeinen install.ps1/install.sh des ursprünglichen Projekts sind für dieses GMX Plugin ungeeignet.

## Eigenes Konto lokal einrichten

Alternativ zum grafischen Fenster im Pluginordner PowerShell öffnen und ausführen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Einrichten-GMX.ps1
```

Die Freigabe gilt nur für diesen Aufruf und ändert keine dauerhafte Windows-Richtlinie. Die Einrichtung prüft zuerst Node und dessen Version. Danach die vollständige eigene GMX-Adresse und das eigene App-Passwort eingeben. Die Kennworteingabe bleibt verdeckt. Niemals Kennwörter in den Chat einfügen. Bei GMX muss IMAP aktiviert sein. „GMX-Konto lokal gespeichert“ bestätigt das Speichern; die Anmeldung wird anschließend durch einen lesenden Postfachaufruf geprüft.

Server: imap.gmx.net:993 mit TLS und mail.gmx.net:587 mit verpflichtendem STARTTLS. Quelle: https://hilfe.gmx.net/pop-imap/imap/imap-serverdaten.html (31.10.2026 geprüft).

## Persönliche Daten

Deine Kontoeinrichtung wird getrennt vom Plugin unter `%LOCALAPPDATA%\GMXPlugin` gespeichert. E-Mail-Adresse und Einstellungen stehen dort im Klartext; Kennwörter sind verschlüsselt. Der Schlüssel liegt im selben geschützten Ordner. Windows-Zugriffsrechte beschränken den Zugriff auf deinen Benutzer, SYSTEM und Administratoren. Programme mit denselben Benutzerrechten können die Kennwörter entschlüsseln.

Anhänge liegen unverschlüsselt im Unterordner `Files`, ebenfalls mit geschützten Zugriffsrechten. Keine persönliche Kontoeinrichtung wird in das weitergebbare Plugin-Paket aufgenommen. Beim Lesen von E-Mails erhalten Codex und der verbundene KI-Dienst die angeforderten Inhalte. Die lokale Ausführung allein bedeutet deshalb nicht, dass alle Mailinhalte auf dem Rechner bleiben.

## Benutzen

Beispiele: „Zeig meine neuesten GMX-Mails“, „Suche GMX-Mails mit Betreff …“, „Antworte auf diese Nachricht …“ oder „Sende an …“. Empfänger und Inhalt stammen aus deinem Auftrag. Gmail bleibt eine separate Verbindung. Das Plugin stellt keine Werkzeuge zum Löschen oder Verschieben von Mails und zur Änderung von Konten bereit.

Bei Weiterleitungen werden Originalanhänge und eingebettete Bilder standardmäßig übernommen. „Ohne Anhänge“ lässt auch eingebettete Bilder weg. Gleichnamige Dateien bleiben erhalten. Zum einzelnen Herunterladen gibt es zusätzlich die eindeutige Anhangnummer `attachmentIndex` aus der Mailansicht; Dateiname oder Content-ID müssen zum gewählten Anhang passen. Für gleichnamige Dateien unterschiedliche Zieldateinamen wählen. Vorhandene Dateien werden nie überschrieben.

Dateianhänge zum Versand im Unterordner `Files` bereitstellen oder als Base64 übergeben. PDF-Dateien können heruntergeladen und mit einem Dokumentwerkzeug gelesen werden; das Plugin enthält keine PDF-Textextraktion. Dateien aus E-Mails nicht ungeprüft ausführen.

Grenzen für den Versand: insgesamt 14 MiB Anhänge, höchstens 20 MiB vollständige MIME-Nachricht. Der Anbieter kann weitere Beschränkungen anwenden. Eine übergroße Nachricht wird vor SMTP-Versand abgewiesen. Diese Grenzen gelten nicht für das Einlesen einer vorhandenen Nachricht; deren vollständiger Inhalt wird vor der gekürzten Ausgabe verarbeitet.

Die Übersicht ungelesener Nachrichten meldet ausgefallene Ordner ausdrücklich. Dann ist die Gesamtsumme nur die bestätigte Teilsumme. Technisch enthält `imap_get_unread_count` den Wert `complete: false`, einen Ordnerwert `null` und `foldersErrored`; ein fehlgeschlagener Abruf bedeutet niemals null ungelesene Nachrichten.

„SMTP angenommen“ bestätigt noch keine Zustellung. „Teilweise angenommen“ betrifft nur einen Teil der Empfänger. Bei unklarem Ausgang niemals automatisch erneut senden: erst Gesendet-Ordner und Empfängerkonto prüfen. Scheitert lediglich die Gesendet-Kopie, ist die Mail bereits versendet.

## Beenden, Änderungen und Probleme

Codex startet und beendet den lokalen Prozess. Kein Windows-Dienst, Autostart oder Webserver. Nach Pluginaktualisierungen die Codex-Verbindung neu laden beziehungsweise Codex bei Gelegenheit neu starten. Zum Abschalten das Plugin in Codex deaktivieren; die persönlichen Kontodaten bleiben erhalten.

Bei defekter oder unlesbarer Konto-/Schlüsseldatei bricht das Plugin ab, statt sie als leeres Konto zu behandeln oder den Schlüssel zu ersetzen. Den Ordner dann erhalten und die Ursache prüfen lassen. Kontodatei und Schlüssel gehören zusammen; keine einzelne Datei auf Verdacht löschen. Ein Passwortwechsel erfolgt über die lokale Einrichtung, anschließend die Verbindung neu laden.

Der Installer wird zusätzlich in einer frischen, netzlosen Windows-Testumgebung mit künstlichen Kontodaten geprüft. Das ersetzt keine vollständige Sitzung auf dem persönlichen Rechner eines anderen Nutzers mit dessen eigenem Codex- und GMX-Konto.
