# Technische Datenschutzhinweise

Diese Hinweise beschreiben die Datenverarbeitung des lokalen GMX-Plugins.

## Lokale Kontoablage

Die Einrichtung legt dein eigenes Konto unter **%LOCALAPPDATA%/GMXPlugin** an. Adresse, Servereinstellungen und technische Kontokennung stehen dort lesbar in accounts.json. Kennwortfelder sind mit AES-256-CBC verschlüsselt; der zugehörige Schlüssel liegt daneben in .key.

Windows-Zugriffsrechte beschränken den Ordner auf deinen Benutzer, SYSTEM und Administratoren. Der Schlüssel im selben Ordner bietet keine Isolation gegen Programme, die bereits unter deinem Benutzerkonto laufen. Zugangsdaten liegen während der Eingabe und Anmeldung kurz im Arbeitsspeicher.

Heruntergeladene Anhänge werden unverschlüsselt im Unterordner Files gespeichert. Diese Daten werden bei Updates und regulärer Deinstallation beibehalten.

## Verbindungen

Der Pluginprozess verbindet sich für deine Mailaufträge mit imap.gmx.net über TLS und mail.gmx.net über verpflichtendes STARTTLS. Er stellt keinen eigenen Webserver bereit und enthält keine eigene Telemetrie oder Analyseübermittlung an den Projektbetreiber.

Mailinhalte, die du über das Plugin abrufst, werden an Codex und den damit verbundenen KI-Dienst übergeben. Deren Verarbeitung richtet sich nach deinem Konto, den Einstellungen und den Bedingungen des jeweiligen Dienstes. Lokale Plugin-Ausführung bedeutet deshalb nicht, dass angeforderte Mailinhalte ausschließlich auf deinem PC bleiben.

Der Quellbaum enthält aus der ursprünglichen Grundlage außerdem allgemeine IMAP- und Web-Einrichtungsbausteine. Sie sind nicht Teil des ausgelieferten GMX-Installationswegs.

## Weitergabe und Fehlermeldungen

Installer und Quellpaket enthalten kein fertig eingerichtetes Konto. Jede Person gibt ihre eigenen Zugangsdaten lokal ein.

Bitte keine Kontodateien, Schlüssel, Kennwörter, echten E-Mails oder privaten Anhänge in öffentliche GitHub-Issues hochladen. Für Fehlerberichte reichen zunächst Version, Windows-Version, die genaue Aktion und eine um persönliche Angaben bereinigte Meldung. Verwende künstliche Beispieldaten.

Die Datenschutzhinweise von GMX, GitHub und deinem KI-Dienst gelten jeweils zusätzlich für die Nutzung dieser Dienste.
