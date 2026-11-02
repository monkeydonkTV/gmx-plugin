import {afterAll, describe, expect, it} from 'vitest';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve, relative, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildPlugin, COPY_FILES, PACKAGE_FILES, SOURCE_ROOT} from '../scripts/build-plugin.mjs';
import {GMX_VERSION} from '../src/utils/gmx-version.js';

const tempParent = realpathSync(tmpdir());
const temporary = mkdtempSync(join(tempParent, 'gmx-package-test-'));
const builder = pathToFileURL(join(SOURCE_ROOT, 'scripts/build-plugin.mjs')).href;
let counter = 0;
function fixture() {
  const source = join(temporary, 'source-' + ++counter);
  mkdirSync(join(source, 'src'), {recursive: true});
  for (const file of COPY_FILES) {
    mkdirSync(join(source, file, '..'), {recursive: true});
    copyFileSync(join(SOURCE_ROOT, file), join(source, file));
  }
  writeFileSync(join(source, 'src/gmx.ts'), "import manifest from '../plugin.json'; console.log(manifest.version);");
  writeFileSync(join(source, 'src/gmx-setup.ts'), 'export const setup = true;');
  writeFileSync(join(source, 'src/gmx-check.ts'), 'export const check = true;');
  writeFileSync(join(source, 'scripts/PRIVATE-NOT-FOR-EXPORT.ps1'), 'synthetic private fixture');
  const target = join(temporary, 'package-' + counter);
  return {sourceRoot: source, targetDir: target};
}
function snapshot(root: string): Record<string, string> {
  return Object.fromEntries(PACKAGE_FILES.filter(file => existsSync(join(root, file))).map(file => [file, readFileSync(join(root, file), 'base64')]));
}
afterAll(() => {
  const child = relative(tempParent, realpathSync(temporary));
  if (!child.startsWith('gmx-package-test-') || child.includes(sep)) throw new Error('Unsafe temporary test path');
  rmSync(temporary, {recursive: true, force: false});
});

describe('GMX distribution builder', () => {
  it('builds independently of cwd and includes only the explicit files and one version', async () => {
    const options = fixture();
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {buildPlugin} from ${JSON.stringify(builder)}; await buildPlugin(${JSON.stringify(options)});`], {
      cwd: temporary, encoding: 'utf8', windowsHide: true, timeout: 30000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(Object.keys(snapshot(options.targetDir)).sort()).toEqual(PACKAGE_FILES);
    expect(existsSync(join(options.targetDir, 'scripts/PRIVATE-NOT-FOR-EXPORT.ps1'))).toBe(false);
    expect(readFileSync(join(options.targetDir, 'scripts/Check-Runtime-GMX.ps1')).subarray(0, 3).toString('hex')).toBe('efbbbf');
    for (const file of ['plugin.json', 'package.json', '.codex-plugin/plugin.json']) {
      expect(JSON.parse(readFileSync(join(options.targetDir, file), 'utf8')).version).toBe(GMX_VERSION);
    }
    const runtime = spawnSync(process.execPath, [join(options.targetDir, 'dist/gmx.js')], {encoding: 'utf8', windowsHide: true});
    expect(runtime.stdout.trim()).toBe(GMX_VERSION);
    const legacy = JSON.parse(readFileSync(join(options.targetDir, '.mcp.json'), 'utf8'));
    expect(legacy.mcpServers.gmx_mail.default_tools_approval_mode).toBe('prompt');
    expect(legacy.mcpServers.gmx_mail.tools.imap_send_email).toBeUndefined();
  });

  it('keeps the old target intact when copying a required file fails', async () => {
    const options = fixture();
    await buildPlugin(options);
    const before = snapshot(options.targetDir);
    rmSync(join(options.sourceRoot, 'LICENSE'));
    await expect(buildPlugin(options)).rejects.toThrow();
    expect(snapshot(options.targetDir)).toEqual(before);
    expect(readdirSync(temporary).some(name => name.startsWith('.' + options.targetDir.split(sep).at(-1) + '-stage-'))).toBe(false);
  });

  it('refuses to replace an existing target containing an unexpected file', async () => {
    const options = fixture();
    mkdirSync(options.targetDir);
    const privatePath = join(options.targetDir, 'unrelated-user-file.txt');
    writeFileSync(privatePath, 'must survive');
    await expect(buildPlugin(options)).rejects.toThrow('Unerwartete Datei');
    expect(readFileSync(privatePath, 'utf8')).toBe('must survive');
    expect(readdirSync(options.targetDir)).toEqual(['unrelated-user-file.txt']);
  });

  it('retains exactly one complete previous package on successive replacements', async () => {
    const options = fixture();
    writeFileSync(join(options.sourceRoot, 'BEDIENUNG.md'), 'first version');
    await buildPlugin(options);
    writeFileSync(join(options.sourceRoot, 'BEDIENUNG.md'), 'second version');
    await buildPlugin(options);
    expect(readFileSync(join(options.targetDir + '.previous', 'BEDIENUNG.md'), 'utf8')).toBe('first version');
    writeFileSync(join(options.sourceRoot, 'BEDIENUNG.md'), 'third version');
    await buildPlugin(options);
    expect(readFileSync(join(options.targetDir, 'BEDIENUNG.md'), 'utf8')).toBe('third version');
    expect(readFileSync(join(options.targetDir + '.previous', 'BEDIENUNG.md'), 'utf8')).toBe('second version');
    expect(Object.keys(snapshot(options.targetDir + '.previous')).sort()).toEqual(PACKAGE_FILES);
  });
});
