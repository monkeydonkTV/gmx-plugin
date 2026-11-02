import {AccountManager} from './services/account-manager.js';
import {ImapFlow} from 'imapflow';
import {SmtpService} from './services/smtp-service.js';

// Login only: no messages are fetched, changed, or sent. Never echo provider errors.
console.error = () => {};
const timeout = setTimeout(() => {
  process.stdout.write(JSON.stringify({success: false, reason: 'timeout'}) + '\n');
  process.exit(1);
}, 35000);
let imap: ImapFlow | undefined;
const smtp = new SmtpService();
let result = {success: false, imap: false, smtp: false};
try {
  if (!process.env.IMAP_MCP_CONFIG_DIR) throw new Error();
  const account = new AccountManager().getAllAccounts().find(a => a.name === 'GMX');
  if (!account || account.host !== 'imap.gmx.net' || account.port !== 993 || account.tls !== true
      || account.smtp?.host !== 'mail.gmx.net' || account.smtp.port !== 587 || account.smtp.secure !== false) throw new Error();
  imap = new ImapFlow({host: 'imap.gmx.net', port: 993, secure: true,
    tls: {host: 'imap.gmx.net'}, auth: {user: account.user, pass: account.password},
    logger: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 15000});
  await imap.connect();
  result.imap = true;
  await imap.logout();
  result.smtp = await smtp.verifySmtpConnection(account);
  result.success = result.imap && result.smtp;
} catch { /* only fixed status fields below */ }
finally {
  imap?.close();
  smtp.disconnectAll();
  clearTimeout(timeout);
}
process.stdout.write(JSON.stringify(result) + '\n');
process.exitCode = result.success ? 0 : 1;
