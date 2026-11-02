import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {WebUIServer} from '../src/web/server.js';

const token = 'synthetic-wizard-port-bound-token';
const manager = {getAllAccounts: () => [{id: 'synthetic', name: 'Example', password: 'synthetic-secret'}]};
let server: Server;
let base: string;
beforeAll(async () => {
  const wizard = new WebUIServer(0, {accountManager: manager as any, imapService: {} as any, accessToken: token});
  await new Promise<void>(resolve => { server = wizard.getApp().listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

describe('Wizard credentials are explicit request headers, never ambient cookies', () => {
  it('does not authorize account access using a hostname-wide browser cookie', async () => {
    const result = await fetch(`${base}/api/accounts`, {headers: {Cookie: `imap_wizard_token=${token}`}});
    expect(result.status).toBe(401);
    expect(await result.text()).not.toContain('synthetic-secret');
  });
  it('converts an old root login link to a fragment without creating an authentication cookie', async () => {
    const result = await fetch(`${base}/?token=${token}`, {redirect: 'manual'});
    expect(result.status).toBe(302);
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(result.headers.get('location')).toBe(`/#token=${token}`);
  });
  it('allows only the static bootstrap without credentials, while every API stays protected', async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect((await fetch(`${base}/js/app.js`)).status).toBe(200);
    expect((await fetch(`${base}/api/health`)).status).toBe(401);
    const authenticated = await fetch(`${base}/api/accounts`, {headers: {Authorization: `Bearer ${token}`}});
    expect(authenticated.status).toBe(200);
    expect(await authenticated.text()).not.toContain('synthetic-secret');
  });
  it('never accepts a query token to authorize an API call', async () => {
    const result = await fetch(`${base}/api/accounts?token=${token}`, {redirect: 'manual'});
    expect(result.status).toBe(401);
  });
});
