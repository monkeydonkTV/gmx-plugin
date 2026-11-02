import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SmtpService} from '../src/services/smtp-service.js';
const state = vi.hoisted(() => ({clients: [] as any[], verify: undefined as undefined | Promise<void>}));
vi.mock('nodemailer', () => ({default: {createTransport: vi.fn(() => {
  const client = {verify: vi.fn(() => state.verify ?? Promise.resolve()), close: vi.fn()};
  state.clients.push(client); return client;
})}}));
const account: any = {id: 'synthetic-account', name: 'GMX', host: 'imap.gmx.net',
  user: 'synthetic@example.test', password: 'synthetic-test-password'};
beforeEach(() => { state.clients.length = 0; state.verify = undefined; });

describe('SMTP connection lifecycle with concurrent requests', () => {
  it('shares one verified transport between simultaneous callers', async () => {
    const smtp = new SmtpService();
    const clients = await Promise.all(Array.from({length: 8}, () => smtp.createTransporter(account)));
    expect(new Set(clients).size).toBe(1);
    expect(state.clients).toHaveLength(1);
    smtp.disconnectAll();
    expect(state.clients[0].close).toHaveBeenCalledOnce();
  });

  it('does not cache a transport whose verification completes after shutdown', async () => {
    let resolve!: () => void;
    state.verify = new Promise<void>(yes => { resolve = yes; });
    const smtp = new SmtpService();
    const creation = smtp.createTransporter(account);
    smtp.disconnectAll(); resolve();
    await expect(creation).rejects.toThrow();
    expect(state.clients[0].close).toHaveBeenCalled();
    state.verify = undefined;
    await smtp.createTransporter(account);
    expect(state.clients).toHaveLength(2);
    smtp.disconnectAll();
  });
});
