import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {resolve, join, relative, isAbsolute, sep} from 'node:path';
import {mkdtempSync, readFileSync, writeFileSync, realpathSync, lstatSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Deliberately no caller-supplied account directory: real stores must never be
// read, decrypted, or used by this offline synthetic check.
if (process.argv.length !== 3) throw new Error('Aufruf: node scripts/smoke-gmx.mjs PAKETORDNER. Kontodatenordner werden nicht angenommen.');
const root = realpathSync(resolve(process.argv[2]));
const manifest = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8')).mcpServers.gmx_mail;
assert(['node', '${PLUGIN_ROOT}/runtime/node.exe'].includes(manifest.command));
const nodePath = manifest.command === 'node' ? process.execPath : join(root, 'runtime/node.exe');
const expectedVersion = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).version;
const tempRoot = realpathSync(tmpdir());
const dataDir = mkdtempSync(join(tempRoot, 'gmx-synthetic-smoke-'));
const marker = randomUUID();
const markerPath = join(dataDir, '.synthetic-test-only');
writeFileSync(markerPath, marker, {flag: 'wx'});
const email = 'synthetic-gmx@example.test';
const password = 'synthetic-password-ä';
const updatedPassword = 'synthetic-updated-password-ö';
const env = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value !== undefined && !name.startsWith('IMAP_MCP_ACCOUNT_')));
Object.assign(env, {GMX_PLUGIN_DATA_DIR: dataDir, IMAP_MCP_CONFIG_DIR: dataDir, IMAP_DOWNLOAD_DIR: join(dataDir, 'Files')});

function assertOwnedStore() {
  const child = relative(tempRoot, dataDir);
  if (!child.startsWith('gmx-synthetic-smoke-') || child.includes(sep) || isAbsolute(child)
      || lstatSync(dataDir).isSymbolicLink() || realpathSync(dataDir) !== dataDir
      || readFileSync(markerPath, 'utf8') !== marker) throw new Error('Der synthetische Testordner wurde geaendert.');
}

function assertNoPlaintextPasswords(value) {
  if ([password, updatedPassword].some(secret => value.includes(secret))) {
    throw new Error('Ein synthetisches Kennwort ist unverschluesselt in einer Datei oder Ausgabe enthalten.');
  }
}

function configureSyntheticAccount(secret) {
  const setup = spawnSync(nodePath, [join(root, 'dist/gmx-setup.js')], {
    input: JSON.stringify({email, password: secret}), encoding: 'utf8', env, windowsHide: true, timeout: 30000,
  });
  if (setup.error || setup.status !== 0) throw new Error('Die synthetische Kontoeinrichtung ist fehlgeschlagen.');
  assertNoPlaintextPasswords((setup.stdout || '') + (setup.stderr || ''));
}

try {
  configureSyntheticAccount(password);
  assertOwnedStore();
  const store = readFileSync(join(dataDir, 'accounts.json'), 'utf8');
  const entries = JSON.parse(store);
  if (entries.length !== 1 || entries[0].email !== email || entries[0].user !== email || entries[0].name !== 'GMX') {
    throw new Error('Die Kontodatei ist nicht die erwartete kuenstliche Testdatei.');
  }
  assertNoPlaintextPasswords(store);
  const originalId = entries[0].id;
  const originalCiphertext = entries[0].password;
  configureSyntheticAccount(updatedPassword);
  assertOwnedStore();
  const updatedStore = readFileSync(join(dataDir, 'accounts.json'), 'utf8');
  const updatedEntries = JSON.parse(updatedStore);
  if (updatedEntries.length !== 1 || !originalId || updatedEntries[0].id !== originalId
      || updatedEntries[0].email !== email || updatedEntries[0].user !== email
      || updatedEntries[0].name !== 'GMX' || updatedEntries[0].password === originalCiphertext) {
    throw new Error('Die zweite synthetische Einrichtung hat das bestehende Testkonto nicht korrekt aktualisiert.');
  }
  assertNoPlaintextPasswords(updatedStore);
  for (let round = 1; round <= 2; round++) {
    const client = new Client({name: 'gmx-local-check', version: '1.0.0'});
    const transport = new StdioClientTransport({
      command: nodePath, args: manifest.args.map(arg => arg.replaceAll('${PLUGIN_ROOT}', root)),
      cwd: manifest.cwd.replaceAll('${PLUGIN_ROOT}', root), env, stderr: 'pipe',
    });
    let errors = '';
    transport.stderr?.on('data', chunk => { errors += chunk.toString(); });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.version, expectedVersion);
      const pid = transport.pid;
      const {tools} = await client.listTools();
      const names = tools.map(tool => tool.name).sort();
      assert.equal(names.length, 12);
      assert(!names.some(name => /delete|remove|move|add_account|update_account/.test(name)));
      const accounts = await client.callTool({name: 'imap_list_accounts', arguments: {}});
      const result = JSON.parse(accounts.content[0].text);
      assert.equal(result.accounts.length, 1);
      const dry = await client.callTool({name: 'imap_send_email', arguments: {to: 'self@example.test', subject: 'Synthetic offline', text: 'No SMTP', dryRun: true}});
      assert.equal(JSON.parse(dry.content[0].text).dryRun, true);
      const blocked = await client.callTool({name: 'imap_send_email', arguments: {to: 'self@example.test', subject: 'Synthetic blocked', dryRun: true, attachments: [{filename: 'not-allowed.txt', path: join(dataDir, '.key')}]}});
      assert(blocked.isError);
      const forbidden = await client.callTool({name: 'imap_delete_email', arguments: {uid: 1}});
      assert(forbidden.isError);
      assertNoPlaintextPasswords(errors);
      assertNoPlaintextPasswords(JSON.stringify({accounts, dry, blocked, forbidden}));
      await client.close();
      if (pid) assert.throws(() => process.kill(pid, 0));
      console.log(JSON.stringify({round, version: expectedVersion, toolCount: names.length, syntheticAccounts: 1,
        existingAccountUpdated: true, accountIdPreserved: true, plaintextPasswordsAbsent: true,
        forbiddenToolRejected: true, credentialAttachmentBlocked: true, processExited: true}));
    } finally {
      await client.close();
    }
  }
  console.log('Offline-Test bestanden; ausschliesslich selbst erzeugte kuenstliche Kontodaten verwendet.');
} finally {
  assertOwnedStore();
  // Exact newly-created temporary child verified above; never a supplied store.
  rmSync(dataDir, {recursive: true, force: false});
}
