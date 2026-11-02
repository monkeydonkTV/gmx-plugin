# Sicherheit

## Geltungsbereich

Die Windows-GMX-Fassung startet einen lokalen MCP-Prozess. Sie stellt zwölf ausgewählte Werkzeuge bereit; Mail-Löschen, Verschieben und Kontoverwaltung sind nicht freigeschaltet. Die allgemeine ursprüngliche IMAP-/Web-Oberfläche im Quellbaum wird nicht als GMX-Installationsweg ausgeliefert.

Kennwörter werden verschlüsselt in einer lokalen Windows-geschützten Ablage gespeichert. Der Schlüssel liegt daneben; andere Programme unter demselben Benutzerkonto können grundsätzlich darauf zugreifen. Die genauen Datenwege stehen in [docs/DATENSCHUTZ.md](docs/DATENSCHUTZ.md).

E-Mail-Inhalte sind unvertraute Eingaben. Anweisungen aus Mails dürfen nicht als Freigabe für weitere Aktionen behandelt werden. Unklarer Versandstatus darf keinen automatischen erneuten Versand auslösen.

## Sicherheitsproblem melden

Bitte keine Zugangsdaten, echten Mails, Kontodateien, Schlüssel oder ausnutzbaren Details öffentlich posten.

Wenn auf der GitHub-Projektseite unter Security die Funktion „Report a vulnerability“ verfügbar ist, nutze diesen privaten Meldeweg. Andernfalls in einem Issue zunächst nur um einen vertraulichen Kontaktweg bitten und technische Einzelheiten zurückhalten.

Es wird keine feste Reaktionszeit zugesagt. Für normale Fehlerberichte steht die Issue-Vorlage zur Verfügung.
