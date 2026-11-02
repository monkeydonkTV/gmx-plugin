/** Local composing helpers: never interpret message content as instructions. */
export function prefixedSubject(subject: string, kind: 'reply' | 'forward'): string {
  const prefix = kind === 'reply' ? /^(?:re|aw)\s*:/i : /^(?:fwd|fw|wg)\s*:/i;
  return prefix.test(subject.trimStart()) ? subject : `${kind === 'reply' ? 'Re' : 'Fwd'}: ${subject}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function forwardHtml(original: string | undefined, commentAndHeaders: string): string | undefined {
  if (!original) return undefined;
  const addition = `<div style="white-space:pre-wrap">${escapeHtml(commentAndHeaders)}</div>`;
  // Preserve complete HTML documents and their head/style; insert inside body.
  // Find the tag prefix once, then its terminator once. A greedy unanchored
  // regexp would rescan the remainder for every malformed '<body ' fragment.
  const bodyTag = /<body\b/i.exec(original);
  const closing = bodyTag ? original.indexOf('>', bodyTag.index + bodyTag[0].length) : -1;
  if (closing < 0) return addition + original;
  const end = closing + 1;
  return original.slice(0, end) + addition + original.slice(end);
}
