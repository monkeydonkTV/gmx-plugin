import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ImapService } from '../services/imap-service.js';
import { AccountManager } from '../services/account-manager.js';
import { isSystemFlag } from '../types/index.js';
import { z } from 'zod';

// Backward-compatible account selector (accountId stays accepted; accountName
// and the single-account default are additive conveniences).
const accountSelector = {
  accountId: z.string().optional().describe('Account ID (from imap_list_accounts). Optional if accountName is given or only one account is configured.'),
  accountName: z.string().optional().describe('Account name instead of accountId. Optional if accountId is given or only one account is configured.'),
};

export function folderTools(
  server: McpServer,
  imapService: ImapService,
  accountManager: AccountManager
): void {
  // List folders tool
  server.registerTool('imap_list_folders', {
    description: 'List all folders/mailboxes for an account (names, hierarchy delimiter, attributes, RFC 6154 special-use role). Use this first to discover exact folder names before searching, moving, or creating subfolders — folder naming varies by provider (e.g. "Archive" vs "[Gmail]/All Mail" vs "INBOX.Archive"). The specialUse field ("\\\\Sent", "\\\\Drafts", "\\\\Trash", "\\\\Junk", "\\\\Archive") identifies a folder\'s role independent of its localized name (e.g. "Gesendet" is the Sent folder when specialUse is "\\\\Sent").',
    inputSchema: {
      ...accountSelector,
    }
  }, async ({ accountId: rawAccountId, accountName }) => {
    const accountId = accountManager.resolveAccountId(rawAccountId, accountName);
    const folders = await imapService.listFolders(accountId);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          folders: folders.map(folder => ({
            name: folder.name,
            delimiter: folder.delimiter,
            attributes: folder.attributes,
            // RFC 6154 special-use role (language-independent): lets callers
            // find e.g. the Sent folder even when it is named "Gesendet".
            specialUse: folder.specialUse,
            hasChildren: !!folder.children && folder.children.length > 0,
          })),
        }, null, 2)
      }]
    };
  });

  // Get folder status tool
  server.registerTool('imap_folder_status', {
    description: 'Get status information about a folder',
    inputSchema: {
      ...accountSelector,
      folder: z.string().describe('Folder name'),
    }
  }, async ({ accountId: rawAccountId, accountName, folder }) => {
    const accountId = accountManager.resolveAccountId(rawAccountId, accountName);

    // Counts come from STATUS, not SELECT: imapflow's mailboxOpen() reports
    // `exists` but neither RECENT nor UNSEEN. STATUS runs first because RFC 3501
    // discourages issuing it against the currently selected mailbox.
    const status = await imapService.getFolderStatus(accountId, folder);
    const box = await imapService.selectFolder(accountId, folder);

    // imapflow returns flag sets as `Set`, which JSON.stringify renders as {}.
    const toFlagArray = (flags: Iterable<string> | undefined): string[] =>
      Array.from(flags ?? []);
    const flags = toFlagArray(box.flags);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          folder: folder,
          messages: {
            total: status.messages,
            new: status.recent,
            unseen: status.unseen,
          },
          uidvalidity: status.uidValidity,
          uidnext: status.uidNext,
          flags,
          permanentFlags: toFlagArray(box.permanentFlags),
          customKeywords: flags.filter(f => !isSystemFlag(f)),
        }, null, 2)
      }]
    };
  });

  // Create folder tool
  server.registerTool('imap_create_folder', {
    description:
      'Create a new IMAP folder/mailbox. Most servers also create any missing parent folders ' +
      '(e.g. creating "Archives/2026/2026-05" auto-creates "Archives" and "Archives/2026"). ' +
      'Returns success even if the folder already exists.',
    inputSchema: {
      ...accountSelector,
      folder: z.string().describe('Full folder path to create (e.g. "Archives/2026/2026-05" or "INBOX.Archive")'),
    }
  }, async ({ accountId: rawAccountId, accountName, folder }) => {
    const accountId = accountManager.resolveAccountId(rawAccountId, accountName);
    try {
      const result = await imapService.createFolder(accountId, folder);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            folder: result.path,
            created: result.created,
            alreadyExisted: result.alreadyExisted,
            message: result.alreadyExisted
              ? `Folder "${result.path}" already existed`
              : `Folder "${result.path}" created`,
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            folder,
            error: err instanceof Error ? err.message : 'Unknown error',
          }, null, 2)
        }]
      };
    }
  });

  // Get unread count tool
  server.registerTool('imap_get_unread_count', {
    description: 'Count unread (unseen) emails per selectable folder using lightweight STATUS queries, plus a total. Use for "how many unread do I have?" overviews. Pass a folders list to limit scope. If a folder cannot be checked, its count is null and foldersErrored identifies it; complete=false means totalUnread is only the confirmed subtotal, never a complete mailbox count.',
    inputSchema: {
      ...accountSelector,
      folders: z.array(z.string()).optional().describe('List of folders to check (default: all)'),
    }
  }, async ({ accountId: rawAccountId, accountName, folders }) => {
    const accountId = accountManager.resolveAccountId(rawAccountId, accountName);
    const requestedFolders = folders ?? (await imapService.listFolders(accountId))
      .filter(folder => !folder.attributes.some(flag => flag.toLowerCase() === '\\noselect'))
      .map(folder => folder.name);
    const foldersToCheck = [...new Set(requestedFolders)];
    
    const unreadCounts: Record<string, number | null> = Object.create(null);
    const foldersErrored: Array<{folder: string; error: string}> = [];
    let totalUnread = 0;
    
    for (const folderName of foldersToCheck) {
      try {
        const count = (await imapService.getFolderStatus(accountId, folderName)).unseen;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid unread count');
        unreadCounts[folderName] = count;
        totalUnread += count;
      } catch (error) {
        unreadCounts[folderName] = null;
        foldersErrored.push({folder: folderName, error: 'Unread count unavailable. Check the folder and connection.'});
      }
    }
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalUnread,
          byFolder: unreadCounts,
          complete: foldersErrored.length === 0,
          ...(foldersErrored.length ? {foldersErrored} : {}),
        }, null, 2)
      }]
    };
  });
}
