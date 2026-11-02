# Beiträge

Fehlerberichte und nachvollziehbare Verbesserungen sind willkommen. Verwende die GitHub-Issues beziehungsweise Pull Requests dieses Projekts. Für grundlegende Änderungen zunächst den gewünschten Umfang beschreiben.

Bitte verwende für Tests künstliche Konten und Mock-Antworten. Echte Mailadressen, Zugangsdaten, Mailinhalte oder private Anhänge gehören nicht in Beiträge oder Testbelege.

Vor einem Änderungsvorschlag ausführen:

```powershell
npm ci
npm run lint
npm run build
npm test
npm run build:plugin
```

Die GMX-Oberfläche bleibt auf die ausgewählten zwölf Werkzeuge beschränkt. Insbesondere keine zusätzlichen Lösch-, Verschiebe- oder Kontoänderungsfunktionen ohne bewusste Projektentscheidung freischalten.

Bauanleitung: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md). Sicherheitsmeldungen: [SECURITY.md](SECURITY.md).
