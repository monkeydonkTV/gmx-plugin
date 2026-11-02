import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const temporaryDirectories: string[] = [];
const secret = 'SYNTHETIC-SETUP-SECRET-ä-🔐';
const email = 'fixture@example.test';
const invalidInputMessage = 'E-Mail-Adresse und Kennwort fehlen oder sind ungültig.\n';
const storeMessage = 'GMX-Konto konnte nicht lokal gespeichert werden. Bitte die lokale Ablage prüfen.\n';

afterEach(async () => {
  const root = await realpath(process.cwd());
  await Promise.all(temporaryDirectories.splice(0).map(async dir => {
    const target = await realpath(dir);
    if (dirname(target) !== root || !basename(target).startsWith('.gmx-setup-input-')) {
      throw new Error('Refusing to remove a directory outside the test fixture root.');
    }
    await rm(target, { recursive: true, force: true });
  }));
});

async function temporaryStore(): Promise<string> {
  // Keep atomic-rename tests in the writable workspace; managed Windows hosts
  // can permit temporary-file creation but deny rename in the system temp dir.
  const dir = await mkdtemp(join(await realpath(process.cwd()), '.gmx-setup-input-'));
  temporaryDirectories.push(dir);
  return dir;
}

function setup(input: string, configDir?: string) {
  // Each subprocess is isolated from any real account directory/overrides.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !name.startsWith('IMAP_MCP_')));
  if (configDir !== undefined) env.IMAP_MCP_CONFIG_DIR = configDir;
  return spawnSync(process.execPath, ['--import', 'tsx', resolve('src/gmx-setup.ts')], {
    cwd: process.cwd(), env, input, encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
}

function expectSafeFailure(result: ReturnType<typeof setup>, message: string) {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(message);
  expect(result.stderr).not.toContain(secret);
  expect(result.stderr).not.toContain('SyntaxError');
  expect(result.stderr).not.toContain('TypeError');
  expect(result.stderr).not.toContain(' at ');
}

describe('GMX local setup protects credential input on failures', () => {
  it.each([
    `{"email":"${email}","password":"${secret}" BROKEN}`,
    'null', '[]', '42', JSON.stringify(secret),
    JSON.stringify({ email: secret, password: secret }),
    JSON.stringify({ email, password: null, unrelated: secret }),
    JSON.stringify({ email, password: '', unrelated: secret }),
  ])('returns only a fixed validation error for input case %#', async input => {
    const dir = await temporaryStore();
    expectSafeFailure(setup(input, dir), invalidInputMessage);
    expect(await readdir(dir)).toEqual([]);
  });

  it('fails safely when the setup was not launched with a local store', () => {
    expectSafeFailure(setup(JSON.stringify({ email, password: secret })),
      'Bitte die GMX-Einrichtung über scripts/Einrichten-GMX.ps1 starten.\n');
  });

  it('does not expose credentials, filesystem paths or stack traces on storage failure', async () => {
    const dir = await temporaryStore();
    const blockedPath = join(dir, 'synthetic-private-store-path');
    await writeFile(blockedPath, 'a file cannot be a store directory');
    const result = setup(JSON.stringify({ email, password: secret }), blockedPath);
    expectSafeFailure(result, storeMessage);
    expect(result.stderr).not.toContain(blockedPath);
  });

  it('saves a valid synthetic account and updates it without duplicating the account', async () => {
    const dir = await temporaryStore();
    const first = setup(JSON.stringify({ email, password: secret }), dir);
    expect(first.error).toBeUndefined();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout).toBe('GMX-Konto lokal gespeichert. Es wurde keine Verbindung zum Postfach aufgebaut.\n');
    const stored = await readFile(join(dir, 'accounts.json'), 'utf8');
    expect(stored).not.toContain(secret);
    const accounts = JSON.parse(stored);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: 'GMX', email, user: email, host: 'imap.gmx.net' });
    expect(accounts[0].password).not.toBe(secret);

    const second = setup(JSON.stringify({ email, password: `${secret}-updated` }), dir);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stderr).toBe('');
    const updated = JSON.parse(await readFile(join(dir, 'accounts.json'), 'utf8'));
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe(accounts[0].id);
    expect(updated[0].password).not.toBe(accounts[0].password);
  });

  it('accepts the 16384-character input boundary and rejects one character beyond it', async () => {
    const dir = await temporaryStore();
    const overhead = JSON.stringify({ email, password: '' }).length;
    const exact = JSON.stringify({ email, password: 'x'.repeat(16384 - overhead) });
    expect(exact).toHaveLength(16384);
    const accepted = setup(exact, dir);
    expect(accepted.status, accepted.stderr).toBe(0);
    const before = await readFile(join(dir, 'accounts.json'));

    expectSafeFailure(setup(`${exact} `, dir), 'Die Einrichtungseingabe ist zu groß.\n');
    expect((await readFile(join(dir, 'accounts.json'))).equals(before)).toBe(true);
  });

  it('accepts the UTF-8 byte-order mark emitted by .NET stdin without exposing input', async () => {
    const dir = await temporaryStore();
    const result = setup('\uFEFF' + JSON.stringify({ email, password: secret }), dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain(secret);
    const before = await readFile(join(dir, 'accounts.json'));
    expectSafeFailure(setup('\uFEFF' + `{"password":"${secret}" INVALID`, dir), invalidInputMessage);
    expect((await readFile(join(dir, 'accounts.json'))).equals(before)).toBe(true);
  });
});
