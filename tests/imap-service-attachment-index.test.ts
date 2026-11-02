import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ImapService } from '../src/services/imap-service.js';
import { SmtpService } from '../src/services/smtp-service.js';
import { emailTools } from '../src/tools/email-tools.js';

const account: any = { id: 'fixture', user: 'self@example.test', email: 'self@example.test' };
const filename = 'Grüße.bin';
const contents = [Buffer.from('first unique attachment'), Buffer.from('second unique attachment'), Buffer.from('third different name')];
let source: Buffer;
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  source = await new SmtpService().composeRaw(account, {
    from: account.email, to: 'recipient@example.test', subject: 'Duplicate attachment fixture', text: 'Synthetic only',
    attachments: contents.map((content, index) => ({
      filename: index === 2 ? 'other.bin' : filename, content,
      ...(index === 1 ? { cid: 'second@example.test' } : {}),
    })),
  });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

function fixtureService() {
  const service = new ImapService();
  const release = vi.fn();
  vi.spyOn(service as any, 'ensureConnected').mockResolvedValue({
    getMailboxLock: vi.fn(async () => ({ release })),
    fetchOne: vi.fn(async () => ({ source, flags: new Set() })),
  });
  return { service, release };
}

describe('unambiguous attachment selection', () => {
  it('lists stable zero-based indices and selects both identically named attachments', async () => {
    const { service } = fixtureService();
    const message = await service.getEmailContent('fixture', 'INBOX', 7, { bodyFormat: 'text' });
    expect(message.attachments.map(att => [att.attachmentIndex, att.filename])).toEqual([
      [0, filename], [1, filename], [2, 'other.bin'],
    ]);
    for (const index of [0, 1]) {
      const attachment = await service.getAttachmentContent('fixture', 'INBOX', 7, filename, index);
      expect(attachment.content).toEqual(contents[index]);
    }
  });

  it('keeps the legacy first-match behavior without an index', async () => {
    const { service } = fixtureService();
    expect((await service.getAttachmentContent('fixture', 'INBOX', 7, filename)).content).toEqual(contents[0]);
  });

  it.each([filename.normalize('NFD'), '<second@example.test>', 'second@example.test'])
    ('accepts normalized name or matching Content-ID for the selected index: %s', async identifier => {
      const { service } = fixtureService();
      expect((await service.getAttachmentContent('fixture', 'INBOX', 7, identifier, 1)).content).toEqual(contents[1]);
    });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 99])
    ('rejects invalid or missing indices without falling back to the matching filename: %s', async index => {
      const { service } = fixtureService();
      await expect(service.getAttachmentContent('fixture', 'INBOX', 7, filename, index)).rejects.toThrow('index');
    });

  it.each([[0, 'other.bin'], [2, filename], [0, 'second@example.test']])
    ('rejects index/name or Content-ID mismatch (%s, %s) without fallback', async (index, identifier) => {
      const { service, release } = fixtureService();
      await expect(service.getAttachmentContent('fixture', 'INBOX', 7, identifier as string, index as number)).rejects.toThrow('does not match');
      expect(release).toHaveBeenCalledOnce();
    });

  it('passes the index through the download tool and saves both byte-identical copies separately', async () => {
    const { service } = fixtureService();
    const handlers: Record<string, Function> = {};
    const configs: Record<string, any> = {};
    emailTools({ registerTool: (name: string, config: unknown, handler: Function) => {
      handlers[name] = handler;
      configs[name] = config;
    } } as any, service, { resolveAccountId: () => 'fixture' } as any, {} as any);
    const schema = configs.imap_download_attachment.inputSchema.attachmentIndex;
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse(0)).toBe(0);
    for (const invalid of [-1, 0.5, '1', null]) expect(() => schema.parse(invalid)).toThrow();

    const dir = await mkdtemp(join(tmpdir(), 'gmx-attachment-index-'));
    temporaryDirectories.push(dir);
    for (const index of [0, 1]) {
      const savePath = join(dir, `copy-${index}.bin`);
      await handlers.imap_download_attachment({
        folder: 'INBOX', uid: 7, filename, attachmentIndex: index, savePath, extractText: false,
      });
      expect(await readFile(savePath)).toEqual(contents[index]);
    }
  });
});
