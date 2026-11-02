import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomBytes, timingSafeEqual } from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import open from 'open';
import { AccountManager } from '../services/account-manager.js';
import { ImapService } from '../services/imap-service.js';
import { emailProviders, getProviderByEmail } from '../providers/email-providers.js';
import { ImapAccount } from '../types/index.js';
import { PACKAGE_VERSION } from '../utils/version.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const MIN_TOKEN_LENGTH = 16;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Strip credentials before an account crosses the wizard's HTTP boundary. The
// API also authenticates the owner, but must never return plaintext IMAP/SMTP
// passwords to its browser client. Returns a shallow copy with
// `password` and `smtp.password` removed.
function stripAccountSecrets<T extends Record<string, any>>(account: T): Omit<T, 'password'> {
  const { password: _password, ...rest } = account;
  const safe: Record<string, any> = { ...rest };
  if (safe.smtp && typeof safe.smtp === 'object' && 'password' in safe.smtp) {
    safe.smtp = { ...safe.smtp };
    delete safe.smtp.password;
  }
  return safe as Omit<T, 'password'>;
}

export class WebUIServer {
  private app: express.Application;
  private accountManager: AccountManager;
  private imapService: ImapService;
  private port: number;
  private bindHost: string;
  /** Required on every API request, including shared loopback. */
  private accessToken?: string;
  private accessTokenGenerated = false;

  constructor(
    port: number = 3000,
    deps: { accountManager?: AccountManager; imapService?: ImapService; bindHost?: string; accessToken?: string } = {},
  ) {
    this.app = express();
    this.port = port;
    // Loopback by default: the wizard's API can rewrite account settings, so it
    // must not be reachable from the network unless the user asks for it
    // (IMAP_MCP_BIND / imap-setup --host). Both modes require an owner token.
    this.bindHost = deps.bindHost?.trim() || process.env.IMAP_MCP_BIND?.trim() || '127.0.0.1';
    this.accessToken = deps.accessToken?.trim() || process.env.IMAP_MCP_WIZARD_TOKEN?.trim();
    if (this.accessToken && this.accessToken.length < MIN_TOKEN_LENGTH) {
      throw new Error(`IMAP_MCP_WIZARD_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`);
    }
    if (!this.accessToken) {
      this.accessToken = randomBytes(24).toString('base64url');
      this.accessTokenGenerated = true;
    }
    this.accountManager = deps.accountManager ?? new AccountManager();
    this.imapService = deps.imapService ?? new ImapService();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /** The configured Express application. Exposed for tests. */
  getApp(): express.Application {
    return this.app;
  }

  /** True when bound to something other than a loopback address. */
  isRemote(): boolean {
    return !LOOPBACK_HOSTS.has(this.bindHost.toLowerCase());
  }

  /**
   * URL to open the wizard. It carries a generated access token
   * so the user can paste it into a browser on another machine; a token taken
   * from IMAP_MCP_WIZARD_TOKEN is not echoed, the user already knows it.
   */
  getAccessUrl(forLocalBrowser = false): string {
    const wildcard = this.bindHost === '0.0.0.0' || this.bindHost === '::';
    const host = !this.isRemote() || (wildcard && forLocalBrowser)
      ? 'localhost'
      : wildcard ? os.hostname() : this.bindHost;
    const hostPart = host.includes(':') ? `[${host}]` : host;
    const fragment = this.accessTokenGenerated ? `#token=${this.accessToken}` : '';
    return `http://${hostPart}:${this.port}/${fragment}`;
  }

  private setupMiddleware(): void {
    // Loopback is not authentication: another OS user can reach the same port.
    // Keep the rebinding guard and require the owner's token in both modes.
    this.app.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      next();
    });
    if (!this.isRemote()) {
      this.app.use(this.loopbackOnly());
    }
    this.app.use(this.tokenRequired());
    this.app.use(bodyParser.json());
    this.app.use(express.static(this.resolvePublicDir()));
  }

  private static isLoopbackName(name: string): boolean {
    const n = name.toLowerCase();
    return n === 'localhost' || n === '127.0.0.1' || n === '::1';
  }

  // Guard: allow only loopback Host + (when present) loopback Origin. Non-browser
  // clients (curl, tests) send no Origin and are allowed if the Host is loopback.
  private loopbackOnly(): express.RequestHandler {
    const hostname = (hostHeader: string): string =>
      hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');

    return (req, res, next) => {
      const host = req.headers.host;
      if (!host || !WebUIServer.isLoopbackName(hostname(host))) {
        res.status(403).json({ error: 'Forbidden: the setup API is reachable on loopback only.' });
        return;
      }

      const origin = req.headers.origin;
      if (origin) {
        let originHost: string;
        try {
          originHost = new URL(origin).hostname;
        } catch {
          res.status(403).json({ error: 'Forbidden: invalid Origin.' });
          return;
        }
        if (!WebUIServer.isLoopbackName(originHost)) {
          res.status(403).json({ error: 'Forbidden: cross-origin requests are not allowed.' });
          return;
        }
      }

      next();
    };
  }

  private tokenMatches(candidate: string): boolean {
    const expected = Buffer.from(this.accessToken ?? '');
    const given = Buffer.from(candidate);
    return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
  }

  // Cookies are scoped to a hostname, not a TCP port. Keep the browser token
  // in origin-scoped session storage and require an explicit Authorization
  // header for every API request. Only non-sensitive bootstrap assets are public.
  private tokenRequired(): express.RequestHandler {
    return (req, res, next) => {
      const deny = (status: number, message: string) => {
        if (req.path.startsWith('/api/')) {
          res.status(status).json({ error: message });
        } else {
          res.status(status).type('text/plain').send(message);
        }
      };

      const origin = req.headers.origin;
      if (origin) {
        let requestOrigin: URL | undefined;
        try {
          requestOrigin = new URL(origin);
        } catch {
          // handled below
        }
        if (!requestOrigin || requestOrigin.host !== req.headers.host || requestOrigin.protocol !== `${req.protocol}:`) {
          deny(403, 'Forbidden: cross-origin requests are not allowed.');
          return;
        }
      }

      const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
      if (queryToken !== undefined) {
        if (req.method !== 'GET' || !['/', '/index.html'].includes(req.path) || !this.tokenMatches(queryToken)) {
          deny(401, 'Unauthorized: invalid access token.');
          return;
        }
        // Compatibility for old links only; a fragment is not sent in HTTP
        // requests. The browser captures/removes it before its first API call.
        res.redirect(302, '/#token=' + encodeURIComponent(queryToken));
        return;
      }

      const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (bearer && this.tokenMatches(bearer)) {
        next();
        return;
      }
      if (req.method === 'GET' && ['/', '/index.html', '/js/app.js'].includes(req.path)) {
        next();
        return;
      }

      deny(401, 'Unauthorized: open the wizard with the URL (including #token=…) printed when imap-setup started.');
    };
  }

  // The bundled entrypoint may live at dist/web/server.js (npm run web) or be
  // inlined into dist/setup.js, so __dirname differs. Probe the likely
  // locations and fall back to the current working directory.
  private resolvePublicDir(): string {
    const candidates = [
      path.join(__dirname, '../../public'),
      path.join(__dirname, '../public'),
      path.join(process.cwd(), 'public'),
    ];
    const found = candidates.find(dir => fs.existsSync(path.join(dir, 'index.html')));
    return found ?? candidates[0];
  }

  private setupRoutes(): void {
    // Get all providers
    this.app.get('/api/providers', (req, res) => {
      res.json(emailProviders);
    });

    // Get all accounts
    this.app.get('/api/accounts', (req, res) => {
      try {
        const accounts = this.accountManager.getAllAccounts();
        // Never send credentials to the client — see stripAccountSecrets.
        res.json(accounts.map(stripAccountSecrets));
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch accounts' });
      }
    });

    // Add new account
    this.app.post('/api/accounts', async (req, res) => {
      try {
        const {
          name, email, password, host, port, tls, smtp, imapUsername, sentFolder, defaultBcc,
          imapUsernameFromEnv, imapPasswordFromEnv,
          smtpUsernameFromEnv, smtpPasswordFromEnv,
        } = req.body;

        // Auto-detect provider if not specified
        let imapHost = host;
        let imapPort = port;
        let useTls = tls;

        if (!host && email) {
          const provider = getProviderByEmail(email);
          if (provider) {
            imapHost = provider.imapHost;
            imapPort = provider.imapPort;
            useTls = provider.imapSecurity !== 'STARTTLS';
          }
        }

        // Credentials flagged as env-managed are stored as empty placeholders;
        // the corresponding IMAP_MCP_ACCOUNT_* env var supplies them at runtime.
        const account = await this.accountManager.addAccount({
          name: name || email,
          host: imapHost,
          port: imapPort || 993,
          user: imapUsernameFromEnv ? '' : (imapUsername || email),
          password: imapPasswordFromEnv ? '' : password,
          tls: useTls !== false,
          ...(imapUsername || imapUsernameFromEnv ? { email } : {}),
          smtp: smtp
            ? {
                ...smtp,
                ...(smtpUsernameFromEnv ? { user: '' } : {}),
                ...(smtpPasswordFromEnv ? { password: '' } : {}),
              }
            : undefined,
          ...(typeof sentFolder === 'string' && sentFolder ? { sentFolder } : {}),
          ...(defaultBcc !== undefined && defaultBcc !== '' && !(Array.isArray(defaultBcc) && defaultBcc.length === 0)
            ? { defaultBcc }
            : {}),
        });

        // addAccount returns the plaintext password back; never echo it.
        res.json({ success: true, account: stripAccountSecrets(account) });
      } catch (error) {
        res.status(400).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to add account' 
        });
      }
    });

    // Test connection
    this.app.post('/api/test-connection', async (req, res) => {
      try {
        const { email, password, host, port, tls, imapUsername } = req.body;

        // Create temporary account for testing
        const testAccount: ImapAccount = {
          id: 'test-' + Date.now(),
          name: 'Test',
          host: host || 'imap.gmail.com',
          port: port || 993,
          user: imapUsername || email,
          password,
          tls: tls !== false,
        };
        
        // Try to connect
        await this.imapService.connect(testAccount);
        
        // Get folder list to verify connection works
        const folders = await this.imapService.listFolders(testAccount.id);
        
        // Disconnect
        await this.imapService.disconnect(testAccount.id);
        
        res.json({ 
          success: true, 
          folders: folders.map(f => f.name) 
        });
      } catch (error) {
        res.status(400).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Connection test failed' 
        });
      }
    });

    // Remove account
    this.app.delete('/api/accounts/:id', async (req, res) => {
      try {
        await this.accountManager.removeAccount(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to remove account' 
        });
      }
    });

    // Update account
    this.app.put('/api/accounts/:id', async (req, res) => {
      try {
        const {
          name, email, password, host, port, tls, smtp, saveToSent, imapUsername, sentFolder, defaultBcc,
          imapUsernameFromEnv, imapPasswordFromEnv,
          smtpUsernameFromEnv, smtpPasswordFromEnv,
        } = req.body;

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        // Env-managed username → store an empty placeholder for it.
        if (imapUsernameFromEnv) {
          updates.user = '';
          if (email !== undefined) updates.email = email;
        } else if (imapUsername) {
          updates.user = imapUsername;
          if (email !== undefined) updates.email = email;
        } else if (email !== undefined) {
          updates.user = email;
          updates.email = undefined;
        }
        // Env-managed password → empty placeholder; otherwise only update when sent.
        if (imapPasswordFromEnv) {
          updates.password = '';
        } else if (password !== undefined) {
          updates.password = password;
        }
        if (host !== undefined) updates.host = host;
        if (port !== undefined) updates.port = port;
        if (tls !== undefined) updates.tls = tls;
        if (smtp !== undefined) {
          updates.smtp = {
            ...smtp,
            ...(smtpUsernameFromEnv ? { user: '' } : {}),
            ...(smtpPasswordFromEnv ? { password: '' } : {}),
          };
        }
        if (saveToSent !== undefined) updates.saveToSent = saveToSent;
        // Empty string clears the override (falls back to auto-detection).
        if (typeof sentFolder === 'string') updates.sentFolder = sentFolder === '' ? undefined : sentFolder;
        if (defaultBcc !== undefined) {
          if (defaultBcc === '' || (Array.isArray(defaultBcc) && defaultBcc.length === 0)) {
            updates.defaultBcc = undefined;
          } else {
            updates.defaultBcc = defaultBcc;
          }
        }

        // updateAccount returns a DECRYPTED account (plaintext IMAP + SMTP
        // passwords). A no-op update (e.g. a rename with no password supplied)
        // would otherwise hand every stored secret back over the wire — strip.
        const account = await this.accountManager.updateAccount(req.params.id, updates);
        res.json({ success: true, account: stripAccountSecrets(account) });
      } catch (error) {
        res.status(400).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to update account' 
        });
      }
    });

    // Get single account
    this.app.get('/api/accounts/:id', async (req, res) => {
      try {
        const account = this.accountManager.getAccount(req.params.id);
        if (!account) {
          res.status(404).json({ success: false, error: 'Account not found' });
        } else {
          // Don't send passwords to client — see stripAccountSecrets.
          res.json({ success: true, account: stripAccountSecrets(account) });
        }
      } catch (error) {
        res.status(400).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to get account' 
        });
      }
    });

    // Test existing account connection (without re-entering password)
    this.app.post('/api/accounts/:id/test', async (req, res) => {
      try {
        const account = this.accountManager.getAccount(req.params.id);
        if (!account) {
          res.status(404).json({ success: false, error: 'Account not found' });
          return;
        }

        const result = await this.imapService.testConnection(account);

        res.json({
          success: result.success,
          accountId: account.id,
          accountName: account.name,
          host: account.host,
          folders: result.folders,
          messageCount: result.messageCount,
          error: result.error,
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Test failed',
        });
      }
    });

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', version: PACKAGE_VERSION });
    });
  }

  async start(autoOpen: boolean = true): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.port, this.bindHost, () => {
        // The URL may contain the generated one-time wizard token. Printing it is
        // deliberate (like Jupyter): it is how the user gets into the wizard from
        // another machine, it is not a mailbox credential, and it dies with the
        // process.
        console.log(`🌐 Web UI server running at ${this.getAccessUrl()}`);
        if (this.isRemote()) {
          console.warn(
            `⚠️  The setup wizard is reachable from the network (bind ${this.bindHost}). ` +
            'Access requires the token, but the connection is plain HTTP — use this only on ' +
            'trusted networks, or prefer an SSH tunnel to a loopback-bound wizard.',
          );
        }

        if (autoOpen) {
          // Open browser after a short delay
          setTimeout(() => {
            open(this.getAccessUrl(true));
          }, 1000);
        }
        
        resolve();
      });

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nShutting down web server...');
        server.close(() => {
          process.exit(0);
        });
      });
    });
  }
}

// CLI entry point
// pathToFileURL, not `file://${argv[1]}`: on Windows the latter yields
// "file://C:\...\server.ts" while import.meta.url is "file:///C:/.../server.ts",
// so the two could never match and `npm run web` exited silently (#136).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parseInt(process.env.PORT || '3000');
  const server = new WebUIServer(port);
  server.start();
}
