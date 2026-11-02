import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { ImapAccount, EmailComposer, SmtpConfig } from '../types/index.js';
import { parseSerializedArray } from '../utils/array-input.js';
import { assertCredentialsResolved } from '../utils/env-credentials.js';
import { randomUUID } from 'crypto';
import { stat, readFile } from 'fs/promises';

// Conservative application limit, not a statement of a provider's tariff limit.
export const MAX_MESSAGE_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 14 * 1024 * 1024;
export class SmtpSendError extends Error {
  constructor(public readonly deliveryStatus: 'not_sent' | 'unknown', public readonly messageId?: string) {
    super(deliveryStatus === 'unknown'
      ? 'SMTP outcome unknown. Check Sent and recipient before retrying; do not automatically resend.'
      : 'Message not sent. Check configuration, recipients and message size.');
  }
}

export class SmtpService {
  private transporters: Map<string, Transporter> = new Map();
  private pendingTransporters = new Map<string, {transporter: Transporter; ready: Promise<Transporter>}>();

  async createTransporter(account: ImapAccount): Promise<Transporter> {
    if (this.transporters.has(account.id)) {
      return this.transporters.get(account.id)!;
    }
    const existing = this.pendingTransporters.get(account.id);
    if (existing) return existing.ready;

    // See ImapService.connect: name the missing variable instead of letting the
    // provider reject a blank credential with a generic auth error.
    assertCredentialsResolved(account, 'smtp');

    const smtpConfig = account.smtp || this.getDefaultSmtpConfig(account);
    const { secure, requireTLS } = this.resolveTlsMode(smtpConfig.port, smtpConfig.secure);

    const transporterOptions = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure,
      requireTLS,
      auth: {
        user: smtpConfig.user || account.user,
        pass: smtpConfig.password || account.password,
      },
      tls: smtpConfig.tls,
    };

    const transporter = nodemailer.createTransport(transporterOptions);
    
    // Share verification across concurrent tool calls. Keep the pending socket
    // reachable by disconnectAll, and never publish it after it was closed.
    const pending = {transporter, ready: Promise.resolve(transporter)};
    pending.ready = Promise.resolve().then(async () => {
      try {
        if (this.pendingTransporters.get(account.id) !== pending) throw new Error('SMTP connection was closed.');
        await transporter.verify();
        if (this.pendingTransporters.get(account.id) !== pending) throw new Error('SMTP connection was closed.');
        this.transporters.set(account.id, transporter);
        return transporter;
      } catch (error) { transporter.close(); throw error; }
    });
    this.pendingTransporters.set(account.id, pending);
    try { return await pending.ready; }
    finally { if (this.pendingTransporters.get(account.id) === pending) this.pendingTransporters.delete(account.id); }
  }

  // Port 465 is implicit TLS (SMTPS); 587/25 are submission ports that upgrade via STARTTLS.
  // A stored `secure: true` on port 587 is almost always a UI mistake — normalize it.
  private resolveTlsMode(port: number, secure: boolean): { secure: boolean; requireTLS: boolean } {
    if (port === 465) return { secure: true, requireTLS: false };
    if (port === 587 || port === 25) return { secure: false, requireTLS: true };
    return { secure, requireTLS: !secure };
  }

  private getDefaultSmtpConfig(account: ImapAccount): SmtpConfig {
    // Common SMTP configurations based on IMAP settings
    const commonProviders: { [key: string]: SmtpConfig } = {
      'imap.gmx.net': { host: 'mail.gmx.net', port: 587, secure: false },
      'imap.gmail.com': {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
      },
      'outlook.office365.com': {
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
      },
      'imap-mail.outlook.com': {
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
      },
      'imap.mail.yahoo.com': {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false,
      },
      'imap.aol.com': {
        host: 'smtp.aol.com',
        port: 587,
        secure: false,
      },
      'imap.fastmail.com': {
        host: 'smtp.fastmail.com',
        port: 587,
        secure: false,
      },
      'imap.zoho.com': {
        host: 'smtp.zoho.com',
        port: 465,
        secure: true,
      },
      'imappro.zoho.com': {
        host: 'smtppro.zoho.com',
        port: 465,
        secure: true,
      },
    };

    const providerConfig = commonProviders[account.host.toLowerCase()];
    if (providerConfig) {
      return providerConfig;
    }

    // Default: submission port 587 with STARTTLS (RFC 8314 recommended).
    // Guess SMTP host: rewrite imap.* to smtp.* if present, otherwise reuse the IMAP host.
    const smtpHost = account.host.startsWith('imap.') || account.host.startsWith('imap-')
      ? account.host.replace(/^imap[.-]/, (m) => m === 'imap.' ? 'smtp.' : 'smtp-')
      : account.host;
    return {
      host: smtpHost,
      port: 587,
      secure: false,
    };
  }

  // Last line of defense against an address list that was serialized into a
  // string somewhere between the caller and here (see utils/array-input.ts).
  // nodemailer would otherwise fold the literal brackets into the first and
  // last address and every recipient bounces, so recover the array instead.
  private static addresses(
    value: string | string[] | undefined,
    field: string
  ): string | string[] | undefined {
    return parseSerializedArray(value, field) as string | string[] | undefined;
  }

  // MimeNode streams 7bit/8bit text content through unchanged, so a bare LF
  // (as opposed to CRLF) in the source string survives into the built MIME
  // buffer. RFC 5322 requires CRLF line breaks in message bodies, and strict
  // servers (e.g. Cyrus) reject the whole APPEND/message with a bare "Command
  // failed" for it -- with no indication that line endings were the problem.
  // Composing (SMTP send) is unaffected since nodemailer/the SMTP stream
  // itself normalizes this, which is why sending worked but saving a Sent/
  // Drafts copy of the exact same multi-line message did not.
  private static normalizeLineEndings(value: string | undefined): string | undefined {
    return value === undefined ? value : value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  }

  private async toMailOptions(account: ImapAccount, email: EmailComposer): Promise<SendMailOptions> {
    let total = 0;
    const attachments = [];
    for (const att of email.attachments || []) {
      let content = att.content;
      if (att.path) {
        const info = await stat(att.path);
        if (!info.isFile() || info.size + total > MAX_ATTACHMENT_BYTES) throw new Error('Attachments exceed the local 14 MiB limit.');
        content = await readFile(att.path);
      }
      total += Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content || '');
      if (total > MAX_ATTACHMENT_BYTES) throw new Error('Attachments exceed the local 14 MiB limit.');
      attachments.push({ ...att, content, path: undefined });
    }
    if (Buffer.byteLength(email.text || '') + Buffer.byteLength(email.html || '') > MAX_MESSAGE_BYTES) throw new Error('Body exceeds local message limit.');
    const references = SmtpService.addresses(email.references, 'references');
    return {
      from: email.from || account.email || account.user,
      disableUrlAccess: true,
      to: SmtpService.addresses(email.to, 'to'),
      cc: SmtpService.addresses(email.cc, 'cc'),
      bcc: SmtpService.addresses(email.bcc, 'bcc'),
      subject: email.subject,
      text: SmtpService.normalizeLineEndings(email.text),
      html: SmtpService.normalizeLineEndings(email.html),
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        path: att.path,
        contentType: att.contentType,
        contentDisposition: att.contentDisposition,
        cid: att.cid,
      })),
      replyTo: email.replyTo,
      inReplyTo: email.inReplyTo,
      references: Array.isArray(references) ? references.join(' ') : references,
    };
  }

  // Build the raw RFC 822 message without sending. Used for drafts and Sent-folder copies.
  // keepBcc is required: MailComposer omits Bcc from the MIME by default (SMTP
  // envelope-only). Without it, imap_save_draft and Sent-folder copies drop
  // Bcc even when resolveBcc / defaultBcc injected recipients into email.bcc.
  async composeRaw(account: ImapAccount, email: EmailComposer): Promise<Buffer> {
    return SmtpService.checkedRaw(await this.toMailOptions(account, email));
  }

  private static async checkedRaw(options: SendMailOptions): Promise<Buffer> {
    const raw = await SmtpService.buildRaw(options);
    if (raw.length > MAX_MESSAGE_BYTES) throw new Error('Message exceeds the local 20 MiB MIME limit. Reduce attachments or body.');
    return raw;
  }

  private static buildRaw(mailOptions: SendMailOptions): Promise<Buffer> {
    const message = new MailComposer(mailOptions).compile();
    message.keepBcc = true;
    return message.build();
  }

  // `<uuid@domain-of-from>`, the same shape nodemailer generates itself.
  private static generateMessageId(from: SendMailOptions['from']): string {
    const address = typeof from === 'string' ? from : (from as { address?: string } | undefined)?.address || '';
    const domain = address.match(/@([^\s<>@]+)>?\s*$/)?.[1] || 'localhost';
    return `<${randomUUID()}@${domain}>`;
  }

  async sendEmail(accountId: string, account: ImapAccount, email: EmailComposer): Promise<{ messageId: string; rawMessage?: Buffer; deliveryStatus: 'accepted' | 'partial'; rejectedCount: number }> {
    let attempted = false;
    let preparedMessageId: string | undefined;
    try {
      const transporter = await this.createTransporter(account);
      const mailOptions = await this.toMailOptions(account, email);
      // Fix Message-ID and Date up front: the Sent copy is composed separately
      // from the SMTP send, and each composition would otherwise generate its
      // own, so the stored copy (and replies to it) wouldn't match what was
      // delivered or the messageId we return (#187).
      mailOptions.messageId = SmtpService.generateMessageId(mailOptions.from);
      preparedMessageId = mailOptions.messageId;
      mailOptions.date = new Date();

      // Build raw message for IMAP Sent folder append
      const rawMessage = await SmtpService.checkedRaw({
          ...mailOptions,
          messageId: mailOptions.messageId,
          date: mailOptions.date,
        });

      attempted = true;
      const info = await transporter.sendMail(mailOptions);
      const rejectedCount = info.rejected?.length || 0;
      return { messageId: info.messageId, rawMessage, deliveryStatus: rejectedCount ? 'partial' : 'accepted', rejectedCount };
    } catch (error) {
      this.disconnect(accountId);
      // A definite SMTP negative response is known; a dropped connection after
      // DATA may have delivered the message. No retries in either branch.
      const code = (error as any)?.responseCode;
      throw new SmtpSendError(attempted && !(code >= 400 && code <= 599) ? 'unknown' : 'not_sent', preparedMessageId);
    }
  }

  async verifySmtpConnection(account: ImapAccount): Promise<boolean> {
    try {
      const transporter = await this.createTransporter(account);
      await transporter.verify();
      return true;
    } catch (error) {
      return false;
    }
  }

  disconnect(accountId: string): void {
    const pending = this.pendingTransporters.get(accountId);
    if (pending) {
      this.pendingTransporters.delete(accountId);
      pending.transporter.close();
    }
    const transporter = this.transporters.get(accountId);
    if (transporter) {
      transporter.close();
      this.transporters.delete(accountId);
    }
  }

  disconnectAll(): void {
    for (const accountId of new Set([...this.transporters.keys(), ...this.pendingTransporters.keys()])) this.disconnect(accountId);
  }
}
