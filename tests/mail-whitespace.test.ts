import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeWhitespace} from '../src/services/html-to-markdown.js';

describe('Untrusted email whitespace processing', () => {
  it('preserves internal spacing and removes trailing spacers and blank-line runs', () => {
    expect(normalizeWhitespace('  Start  middle\t x \t\n \t\n\n\nEnd\t ')).toBe('Start  middle\t x\n\nEnd');
    expect(normalizeWhitespace('A\u00a0B\u200b\nC')).toBe('A B\nC');
  });

  it.each(['whitespace', 'body-tags'])('processes hostile %s without blocking the plugin process', kind => {
    // Run separately with an OS-level deadline: a synchronous regexp hang
    // cannot be interrupted by the test runner's in-process timeout.
    const source = pathToFileURL(resolve('src/services/html-to-markdown.ts')).href;
    const forwarding = pathToFileURL(resolve('src/utils/mail-content.ts')).href;
    const script = kind === 'whitespace' ? `import {normalizeWhitespace} from ${JSON.stringify(source)};
      const input = 'start' + ' '.repeat(200000) + 'end';
      if (normalizeWhitespace(input) !== input) process.exit(2);
      process.stdout.write('complete');` : `import {forwardHtml} from ${JSON.stringify(forwarding)};
      const input = '<body '.repeat(100000) + 'x';
      const result = forwardHtml(input, 'comment');
      if (!result.endsWith(input) || !result.startsWith('<div')) process.exit(2);
      process.stdout.write('complete');`;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    });
    expect(result.error?.message).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('complete');
  }, 10000);
});
