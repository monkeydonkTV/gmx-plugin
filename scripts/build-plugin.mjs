import * as esbuild from 'esbuild';
import {mkdir, copyFile, writeFile, readFile, readdir, lstat, realpath, mkdtemp, rename, rm} from 'node:fs/promises';
import {resolve, join, dirname, basename, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const COPY_FILES = [
  'plugin.json', 'mcp.json', 'LICENSE', 'BEDIENUNG.md',
  'scripts/Einrichten-GMX.ps1', 'scripts/Check-Runtime-GMX.ps1',
  'scripts/Store-GMX.ps1', 'scripts/Protect-Only-GMX.ps1',
  'scripts/Start-GMX.ps1', 'scripts/launch-gmx.mjs',
  'skills/gmx-postfach/SKILL.md',
];
export const PACKAGE_FILES = [...COPY_FILES, 'dist/gmx.js', 'dist/gmx-setup.js', 'dist/gmx-check.js',
  'THIRD-PARTY-NOTICES.txt', 'package.json', '.codex-plugin/plugin.json', '.mcp.json'].sort();
const allowedFiles = new Set(PACKAGE_FILES);
const allowedDirectories = new Set(PACKAGE_FILES.flatMap(file => {
  const parts = file.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}));

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Never traverse links or replace an output tree containing unknown user files.
async function inspectPackageTree(root, exact = false) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Paketpfad ist kein normales Verzeichnis.');
  const found = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const name = prefix + entry.name;
      const info = await lstat(join(directory, entry.name));
      if (info.isSymbolicLink()) throw new Error('Verknuepfung im Paketordner nicht erlaubt: ' + name);
      if (info.isDirectory() && allowedDirectories.has(name)) await walk(join(directory, entry.name), name + '/');
      else if (info.isFile() && allowedFiles.has(name)) found.push(name);
      else throw new Error('Unerwartete Datei im Paketordner; nichts ersetzt: ' + name);
    }
  }
  await walk(root);
  if (exact && JSON.stringify(found.sort()) !== JSON.stringify(PACKAGE_FILES)) throw new Error('Das Paket ist unvollstaendig.');
}

function assertDirectChild(path, parent) {
  const child = relative(parent, resolve(path));
  if (!child || isAbsolute(child) || child === '..' || child.startsWith('..' + sep) || child.includes(sep)) {
    throw new Error('Unsicherer Paket-Zielpfad.');
  }
}

async function removeOwnedTree(path, parent, exact = false) {
  assertDirectChild(path, parent);
  await inspectPackageTree(path, exact);
  // Parent and target are resolved and all descendants were checked for links.
  if (await realpath(dirname(path)) !== parent) throw new Error('Paket-Elternpfad wurde geaendert.');
  await rm(path, {recursive: true, force: false});
}

export async function buildPlugin({targetDir = resolve(SOURCE_ROOT, '.build/plugin'), sourceRoot = SOURCE_ROOT} = {}) {
  sourceRoot = await realpath(sourceRoot);
  const requestedTarget = resolve(targetDir);
  await mkdir(dirname(requestedTarget), {recursive: true});
  const parent = await realpath(dirname(requestedTarget));
  const target = join(parent, basename(requestedTarget));
  const previous = target + '.previous';
  assertDirectChild(target, parent);
  assertDirectChild(previous, parent);
  const fromSource = relative(target, sourceRoot);
  if (!fromSource || (!fromSource.startsWith('..' + sep) && fromSource !== '..' && !isAbsolute(fromSource))) {
    throw new Error('Das Auslieferungsziel darf keinen Quellcodeordner ersetzen.');
  }
  for (const path of [target, previous]) if (await exists(path)) await inspectPackageTree(path);
  const portable = JSON.parse(await readFile(join(sourceRoot, 'plugin.json'), 'utf8'));
  if (portable.name !== 'gmx-plugin' || !/^\d+\.\d+\.\d+$/.test(portable.version)) throw new Error('Ungueltiges Pluginmanifest.');
  const stage = await mkdtemp(join(parent, '.' + basename(target) + '-stage-'));
  assertDirectChild(stage, parent);
  try {
    await mkdir(join(stage, 'dist'));
    const built = await esbuild.build({
      absWorkingDir: sourceRoot, entryPoints: ['src/gmx.ts', 'src/gmx-setup.ts', 'src/gmx-check.ts'], outdir: join(stage, 'dist'),
      bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['pdf-parse'],
      banner: {js: "import { createRequire as _gmxCreateRequire } from 'node:module'; const require = _gmxCreateRequire(import.meta.url);"},
      metafile: true,
    });
    const packageRoots = new Set();
    for (const input of Object.keys(built.metafile.inputs)) {
      let folder = dirname(resolve(sourceRoot, input));
      while (folder.split(sep).includes('node_modules')) {
        try { await readFile(join(folder, 'package.json')); packageRoots.add(folder); break; } catch {}
        folder = dirname(folder);
      }
    }
    let licenses = 'Third-party notices for bundled runtime dependencies\n\n';
    for (const folder of [...packageRoots].sort()) {
      const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
      licenses += `\n=== ${pkg.name} ${pkg.version}; license: ${pkg.license || 'see notice'} ===\n`;
      for (const name of await readdir(folder)) if (/^(license|copying|notice)(\.|$)/i.test(name)) {
        try { licenses += await readFile(join(folder, name), 'utf8') + '\n'; } catch {}
      }
    }
    await writeFile(join(stage, 'THIRD-PARTY-NOTICES.txt'), licenses);
    for (const file of COPY_FILES) {
      const source = join(sourceRoot, file);
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Ungueltige Quelldatei: ' + file);
      await mkdir(dirname(join(stage, file)), {recursive: true});
      if (file.endsWith('.ps1')) await writeFile(join(stage, file), '\ufeff' + (await readFile(source, 'utf8')).replace(/^\ufeff/, ''));
      else await copyFile(source, join(stage, file));
    }
    await writeFile(join(stage, 'package.json'), JSON.stringify({name: portable.name, version: portable.version, type: 'module', engines: {node: '>=22.12.0'}}, null, 2));
    await mkdir(join(stage, '.codex-plugin'));
    await writeFile(join(stage, '.codex-plugin/plugin.json'), JSON.stringify({
      name: portable.name, version: portable.version, description: portable.description, license: portable.license,
      skills: './skills/', mcpServers: './.mcp.json', interface: portable.extensions['com.openai'].interface,
    }, null, 2));
    const legacy = {...JSON.parse(await readFile(join(stage, 'mcp.json'), 'utf8')).mcpServers.gmx_mail};
    delete legacy.type;
    legacy.default_tools_approval_mode = 'prompt';
    legacy.tools = Object.fromEntries(['imap_list_accounts', 'imap_search_emails', 'imap_get_email', 'imap_get_latest_emails',
      'imap_list_folders', 'imap_folder_status', 'imap_get_unread_count'].map(name => [name, {approval_mode: 'approve'}]));
    await writeFile(join(stage, '.mcp.json'), JSON.stringify({mcpServers: {gmx_mail: legacy}}, null, 2));
    await inspectPackageTree(stage, true);
    // Recheck immediately before any rename/delete; keep one complete previous package.
    const hadTarget = await exists(target);
    if (hadTarget) await inspectPackageTree(target);
    if (await exists(previous)) await removeOwnedTree(previous, parent);
    if (hadTarget) { assertDirectChild(target, parent); await rename(target, previous); }
    try { await rename(stage, target); }
    catch (error) { if (hadTarget) await rename(previous, target); throw error; }
    return {target, previous: hadTarget ? previous : null, version: portable.version, files: PACKAGE_FILES.length};
  } catch (error) {
    if (await exists(stage)) await removeOwnedTree(stage, parent);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output')) {
    console.error('Aufruf: node scripts/build-plugin.mjs [--output PAKETORDNER]');
    process.exitCode = 1;
  } else {
    buildPlugin(args.length ? {targetDir: resolve(args[1])} : {}).then(result => console.log(JSON.stringify(result)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
