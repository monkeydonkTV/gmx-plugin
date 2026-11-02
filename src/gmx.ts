import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ImapService } from './services/imap-service.js';
import { SmtpService, SmtpSendError } from './services/smtp-service.js';
import { AccountManager } from './services/account-manager.js';
import { SpamService } from './services/spam-service.js';
import { registerTools } from './tools/index.js';
import { GMX_TOOLS } from './utils/gmx-policy.js';
import { checkGmxFilePath } from './utils/gmx-files.js';
import { createShutdown } from './utils/shutdown.js';
import { GMX_VERSION } from './utils/gmx-version.js';
import { sanitizeGmxResult } from './utils/gmx-result.js';

// No dotenv or web server. Credentials are entered only in the local setup.
if (!process.env.IMAP_MCP_CONFIG_DIR) throw new Error('Start GMX Plugin using scripts/Start-GMX.ps1.');
process.env.IMAP_MCP_ENABLED_TOOLS = GMX_TOOLS.join(',');
process.env.IMAP_MCP_EXCLUSIVE_DOWNLOADS = '1';
const server = new McpServer({ name: 'gmx-plugin', version: GMX_VERSION });
const imap = new ImapService();
const smtp = new SmtpService();
const accounts = new AccountManager();
imap.setAccountManager(accounts);

const guarded = new Proxy(server as any, {
  get(target, prop) {
    if (prop === 'registerTool') return (name: string, config: any, handler: Function) => {
      const sends = ['imap_send_email', 'imap_reply_to_email', 'imap_forward_email'].includes(name);
      if (name === 'imap_download_attachment') {
        config = { ...config, inputSchema: {...config.inputSchema}, description: 'View an image attachment or save an attachment under the protected GMX Files directory. Use optional zero-based attachmentIndex from imap_get_email to select duplicate names; filename must still match that attachment name or Content-ID. Existing files are never overwritten, so use separate savePath values for duplicate names. PDF text extraction is not included; use a document tool after downloading.' };
        delete config.inputSchema.extractText;
      }
      if (name === 'imap_get_email') {
        config={...config,inputSchema:{...config.inputSchema}};
        delete config.inputSchema.includeAttachmentText;
        delete config.inputSchema.maxAttachmentTextChars;
      }
      return target.registerTool(name, { ...config, annotations: {
        readOnlyHint: !sends && !['imap_save_draft', 'imap_download_attachment'].includes(name),
        destructiveHint: false, idempotentHint: !sends && name !== 'imap_save_draft', openWorldHint: true,
      } }, async (...args: any[]) => {
        try {
          if (name === 'imap_download_attachment') args[0].extractText = false;
          if (name === 'imap_get_email') args[0].includeAttachmentText = false;
          for (const att of args[0]?.attachments || []) {
            if (att.path) await checkGmxFilePath(att.path, process.env.IMAP_DOWNLOAD_DIR || '');
          }
          if (name === 'imap_download_attachment' && args[0]?.savePath) await checkGmxFilePath(args[0].savePath, process.env.IMAP_DOWNLOAD_DIR || '', true);
          return sanitizeGmxResult(name, await handler(...args));
        }
        catch (error) {
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({
            success: false,
            ...(error instanceof SmtpSendError ? { deliveryStatus: error.deliveryStatus, messageId: error.messageId, retryAutomatically: false } : {}),
            // Suppress provider errors, which may contain addresses or authentication data.
            error: error instanceof SmtpSendError ? error.message : 'Operation failed. Check local setup, account, folder, UID, file path and size. No automatic retry.',
          }) }] };
        }
      });
    };
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
registerTools(guarded, imap, accounts, smtp, new SpamService());
// Provider error text is not a trusted logging format and may contain private data.
console.error = () => { process.stderr.write('GMX operation diagnostic; provider details suppressed.\n'); };
const finish = createShutdown({
  closeSmtp: () => smtp.disconnectAll(),
  closeImap: () => Promise.all(accounts.getAllAccounts().map(account => imap.disconnect(account.id))),
  closeServer: () => server.close(),
});
process.once('SIGTERM', finish);
process.once('SIGINT', finish);
process.stdin.once('end', finish);
process.stdin.once('close', finish);
process.stdin.once('error', finish);
await server.connect(new StdioServerTransport());
