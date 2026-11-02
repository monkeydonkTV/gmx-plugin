import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { AccountManager } from '../src/services/account-manager.js';

describe('AccountManager store recovery and atomic replacement', () => {
  let directory: string;
  let previousConfig: string | undefined;
  // The Windows runner's AppContainer temp permits writes but denies rename.
  // Use an owned temporary sibling so this test exercises actual atomic rename.
  const temporaryRoot = path.dirname(fileURLToPath(import.meta.url));
  const account = (name = 'Test') => ({ name, host: 'imap.example.test', port: 993, user: 'test@example.test', password: 'synthetic-password', tls: true });
  const store = () => path.join(directory, 'accounts.json');
  const key = () => path.join(directory, '.key');
  const temporaryFiles = async () => (await fs.readdir(directory)).filter(name => name.startsWith('.accounts-'));

  beforeEach(async () => {
    previousConfig = process.env.IMAP_MCP_CONFIG_DIR;
    directory = await fs.mkdtemp(path.join(temporaryRoot, '.gmx-account-recovery-'));
    process.env.IMAP_MCP_CONFIG_DIR = directory;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (previousConfig === undefined) delete process.env.IMAP_MCP_CONFIG_DIR;
    else process.env.IMAP_MCP_CONFIG_DIR = previousConfig;
    const parent = await fs.realpath(temporaryRoot);
    const target = await fs.realpath(directory);
    if (path.dirname(target) !== parent || !path.basename(target).startsWith('.gmx-account-recovery-')) {
      throw new Error('Refusing to remove a directory outside the test temporary root.');
    }
    await fs.rm(target, { recursive: true, force: true });
  });

  it('preserves an invalid existing key and account file without creating a replacement key', async () => {
    const manager = new AccountManager();
    await manager.addAccount(account());
    const original = await fs.readFile(store());
    await fs.writeFile(key(), 'invalid-existing-key');
    expect(() => new AccountManager()).toThrow(/key is invalid or unreadable/);
    expect(await fs.readFile(key(), 'utf8')).toBe('invalid-existing-key');
    expect(await fs.readFile(store())).toEqual(original);
  });

  it('does not replace an unreadable key path', async () => {
    await fs.mkdir(key());
    expect(() => new AccountManager()).toThrow(/key is invalid or unreadable/);
    expect((await fs.stat(key())).isDirectory()).toBe(true);
    expect(await fs.readdir(directory)).toEqual(['.key']);
  });

  it('fails closed when the key of an encrypted account is missing', async () => {
    const manager = new AccountManager();
    await manager.addAccount(account());
    const original = await fs.readFile(store());
    await fs.unlink(key());
    expect(() => new AccountManager()).toThrow(/key is missing/);
    await expect(fs.stat(key())).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(store())).toEqual(original);
    await expect(manager.addAccount(account('Another'))).rejects.toThrow(/key is missing/);
    expect(await fs.readFile(store())).toEqual(original);
  });

  it('retains the old disk and memory snapshot after a partial temporary-file write', async () => {
    const manager = new AccountManager();
    const created = await manager.addAccount(account());
    const original = await fs.readFile(store());
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      const file = await originalOpen(...args);
      const write = file.writeFile.bind(file);
      vi.spyOn(file, 'writeFile').mockImplementationOnce(async () => {
        await write('partial synthetic private content');
        throw new Error('synthetic private filesystem diagnostic');
      });
      return file;
    });
    await expect(manager.updateAccount(created.id, { name: 'Not committed' })).rejects.toThrow(
      'Account store could not be saved. Existing account data was not replaced.',
    );
    expect((manager as any).accounts.get(created.id).name).toBe('Test');
    expect(await fs.readFile(store())).toEqual(original);
    expect(await temporaryFiles()).toEqual([]);
    expect(new AccountManager().getAccount(created.id)?.password).toBe('synthetic-password');
  });

  it('rolls back failed rename mutations, cleans up, and allows a later write', async () => {
    const manager = new AccountManager();
    const created = await manager.addAccount(account());
    const original = await fs.readFile(store());
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('private diagnostic'), { code: 'EACCES' }));
    await expect(manager.removeAccount(created.id)).rejects.toThrow(/could not be saved/);
    expect((manager as any).accounts.has(created.id)).toBe(true);
    expect(await fs.readFile(store())).toEqual(original);
    expect(await temporaryFiles()).toEqual([]);
    rename.mockRestore();
    await manager.updateAccount(created.id, { name: 'Committed' });
    expect(new AccountManager().getAccount(created.id)?.name).toBe('Committed');
  });

  it('does not overwrite or remove an already-existing temporary sibling', async () => {
    const manager = new AccountManager();
    const created = await manager.addAccount(account());
    const original = await fs.readFile(store());
    const collision = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const existing = path.join(directory, `.accounts-${collision}.tmp`);
    await fs.writeFile(existing, 'another-writer-owned');
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(collision);
    await expect(manager.updateAccount(created.id, { name: 'Not committed' })).rejects.toThrow(/could not be saved/);
    expect(await fs.readFile(existing, 'utf8')).toBe('another-writer-owned');
    expect(await fs.readFile(store())).toEqual(original);
  });

  it('exposes a complete old snapshot until the atomic replacement, then a complete new snapshot', async () => {
    const manager = new AccountManager();
    const created = await manager.addAccount(account());
    const originalRename = fs.rename.bind(fs);
    const observed: string[] = [];
    vi.spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
      observed.push(new AccountManager().getAccount(created.id)!.name);
      const staged = JSON.parse(await fs.readFile(from, 'utf8'));
      expect(staged[0].name).toBe('Updated');
      await originalRename(from, to);
      observed.push(new AccountManager().getAccount(created.id)!.name);
    });
    await manager.updateAccount(created.id, { name: 'Updated' });
    expect(observed).toEqual(['Test', 'Updated']);
    expect(await temporaryFiles()).toEqual([]);
  });

  it('refreshes reads and later mutations after another local manager changes accounts', async () => {
    const running = new AccountManager();
    const setup = new AccountManager();
    const created = await setup.addAccount(account('Externally added'));
    expect(running.getAllAccounts().map(a => a.name)).toEqual(['Externally added']);
    await setup.updateAccount(created.id, { name: 'Externally updated', password: 'updated-synthetic-password' });
    expect(running.getAccountByName('Externally updated')?.password).toBe('updated-synthetic-password');
    await running.addAccount(account('Second'));
    expect(setup.getAllAccounts()).toHaveLength(2);
    await fs.unlink(store());
    expect(running.getAllAccounts()).toEqual([]);
    expect(running.getAccountByName('Externally updated')).toBeUndefined();
    expect(running.getAccount(created.id)).toBeUndefined();
  });

  it.each(['{synthetic private text', '{}', '[null]'])('rejects invalid account data without clearing the last valid in-memory snapshot: %s', async invalid => {
    const manager = new AccountManager();
    const created = await manager.addAccount(account());
    await fs.writeFile(store(), invalid);
    expect(() => manager.getAllAccounts()).toThrow('Account store is invalid. Restore a valid local account store.');
    expect((manager as any).accounts.get(created.id).name).toBe('Test');
    await expect(manager.addAccount(account('Another'))).rejects.toThrow(/Account store is invalid/);
    expect(await fs.readFile(store(), 'utf8')).toBe(invalid);
    expect(await temporaryFiles()).toEqual([]);
  });

  it('does not publish a partially loaded account list with a later invalid credential', async () => {
    const manager = new AccountManager();
    const created = await manager.addAccount(account());
    const saved = JSON.parse(await fs.readFile(store(), 'utf8'));
    const corrupt = [...saved, { ...saved[0], id: 'corrupt', password: 'unencrypted-private-text' }];
    await fs.writeFile(store(), JSON.stringify(corrupt));
    expect(() => manager.getAllAccounts()).toThrow('Stored credentials are invalid or cannot be decrypted with the local key.');
    expect([...((manager as any).accounts as Map<string, unknown>).keys()]).toEqual([created.id]);
  });

  it('rejects duplicate account identifiers instead of silently discarding an entry', async () => {
    const manager = new AccountManager();
    await manager.addAccount(account());
    const saved = JSON.parse(await fs.readFile(store(), 'utf8'));
    await fs.writeFile(store(), JSON.stringify([saved[0], { ...saved[0], name: 'Duplicate' }]));
    expect(() => manager.getAllAccounts()).toThrow(/Account store is invalid/);
  });

  it('fails on account read errors without presenting stale accounts as current', async () => {
    const manager = new AccountManager();
    await manager.addAccount(account());
    await fs.unlink(store());
    await fs.mkdir(store());
    expect(() => manager.getAllAccounts()).toThrow('Account store could not be read. Check the local account store.');
  });

  it('serializes simultaneous mutations in one manager without losing an account', async () => {
    const manager = new AccountManager();
    await Promise.all([manager.addAccount(account('First')), manager.addAccount(account('Second'))]);
    expect(new AccountManager().getAllAccounts().map(a => a.name).sort()).toEqual(['First', 'Second']);
  });
});
