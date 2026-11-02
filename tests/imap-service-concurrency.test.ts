import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ImapService} from '../src/services/imap-service.js';
import type {ImapAccount} from '../src/types/index.js';

const state = vi.hoisted(() => ({clients: [] as any[], nextConnect: undefined as undefined | Promise<void>}));
vi.mock('imapflow', () => ({ImapFlow: class {
  usable = true;
  handlers = new Map<string, Function>();
  connect = vi.fn(() => state.nextConnect ?? Promise.resolve());
  logout = vi.fn(async () => { this.usable = false; });
  close = vi.fn(() => { this.usable = false; });
  list = vi.fn(async () => [{path: 'INBOX', delimiter: '/', flags: []}]);
  constructor() { state.clients.push(this); }
  on(name: string, handler: Function) { this.handlers.set(name, handler); }
}}));

const account: ImapAccount = {id: 'synthetic-account', name: 'GMX', host: 'imap.example.test',
  port: 993, tls: true, user: 'synthetic@example.test', password: 'synthetic-test-password'};
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function service() {
  const result = new ImapService();
  result.setAccountManager({getAccount: () => account} as any);
  return result;
}
beforeEach(() => { state.clients.length = 0; state.nextConnect = undefined; });

describe('IMAP connection lifecycle with concurrent tool calls', () => {
  it('shares the first connection across simultaneous reads', async () => {
    const imap = service(); const gate = deferred(); state.nextConnect = gate.promise;
    const reads = Array.from({length: 8}, () => imap.listFolders(account.id));
    gate.resolve();
    expect(await Promise.all(reads)).toHaveLength(8);
    expect(state.clients).toHaveLength(1);
    expect(state.clients[0].connect).toHaveBeenCalledOnce();
    await imap.disconnect(account.id);
    expect(state.clients[0].logout).toHaveBeenCalledOnce();
  });

  it('shares a reconnect and ignores a late event from the replaced client', async () => {
    const imap = service(); await imap.connect(account);
    const old = state.clients[0]; old.usable = false;
    const gate = deferred(); state.nextConnect = gate.promise;
    const reads = Array.from({length: 8}, () => imap.listFolders(account.id));
    gate.resolve(); await Promise.all(reads);
    expect(state.clients).toHaveLength(2);
    old.handlers.get('close')();
    await imap.listFolders(account.id);
    expect(state.clients).toHaveLength(2);
    expect(state.clients[1].list).toHaveBeenCalledTimes(9);
  });

  it('closes failed connection attempts and permits a clean subsequent attempt', async () => {
    const imap = service(); const gate = deferred(); state.nextConnect = gate.promise;
    const read = imap.listFolders(account.id);
    gate.reject(new Error('synthetic connection failure'));
    await expect(read).rejects.toThrow('synthetic connection failure');
    expect(state.clients[0].close).toHaveBeenCalledOnce();
    state.nextConnect = undefined;
    await expect(imap.listFolders(account.id)).resolves.toHaveLength(1);
    expect(state.clients).toHaveLength(2);
  });

  it('waits for an in-flight connection before disconnecting it', async () => {
    const imap = service(); const gate = deferred(); state.nextConnect = gate.promise;
    const connecting = imap.connect(account);
    const closing = imap.disconnect(account.id);
    gate.resolve(); await Promise.all([connecting, closing]);
    expect(state.clients[0].logout).toHaveBeenCalledOnce();
  });
});
