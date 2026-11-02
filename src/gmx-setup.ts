import { AccountManager } from './services/account-manager.js';
// JSON and filesystem exceptions can include input excerpts or local paths.
// Only fixed, stage-specific messages may leave this credential-entry process.
let failureMessage = 'GMX-Einrichtung fehlgeschlagen. Bitte die lokale Einrichtung erneut starten.';
try {
  if (!process.env.IMAP_MCP_CONFIG_DIR) {
    failureMessage = 'Bitte die GMX-Einrichtung über scripts/Einrichten-GMX.ps1 starten.';
    throw new Error();
  }
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const part of process.stdin) {
    input += part;
    if (input.length > 16384) {
      failureMessage = 'Die Einrichtungseingabe ist zu groß.';
      throw new Error();
    }
  }
  failureMessage = 'E-Mail-Adresse und Kennwort fehlen oder sind ungültig.';
  // .NET Framework can prefix redirected UTF-8 stdin with a byte-order mark.
  // Accept that transport prefix only; never trim or alter a password value.
  const parsed: unknown = JSON.parse(input.replace(/^\uFEFF/, ''));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
  const { email, password } = parsed as Record<string, unknown>;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || !password) {
    throw new Error();
  }
  failureMessage = 'GMX-Konto konnte nicht lokal gespeichert werden. Bitte die lokale Ablage prüfen.';
  const manager = new AccountManager();
  const existing = manager.getAllAccounts().find(a => a.name === 'GMX');
  const config = {
    name: 'GMX', email, user: email, password, host: 'imap.gmx.net', port: 993, tls: true,
    smtp: { host: 'mail.gmx.net', port: 587, secure: false }, saveToSent: true,
  };
  if (existing) await manager.updateAccount(existing.id, config);
  else await manager.addAccount(config);
  process.stdout.write('GMX-Konto lokal gespeichert. Es wurde keine Verbindung zum Postfach aufgebaut.\n');
} catch {
  process.stderr.write(`${failureMessage}\n`);
  process.exitCode = 1;
}
