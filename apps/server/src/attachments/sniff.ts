import { fileTypeFromBuffer } from 'file-type';

/**
 * The closed allow-list of attachment types v1 accepts.
 *
 * ## Detection is by magic bytes, and the name is display data
 *
 * Nothing here consults a filename, an extension, or the client's
 * `Content-Type`. Those three are all the same thing — a string the uploader
 * chose — and a decision that reads any of them is a decision the uploader
 * makes. `holiday-photo.png` whose bytes start `MZ` is an executable, and this
 * module says so.
 *
 * ## Why the image mimes are spelled out rather than spread from domain
 *
 * The plan text wrote `new Set([...EMBEDDABLE_IMAGE_MIME, 'application/pdf',
 * …])`. That makes the subset invariant `EMBEDDABLE_IMAGE_MIME ⊆
 * ALLOWED_ATTACHMENT_MIME` — which `test/attachments/sniff.test.ts` asserts —
 * a check that CANNOT FAIL: the allow-list would be derived from the very set
 * it is checked against, so deleting `image/webp` from the embeddable set
 * deletes it from both sides at once and the test stays green while the
 * property it names quietly stops being observable.
 *
 * Written literally, the two sets are independent statements and the test is a
 * real constraint: remove a line here and the invariant reddens. The cost is
 * that the lists can drift, which is exactly what the test now detects.
 *
 * A second, smaller gain: this module imports nothing from
 * `@gisik-nokma/domain`, so the shipped server code carries no cross-package
 * import for four string constants and the dist-vs-src resolution question
 * arises only in the test.
 *
 * Absentees are deliberate: SVG (no magic bytes, and a script vector), plain
 * text and CSV (unsniffable — `fileTypeFromBuffer` answers `undefined`, so they
 * are refused by the first branch below rather than by omission). See the
 * plan's Open questions 5 before "just adding" one.
 */
export const ALLOWED_ATTACHMENT_MIME: ReadonlySet<string> = new Set([
  // Images — must stay a superset of domain's EMBEDDABLE_IMAGE_MIME, which
  // test/attachments/sniff.test.ts enforces against the real domain set.
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/zip',
  // Media
  'video/mp4',
  'video/webm',
  'audio/mpeg',
]);

export type SniffResult = { ok: true; mime: string } | { ok: false; reason: string };

/**
 * The mime of these bytes, or a refusal a person can act on.
 *
 * Two distinguishable refusals, because they mean different things to the
 * uploader: "I could not tell what this is" (the file is broken or is a type
 * with no signature) and "I know exactly what this is and we do not take it"
 * (use a different file). Neither discloses anything the uploader did not
 * themselves send, so the distinction opens no oracle.
 */
export async function sniffAllowedMime(bytes: Uint8Array): Promise<SniffResult> {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected) {
    return {
      ok: false,
      reason:
        'This file type could not be identified from its content, so it was refused. File names and extensions are never trusted.',
    };
  }
  if (!ALLOWED_ATTACHMENT_MIME.has(detected.mime)) {
    return { ok: false, reason: `Files of type ${detected.mime} are not accepted here.` };
  }
  return { ok: true, mime: detected.mime };
}
