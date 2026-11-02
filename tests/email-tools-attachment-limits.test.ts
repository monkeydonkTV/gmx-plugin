import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { normalizeAttachments } from '../src/tools/email-tools.js';
import { MAX_ATTACHMENT_BYTES } from '../src/services/smtp-service.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('attachment normalization limits and base64 validation', () => {
  it('accepts all 14 MiB of valid base64 without exhausting the regexp stack', async () => {
    const bytes = Buffer.alloc(MAX_ATTACHMENT_BYTES, 0xa5);
    const result = await normalizeAttachments([{ filename: 'limit.bin', content: bytes.toString('base64') }]);
    expect(Buffer.isBuffer(result.attachments?.[0].content)).toBe(true);
    expect((result.attachments![0].content as Buffer).equals(bytes)).toBe(true);
    expect(result.diagnostics[0].size).toBe(MAX_ATTACHMENT_BYTES);
  });

  it.each([
    ['TQ==', 'M'], ['TWE=', 'Ma'], ['TWFu', 'Man'], [' \tT W\r\nF u\n', 'Man'],
  ])('accepts valid padding and whitespace: %s', async (content, decoded) => {
    const result = await normalizeAttachments([{ filename: 'test.txt', content }]);
    expect(result.attachments?.[0].content).toEqual(Buffer.from(decoded));
  });

  it.each(['A===', 'AA=A', 'AAAA=', 'AAA', '====', 'AB!D', 'TQ==AAAA', 'TWE===', 'TWFu===='])
    ('rejects malformed base64 without permissive Buffer decoding: %s', async content => {
      await expect(normalizeAttachments([{ filename: 'test.bin', content }])).rejects.toThrow('not valid base64');
    });

  it('rejects a single base64 attachment one byte beyond the limit', async () => {
    const content = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64');
    await expect(normalizeAttachments([{ filename: 'too-large.bin', content }])).rejects.toThrow('14 MiB');
  });

  it('enforces the combined base64 size before SMTP composition', async () => {
    const content = Buffer.alloc(8 * 1024 * 1024).toString('base64');
    await expect(normalizeAttachments([
      { filename: 'first.bin', content }, { filename: 'second.bin', content },
    ])).rejects.toThrow('14 MiB');
  });

  it.each([false, true])('counts file sizes with base64 in either order (file first: %s)', async fileFirst => {
    const dir = await mkdtemp(join(tmpdir(), 'gmx-attachment-limits-'));
    temporaryDirectories.push(dir);
    const path = join(dir, 'file.bin');
    await writeFile(path, Buffer.alloc(8 * 1024 * 1024));
    const file = { filename: 'file.bin', path };
    const encoded = { filename: 'encoded.bin', content: Buffer.alloc(6 * 1024 * 1024).toString('base64') };
    const order = (content: typeof encoded) => fileFirst ? [file, content] : [content, file];

    const accepted = await normalizeAttachments(order(encoded));
    expect(accepted.diagnostics.reduce((sum, entry) => sum + entry.size, 0)).toBe(MAX_ATTACHMENT_BYTES);
    await expect(normalizeAttachments(order({
      ...encoded, content: Buffer.alloc(6 * 1024 * 1024 + 1).toString('base64'),
    }))).rejects.toThrow('14 MiB');
  });

  it('rejects a file larger than the complete attachment allowance during normalization', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gmx-attachment-limits-'));
    temporaryDirectories.push(dir);
    const path = join(dir, 'too-large.bin');
    await writeFile(path, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
    await expect(normalizeAttachments([{ filename: 'too-large.bin', path }])).rejects.toThrow('14 MiB');
  });
});
