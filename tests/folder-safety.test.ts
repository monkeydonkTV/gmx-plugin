import {describe, expect, it, vi} from 'vitest';
import {folderTools} from '../src/tools/folder-tools.js';
import {ImapService} from '../src/services/imap-service.js';

function unreadTool(service: any) {
  let handler!: Function;
  folderTools({registerTool(name: string, _config: unknown, fn: Function) {
    if (name === 'imap_get_unread_count') handler = fn;
  }} as any, service, {resolveAccountId: () => 'synthetic-account'} as any);
  return async (args: any = {}) => JSON.parse((await handler(args)).content[0].text);
}

describe('Folder operations under partial failure and concurrent reads', () => {
  it('waits for the mailbox lock instead of changing another read\'s selected folder', async () => {
    let unlock!: () => void;
    const blocked = new Promise<void>(resolve => { unlock = resolve; });
    const client = {
      mailbox: {path: 'INBOX', flags: new Set(['\\Seen'])},
      getMailboxLock: vi.fn(async (folder: string) => {
        await blocked;
        client.mailbox = {path: folder, flags: new Set(['\\Flagged'])};
        return {release: vi.fn()};
      }),
      mailboxOpen: vi.fn(async (folder: string) => {
        client.mailbox.path = folder;
        return client.mailbox;
      }),
    };
    const imap = new ImapService();
    vi.spyOn(imap as any, 'ensureConnected').mockResolvedValue(client);
    const selection = imap.selectFolder('synthetic-account', 'Archive');
    await Promise.resolve(); await Promise.resolve();
    const folderDuringRead = client.mailbox.path;
    unlock();
    const selected = await selection;
    expect(folderDuringRead).toBe('INBOX');
    expect(selected.path).toBe('Archive');
    expect(client.getMailboxLock).toHaveBeenCalledWith('Archive');
  });

  it('reports an unavailable unread count as unknown, never as an empty folder', async () => {
    const service = {
      listFolders: vi.fn(async () => [{name: 'INBOX', attributes: []}, {name: 'Archive', attributes: []}]),
      getFolderStatus: vi.fn(async (_account: string, folder: string) => {
        if (folder === 'Archive') throw new Error('synthetic provider diagnostic');
        return {unseen: 7};
      }),
      searchEmails: vi.fn(async (_account: string, folder: string) => {
        if (folder === 'Archive') throw new Error('synthetic provider diagnostic');
        return Array(7).fill({uid: 1});
      }),
    };
    const result = await unreadTool(service)();
    expect(result.totalUnread).toBe(7);
    expect(result.byFolder).toEqual({INBOX: 7, Archive: null});
    expect(result.complete).toBe(false);
    expect(result.foldersErrored).toEqual([{folder: 'Archive', error: expect.any(String)}]);
    expect(JSON.stringify(result)).not.toContain('synthetic provider diagnostic');
    expect(service.searchEmails).not.toHaveBeenCalled();
  });

  it('deduplicates requested folders and counts without fetching mail contents or listing all folders', async () => {
    const service = {getFolderStatus: vi.fn(async () => ({unseen: 3})), listFolders: vi.fn(), searchEmails: vi.fn()};
    const result = await unreadTool(service)({folders: ['INBOX', 'INBOX']});
    expect(result).toMatchObject({totalUnread: 3, complete: true, byFolder: {INBOX: 3}});
    expect(service.getFolderStatus).toHaveBeenCalledOnce();
    expect(service.listFolders).not.toHaveBeenCalled();
    expect(service.searchEmails).not.toHaveBeenCalled();
  });

  it('skips non-selectable parent folders in the automatic overview', async () => {
    const service = {
      listFolders: vi.fn(async () => [{name: 'Parent', attributes: ['\\Noselect']}, {name: 'INBOX', attributes: []}]),
      getFolderStatus: vi.fn(async () => ({unseen: 0})), searchEmails: vi.fn(async () => []),
    };
    const result = await unreadTool(service)();
    expect(result).toMatchObject({complete: true, totalUnread: 0, byFolder: {INBOX: 0}});
    expect(result.byFolder).not.toHaveProperty('Parent');
  });
});
