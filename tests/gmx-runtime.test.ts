import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {assertGmxRuntime} from '../scripts/launch-gmx.mjs';

describe('GMX runtime prerequisites', () => {
  it('rejects unsupported platforms and older or malformed runtimes', () => {
    expect(() => assertGmxRuntime({platform: 'linux', nodeVersion: '24.0.0'})).toThrow('Windows');
    for (const nodeVersion of ['18.20.0', '20.19.0', '22.11.0', 'invalid', '22.12.0-preview']) {
      expect(() => assertGmxRuntime({platform: 'win32', nodeVersion})).toThrow('22.12');
    }
    for (const nodeVersion of ['22.12.0', '22.20.0', '24.0.0']) {
      expect(() => assertGmxRuntime({platform: 'win32', nodeVersion})).not.toThrow();
    }
  });

  it.runIf(process.platform === 'win32')('checks Node before the setup can ask for credentials', () => {
    const setup = resolve('scripts/Einrichten-GMX.ps1').replaceAll("'", "''");
    const code = `function Get-Command { return $null }; function Read-Host { throw 'PROMPT_WAS_REACHED' }; & '${setup}'`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Node.js fehlt');
    expect(result.stderr).not.toContain('PROMPT_WAS_REACHED');
  });

  it.runIf(process.platform === 'win32')('uses the same minimum version in the PowerShell setup', () => {
    const helper = resolve('scripts/Check-Runtime-GMX.ps1').replaceAll("'", "''");
    const code = `. '${helper}'; @('v22.11.0','v22.12.0','v24.0.0','invalid') | ForEach-Object { try { Assert-GmxNodeVersion $_; 'accepted' } catch { 'rejected' } }`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(['rejected', 'accepted', 'accepted', 'rejected']);
  });

  it('refuses a caller-supplied account store in the synthetic smoke helper', () => {
    const result = spawnSync(process.execPath, [resolve('scripts/smoke-gmx.mjs'), 'nonexistent-package', 'do-not-open-this-store'], {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Kontodatenordner werden nicht angenommen');
    expect(result.stderr).not.toContain('ENOENT');
  });
});
