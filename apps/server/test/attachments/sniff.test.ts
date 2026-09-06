import { describe, expect, it } from 'vitest';
import { EMBEDDABLE_IMAGE_MIME } from '@gisik-nokma/domain';
import { ALLOWED_ATTACHMENT_MIME, sniffAllowedMime } from '../../src/attachments/sniff.js';

/**
 * Plan 7 Task 9 — the mime decision, and the only thing allowed to make it.
 *
 * ## Every fixture here is REAL magic bytes
 *
 * Not a mock of `file-type`. A stubbed sniffer would let this file pass while
 * the shipped one refused every png, because the property under test is not
 * "the code calls a sniffer" but "these bytes produce this mime". The
 * prefixes below are the genuine signatures, verified against
 * `fileTypeFromBuffer` before they were written down: `MZ` is detected as
 * `application/x-msdownload` (so the executable is refused by the ALLOW-LIST
 * branch, not the unidentifiable one — the two reasons differ and the tests
 * below name which is which), and 64 bytes of 0x07 are detected as nothing.
 *
 * ## The subset invariant, and what makes it falsifiable
 *
 * `ALLOWED_ATTACHMENT_MIME` spells its image mimes out literally instead of
 * spreading domain's `EMBEDDABLE_IMAGE_MIME` (the plan text spread it). Under
 * the plan's version this test could not fail: both sides would come from one
 * set. Written as two independent statements, deleting `'image/webp'` from
 * either side reddens it — which is the whole point, because an image the
 * editor will happily embed but the upload door refuses is a document that
 * cannot be authored.
 *
 * `EMBEDDABLE_IMAGE_MIME` arrives here BY PACKAGE NAME, so it resolves through
 * `packages/domain/dist`. Under bare `vitest` this test therefore compares
 * against domain's LAST BUILD, not its source; run it through
 * `pnpm turbo run test --filter=@gisik-nokma/server`, which builds domain
 * first. That is the branch's standing hazard, recorded here so a future agent
 * reading a green bare-vitest run knows what it did not check.
 */

/** Real magic bytes, minimal viable prefixes. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PDF = new TextEncoder().encode('%PDF-1.7\nstub body\n%%EOF');
const EXE = Uint8Array.from([
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
  ...new Array<number>(52).fill(0),
]);
const NOISE = Uint8Array.from(new Array<number>(64).fill(0x07));

describe('sniffAllowedMime', () => {
  /**
   * 9.186 — `sniffAllowedMime` identifies a PNG by its bytes alone.
   */
  it('identifies a png by bytes alone', async () => {
    expect(await sniffAllowedMime(PNG)).toEqual({ ok: true, mime: 'image/png' });
  });

  /**
   * 9.187 — it identifies a PDF by its bytes alone.
   */
  it('identifies a pdf by bytes alone', async () => {
    expect(await sniffAllowedMime(PDF)).toEqual({ ok: true, mime: 'application/pdf' });
  });

  /**
   * 9.188 — planted defect: an executable is refused no matter what it claims to be named or typed as.
   */
  it('planted defect: an executable is refused no matter what it is called', async () => {
    const result = await sniffAllowedMime(EXE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not accepted');
  });

  /**
   * 9.189 — planted defect: unidentifiable bytes are refused, with the filename extension never consulted as a fallback.
   */
  it('planted defect: unidentifiable bytes are refused, extensions never consulted', async () => {
    const result = await sniffAllowedMime(NOISE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('never trusted');
  });

  /**
   * 9.190 — every embeddable-image MIME (the domain's `EMBEDDABLE_IMAGE_MIME`) is a subset of the uploadable allow-list.
   */
  it('every embeddable image mime is uploadable (subset invariant)', () => {
    // A positive control on the loop itself: an empty EMBEDDABLE_IMAGE_MIME
    // would make the assertions below vacuous and the test green, which is the
    // silent-empty mode this repo has a memory note about.
    expect(EMBEDDABLE_IMAGE_MIME.size).toBeGreaterThan(0);
    for (const mime of EMBEDDABLE_IMAGE_MIME) {
      expect(ALLOWED_ATTACHMENT_MIME.has(mime), `${mime} missing from allow-list`).toBe(true);
    }
  });

  /**
   * 9.191 — the allow-list is closed: a real file of a type outside it is still refused, sniffing notwithstanding.
   */
  it('the allow-list is closed: types outside it are refused even when they are real', async () => {
    // A real, correctly-detected file type that we deliberately do not accept.
    // Distinct from the .exe case: this one names the CLOSEDNESS of the list
    // rather than hostility, so widening the list has to be a deliberate edit
    // that reddens a test naming the type it admitted.
    const BMP = Uint8Array.from([0x42, 0x4d, ...new Array<number>(62).fill(0)]);
    const result = await sniffAllowedMime(BMP);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('image/bmp');
  });
});
