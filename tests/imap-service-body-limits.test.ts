import { describe, expect, it, vi } from 'vitest';
import { ImapService } from '../src/services/imap-service.js';
import { emailTools } from '../src/tools/email-tools.js';

describe('search/latest body limits with real MIME parsing', () => {
  it.each(['imap_search_emails', 'imap_get_latest_emails'])('%s caps every populated body field', async toolName => {
    for (const bodyFormat of ['markdown', 'auto', 'text', 'html']) {
      const plain = 'A long plain text paragraph. '.repeat(40);
      const html = `<html><body><p>${'HTML body text. '.repeat(60)}</p></body></html>`;
      const source = Buffer.from([
        'From: sender@example.test', 'To: self@example.test', 'Subject: Limit fixture',
        'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="body-test"', '',
        '--body-test', 'Content-Type: text/plain; charset=utf-8', '', plain,
        '--body-test', 'Content-Type: text/html; charset=utf-8', '', html, '--body-test--', '',
      ].join('\r\n'));
      const release = vi.fn();
      const client = {
        mailbox: { exists: 1 },
        getMailboxLock: vi.fn(async () => ({ release })),
        search: vi.fn(async () => [42]),
        fetch: vi.fn(async function* () {
          yield { uid: 42, source, flags: new Set(), internalDate: new Date('2026-01-01'), envelope: {} };
        }),
      };
      const service = new ImapService();
      vi.spyOn(service as any, 'ensureConnected').mockResolvedValue(client);
      const handlers: Record<string, Function> = {};
      emailTools({ registerTool: (name: string, _config: unknown, handler: Function) => { handlers[name] = handler; } } as any,
        service, { resolveAccountId: () => 'fixture' } as any, {} as any);

      const result = await handlers[toolName]({
        folder: 'INBOX', limit: 1, count: 1, includeBody: true, bodyFormat, bodyMaxLength: 37,
      });
      const message = JSON.parse(result.content[0].text).messages[0];
      expect(message.textContent, bodyFormat).toHaveLength(37);
      for (const field of ['textContent', 'markdownContent', 'htmlContent']) {
        if (message[field] !== undefined) expect(message[field].length, `${bodyFormat}/${field}`).toBeLessThanOrEqual(37);
      }
      if (bodyFormat === 'markdown' || bodyFormat === 'auto') expect(message.markdownContent).toHaveLength(37);
      if (bodyFormat === 'html') expect(message.htmlContent).toHaveLength(37);
      else expect(message.htmlContent).toBeUndefined();
      expect(release).toHaveBeenCalledOnce();
    }
  });
});
