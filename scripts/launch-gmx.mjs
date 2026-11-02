import {spawnSync} from 'node:child_process';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function assertGmxRuntime({platform = process.platform, nodeVersion = process.versions.node} = {}) {
  if (platform !== 'win32') throw new Error('Dieses GMX Plugin ist fuer Windows vorgesehen.');
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(nodeVersion);
  if (!version || Number(version[1]) < 22 || (Number(version[1]) === 22 && Number(version[2]) < 12)) {
    throw new Error('GMX Plugin braucht Node.js ab Version 22.12. Bitte Node.js aktualisieren und Codex danach neu starten.');
  }
}

export async function launchGmx() {
  assertGmxRuntime();
  if (!process.env.WINDIR || (!process.env.GMX_PLUGIN_DATA_DIR && !process.env.LOCALAPPDATA)) {
    throw new Error('Der Windows-Benutzerordner konnte nicht ermittelt werden. Bitte Codex neu starten.');
  }
  // The host owns Node directly. PowerShell only prepares ACLs before mailbox use.
  const dataRoot = resolve(process.env.GMX_PLUGIN_DATA_DIR || join(process.env.LOCALAPPDATA, 'GMXPlugin'));
  const check = spawnSync(join(process.env.WINDIR, 'System32/WindowsPowerShell/v1.0/powershell.exe'), [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    fileURLToPath(new URL('./Protect-Only-GMX.ps1', import.meta.url)),
  ], {env: {...process.env, GMX_PLUGIN_DATA_DIR: dataRoot}, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, timeout: 30000});
  if (check.error || check.status !== 0) {
    throw new Error('Die lokale GMX-Ablage konnte nicht geschuetzt werden. Bitte Ordner und Zugriffsrechte pruefen.');
  }
  process.env.IMAP_MCP_CONFIG_DIR = dataRoot;
  process.env.IMAP_DOWNLOAD_DIR = join(dataRoot, 'Files');
  try { await import(new URL('../dist/gmx.js', import.meta.url)); }
  catch { throw new Error('GMX Plugin konnte nicht gestartet werden. Bitte Installation und lokale Kontoeinrichtung pruefen.'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launchGmx().catch(error => { console.error(error.message); process.exitCode = 1; });
}
