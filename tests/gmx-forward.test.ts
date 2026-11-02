import { describe, it, expect, vi } from 'vitest';
import { simpleParser } from 'mailparser';
import { ImapService } from '../src/services/imap-service.js';
import { SmtpService } from '../src/services/smtp-service.js';
import { emailTools } from '../src/tools/email-tools.js';
import { prefixedSubject } from '../src/utils/mail-content.js';

const account: any = { id: 'a', name: 'GMX', host: 'imap.gmx.net', user: 'self@example.test', password: 'synthetic', port: 993, tls: true, saveToSent: false };
describe('GMX forwarding real MIME round trip', () => {
  it.each([true, false])('preserves full content and handles attachments=%s in one fetch', async includeAttachments => {
    const smtp = new SmtpService();
    const fixtures = [Buffer.from([0,1,255,7]), Buffer.from('zweite Datei ä'), Buffer.from('image-bytes')];
    const raw = await smtp.composeRaw(account, {
      from: 'Sender <sender@example.test>', to: account.user, subject: 'WG: Prüfung',
      text: 'Original vollständig', html: '<html><body><p>Original vollständig</p><img src="cid:logo"></body></html>',
      attachments: fixtures.map((content, i) => ({ filename: i < 2 ? 'Grüße.bin' : 'logo.png', content,
        contentType: i < 2 ? 'application/octet-stream' : 'image/png',
        ...(i === 2 ? { contentDisposition: 'inline' as const, cid: 'logo' } : {}) })),
    });
    const imap = new ImapService();
    const fetchOne = vi.fn(async () => ({ source: raw, flags: new Set() }));
    const release = vi.fn();
    vi.spyOn(imap as any, 'ensureConnected').mockResolvedValue({ getMailboxLock: async () => ({release}), fetchOne });
    const handlers: Record<string, Function> = {};
    let forwarded: Buffer | undefined;
    const send = vi.spyOn(smtp, 'sendEmail').mockImplementation(async (_id, a, email) => {
      forwarded = await smtp.composeRaw(a, email);
      return { messageId: 'test', rawMessage: forwarded, deliveryStatus: 'accepted', rejectedCount: 0 };
    });
    emailTools({registerTool:(n: string, _c: any, h: Function) => { handlers[n] = h; }} as any,
      imap, {resolveAccountId: () => 'a', getAccount: () => account} as any, smtp);
    const result = await handlers.imap_forward_email({to:'recipient@example.test',uid:5,folder:'INBOX',text:'Kommentar <script>& ä',includeAttachments});
    const parsed = await simpleParser(forwarded!, {keepCidLinks:true});
    expect(parsed.subject).toBe('WG: Prüfung');
    expect(parsed.text).toContain('Original vollständig');
    expect(parsed.html).toContain('Kommentar &lt;script&gt;&amp; ä');
    expect(parsed.html).toContain('Original vollständig');
    expect(parsed.html).toContain('cid:logo');
    expect(parsed.attachments).toHaveLength(includeAttachments ? 3 : 0);
    if (includeAttachments) {
      expect(parsed.attachments.map(a=>a.content.toString('base64')).sort()).toEqual(fixtures.map(b=>b.toString('base64')).sort());
      expect(parsed.attachments.filter(a=>a.filename === 'Grüße.bin')).toHaveLength(2);
      expect(parsed.attachments.find(a=>a.filename === 'logo.png')?.contentId).toBe('<logo>');
    }
    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content[0].text).deliveryStatus).toBe('accepted');
  });
  it.each(['RE: Hallo','AW: Hallo','re:Hallo',' aw : Hallo'])('does not duplicate reply prefix %s', subject => {
    expect(prefixedSubject(subject,'reply')).toBe(subject);
  });
  it.each(['FW: Hallo','WG: Hallo','fwd:Hallo'])('does not duplicate forward prefix %s', subject => {
    expect(prefixedSubject(subject,'forward')).toBe(subject);
  });
  it('adds the appropriate prefix to a new subject', () => {
    expect(prefixedSubject('Hallo','reply')).toBe('Re: Hallo');
    expect(prefixedSubject('Hallo','forward')).toBe('Fwd: Hallo');
  });
});
