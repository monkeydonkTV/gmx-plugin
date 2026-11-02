import {describe, expect, it} from 'vitest';
import {sanitizeGmxResult} from '../src/utils/gmx-result.js';

const response = (data: unknown) => ({content: [{type: 'text', text: JSON.stringify(data)}]});
const dataOf = (result: any) => JSON.parse(result.content[0].text);

describe('GMX provider diagnostics in successful or partial results', () => {
  it.each(['imap_send_email', 'imap_reply_to_email', 'imap_forward_email'])('redacts sent-copy errors for %s without changing delivery status', name => {
    const source = {success: true, deliveryStatus: 'accepted', savedToSent: false, sentSaveError: 'AUTH synthetic-secret@example.test', messageId: '<synthetic@example.test>'};
    const result = dataOf(sanitizeGmxResult(name, response(source)));
    expect(result).toEqual({...source, sentSaveError: expect.not.stringContaining('AUTH')});
    expect(result.sentSaveError).toContain('do not automatically resend');
  });
  it('removes provider text from partial search failures, preserving messages and folder names', () => {
    const messages = [{body: 'Keep this literal sentSaveError and synthetic-secret unchanged.'}];
    const result = dataOf(sanitizeGmxResult('imap_search_emails', response({messages, foldersErrored: [{folder: 'INBOX', error: 'synthetic-secret'}]})));
    expect(result.messages).toEqual(messages);
    expect(result.foldersErrored[0].folder).toBe('INBOX');
    expect(result.foldersErrored[0].error).not.toContain('synthetic-secret');
  });
  it('does not interpret email content as diagnostic data', () => {
    const original = response({body: 'original', sentSaveError: 'literal mail field'});
    expect(sanitizeGmxResult('imap_get_email', original)).toBe(original);
  });
});
