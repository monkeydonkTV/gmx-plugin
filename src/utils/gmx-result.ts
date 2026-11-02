// Only provider diagnostic fields are replaced. Mail contents and delivery
// status are user data and must retain their exact meaning.
export function sanitizeGmxResult(name: string, result: any): any {
  const sends = ['imap_send_email', 'imap_reply_to_email', 'imap_forward_email'].includes(name);
  const searches = ['imap_search_emails', 'imap_get_unread_count'].includes(name);
  if ((!sends && !searches) || !Array.isArray(result?.content)) return result;
  return { ...result, content: result.content.map((part: any) => {
    if (part.type !== 'text') return part;
    let data: any;
    try { data = JSON.parse(part.text); } catch { return part; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return part;
    if (sends && Object.hasOwn(data, 'sentSaveError')) {
      data.sentSaveError = 'Sent copy could not be saved. Check the Sent folder; do not automatically resend the message.';
    }
    if (searches && Array.isArray(data.foldersErrored)) {
      data.foldersErrored = data.foldersErrored.map((entry: any) => ({
        ...entry, error: 'Folder could not be checked. Check the folder and connection.',
      }));
    }
    return { ...part, text: JSON.stringify(data, null, 2) };
  }) };
}
