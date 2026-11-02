import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { WebUIServer } from '../src/web/server.js';

// The wizard binds to loopback by default. With --host / IMAP_MCP_BIND it can
// be reached from another machine; Host is then no longer a usable signal, so
// every request must carry an access token instead.

const TOKEN = 'test-token-0123456789';

const fakeAccountManager = {
  getAllAccounts: () => [{ id: 'a1', name: 'Work', host: 'imap.example.com', port: 993, user: 'u', password: 'secret', tls: true }],
};

function listen(wizard: WebUIServer): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = wizard.getApp().listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

function request(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; text: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

const deps = { accountManager: fakeAccountManager as any, imapService: {} as any };

describe('web wizard bind address', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('binds to 127.0.0.1 by default', async () => {
    const wizard = new WebUIServer(4321, deps);
    const listenSpy = vi.spyOn(wizard.getApp(), 'listen').mockImplementation(((...args: any[]) => {
      args[args.length - 1]();
      return { close: vi.fn() } as any;
    }) as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await wizard.start(false);

    expect(listenSpy.mock.calls[0][0]).toBe(4321);
    expect(listenSpy.mock.calls[0][1]).toBe('127.0.0.1');
    expect(wizard.isRemote()).toBe(false);
    expect(wizard.getAccessUrl()).toMatch(/^http:\/\/localhost:4321\/#token=[A-Za-z0-9_-]{32}$/);
  });

  it('takes the bind address from IMAP_MCP_BIND and generates a token', () => {
    vi.stubEnv('IMAP_MCP_BIND', '0.0.0.0');
    const wizard = new WebUIServer(4321, deps);

    expect(wizard.isRemote()).toBe(true);
    expect(wizard.getAccessUrl()).toMatch(/^http:\/\/.+:4321\/#token=[A-Za-z0-9_-]{32}$/);
    expect(wizard.getAccessUrl(true)).toMatch(/^http:\/\/localhost:4321\/#token=/);
  });

  it('does not echo a token supplied via IMAP_MCP_WIZARD_TOKEN', () => {
    vi.stubEnv('IMAP_MCP_WIZARD_TOKEN', TOKEN);
    const wizard = new WebUIServer(4321, { ...deps, bindHost: '192.168.1.5' });

    expect(wizard.getAccessUrl()).toBe('http://192.168.1.5:4321/');
  });

  it('refuses a fixed token that is too short for a network-facing wizard', () => {
    vi.stubEnv('IMAP_MCP_WIZARD_TOKEN', 'short');
    expect(() => new WebUIServer(4321, { ...deps, bindHost: '0.0.0.0' })).toThrow(/at least 16/);
  });

  it('treats ::1 and localhost as loopback', () => {
    expect(new WebUIServer(1, { ...deps, bindHost: '::1' }).isRemote()).toBe(false);
    expect(new WebUIServer(1, { ...deps, bindHost: 'localhost' }).isRemote()).toBe(false);
  });
});

describe('web wizard in loopback mode', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await listen(new WebUIServer(0, { ...deps, accessToken: TOKEN })));
  });
  afterAll(() => server?.close());

  it('still rejects a non-loopback Host', async () => {
    const res = await request(port, '/api/accounts', { Host: 'mail-server:3000' });
    expect(res.status).toBe(403);
  });

  it('rejects loopback requests without a token', async () => {
    const res = await request(port, '/api/accounts', { Host: `localhost:${port}` });
    expect(res.status).toBe(401);
  });

  it('accepts the owner token on loopback and refuses a different local origin', async () => {
    expect((await request(port, '/api/accounts', { Authorization: `Bearer ${TOKEN}` })).status).toBe(200);
    expect((await request(port, '/api/accounts', { Authorization: `Bearer ${TOKEN}`, Origin: 'http://localhost:9999' })).status).toBe(403);
    expect((await request(port, '/api/accounts', { Authorization: `Bearer ${TOKEN}`, Origin: `https://127.0.0.1:${port}` })).status).toBe(403);
  });

  it('migrates legacy login URLs to a fragment without an ambient authentication cookie', async () => {
    const res = await request(port, `/?token=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/#token=${TOKEN}`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((await request(port, '/api/accounts', { Cookie: `imap_wizard_token=${TOKEN}` })).status).toBe(401);
  });
});

describe('loopback account administration authentication', () => {
  it('rejects enumeration, host changes and stored-password tests before reaching services', async () => {
    const manager = { getAllAccounts: vi.fn(), getAccount: vi.fn(), updateAccount: vi.fn() };
    const imap = { testConnection: vi.fn() };
    const {server, port} = await listen(new WebUIServer(0, { accountManager: manager as any, imapService: imap as any, accessToken: TOKEN }));
    try {
      for (const [method, path] of [['GET','/api/accounts'],['PUT','/api/accounts/a1'],['POST','/api/accounts/a1/test']]) {
        const status = await new Promise<number>((resolve,reject) => {
          const req = http.request({host:'127.0.0.1',port,method,path,headers:{'content-type':'application/json'}}, res => {
            res.resume();res.on('end',()=>resolve(res.statusCode!));
          });
          req.on('error',reject);
          req.end(method === 'PUT' ? JSON.stringify({host:'attacker.example.test',port:993,tls:true}) : undefined);
        });
        expect(status).toBe(401);
      }
      expect(manager.getAllAccounts).not.toHaveBeenCalled();
      expect(manager.getAccount).not.toHaveBeenCalled();
      expect(manager.updateAccount).not.toHaveBeenCalled();
      expect(imap.testConnection).not.toHaveBeenCalled();
    } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
  });
});

describe('web wizard in remote mode', () => {
  let server: Server;
  let port: number;
  const host = 'mail-server:3000';

  beforeAll(async () => {
    ({ server, port } = await listen(new WebUIServer(0, { ...deps, bindHost: '0.0.0.0', accessToken: TOKEN })));
  });
  afterAll(() => server?.close());

  it('rejects API requests without a token', async () => {
    const res = await request(port, '/api/accounts', { Host: host });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.text).error).toMatch(/token/);
  });

  it('serves the non-sensitive bootstrap page without a token', async () => {
    const res = await request(port, '/', { Host: host });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('secret');
  });

  it('rejects a wrong token', async () => {
    expect((await request(port, '/?token=wrong', { Host: host })).status).toBe(401);
    expect((await request(port, '/api/accounts', { Host: host, Authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await request(port, '/api/accounts', { Host: host, Cookie: 'imap_wizard_token=wrong' })).status).toBe(401);
  });

  it('moves an old query token to a browser-only fragment without setting a cookie', async () => {
    const res = await request(port, `/?token=${TOKEN}`, { Host: host });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/#token=${TOKEN}`);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('never redirects off-site after the token exchange', async () => {
    const res = await request(port, `/x/..//evil.example/?token=${TOKEN}`, { Host: host });
    expect(res.status).toBe(401);
    expect(res.headers.location).toBeUndefined();
  });

  it('answers a malformed cookie with 401, not a 500 stack trace', async () => {
    const res = await request(port, '/api/accounts', { Host: host, Cookie: 'imap_wizard_token=%E0' });
    expect(res.status).toBe(401);
  });

  it('rejects the legacy cookie even on a non-loopback Host', async () => {
    const res = await request(port, '/api/accounts', { Host: host, Cookie: `other=1; imap_wizard_token=${TOKEN}` });
    expect(res.status).toBe(401);
    expect(res.text).not.toContain('secret');
  });

  it('accepts a bearer token for scripted use', async () => {
    const res = await request(port, '/api/accounts', { Host: host, Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
  });

  it('refuses cross-origin requests even with a valid token', async () => {
    const res = await request(port, '/api/accounts', {
      Host: host,
      Origin: 'http://evil.example',
      Cookie: `imap_wizard_token=${TOKEN}`,
    });
    expect(res.status).toBe(403);
  });

  it('allows same-origin requests from the wizard page', async () => {
    const res = await request(port, '/api/accounts', {
      Host: host,
      Origin: `http://${host}`,
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(res.status).toBe(200);
  });
});
