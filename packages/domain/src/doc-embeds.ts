/**
 * The closed set of mimes that may embed inline in a document (spec §2
 * Attachments: only images embed; everything else is a list attachment).
 * One definition serves all three enforcement layers — editor command,
 * paste/drop handler, and the server's ingest gate — so they cannot
 * disagree about what an "image" is. Case-sensitive on purpose: sniffed
 * mimes are produced lowercase, and a lookalike is not a match.
 */
export const EMBEDDABLE_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isEmbeddableImageMime(mime: string): boolean {
  return EMBEDDABLE_IMAGE_MIME.has(mime);
}

/**
 * Dependency-free walk over opaque ProseMirror doc JSON collecting the
 * attachmentId of every `image` node — unique, first-seen order. Tolerant
 * of any junk shape: the caller may be validating a hostile payload.
 */
export function collectImageAttachmentIds(doc: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  walk(doc);
  return ids;

  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const record = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (record.type === 'image') {
      const attachmentId = (record.attrs as { attachmentId?: unknown } | undefined)?.attachmentId;
      if (typeof attachmentId === 'string' && !seen.has(attachmentId)) {
        seen.add(attachmentId);
        ids.push(attachmentId);
      }
    }
    walk(record.content);
  }
}
