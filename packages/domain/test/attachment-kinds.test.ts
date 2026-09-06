import { describe, expect, it } from 'vitest';
import {
  DRIVE_FILE_SCOPE,
  EVIDENCE_DRIVE_REFERENCE_REASON,
  RULE_EVIDENCE_DRIVE_REFERENCE,
  isDriveReference,
  type DriveReference,
} from '../src/attachment-kinds.js';
import { attachmentDriveReferencePayload } from '../src/events/ticket-events.js';
import { newUlid } from '../src/ids.js';

const REFERENCE: DriveReference = {
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

describe('attachment kinds', () => {
  /**
   * 9.115 — `DRIVE_FILE_SCOPE` is exactly `https://www.googleapis.com/auth/drive.file` — the one non-sensitive per-file scope, pinned by value.
   */
  it('requests exactly the per-file Drive scope', () => {
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  /**
   * 9.58 — `isDriveReference` and the evidence rule's reason string are pinned to each other, so the second cannot quietly stop meaning the first.
   */
  it('pins the evidence refusal id and names the remedy in its reason', () => {
    expect(RULE_EVIDENCE_DRIVE_REFERENCE).toBe('attachment.evidence-drive-reference');
    expect(EVIDENCE_DRIVE_REFERENCE_REASON).toContain('cannot serve as evidence');
    expect(EVIDENCE_DRIVE_REFERENCE_REASON).toContain('Upload the file to this ticket');
  });

  /**
   * 9.116 — `isDriveReference` accepts a complete reference, with `iconLink` optional (present or absent both pass).
   */
  it('accepts a complete reference, with iconLink optional', () => {
    expect(isDriveReference(REFERENCE)).toBe(true);
    expect(
      isDriveReference({
        ...REFERENCE,
        iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf',
      }),
    ).toBe(true);
  });

  /**
   * 9.117 — planted defect, eight sub-cases: `null`, a bare string, and six single-field corruptions all fail `isDriveReference`.
   */
  it('planted defect: an incomplete or mistyped reference is not a reference', () => {
    for (const broken of [
      null,
      'a string',
      { ...REFERENCE, driveFileId: '' },
      { ...REFERENCE, capturedAt: undefined },
      { ...REFERENCE, webViewLink: 42 },
      { ...REFERENCE, iconLink: 7 },
      // name and mimeType had no killing case: deleting either conjunct from
      // the guard survived every entry above.
      { ...REFERENCE, name: '' },
      { ...REFERENCE, mimeType: 42 },
    ]) {
      expect(isDriveReference(broken), `${JSON.stringify(broken)} must not pass`).toBe(false);
    }
  });
});

/**
 * A Drive reference is stated twice in this package on purpose: as this
 * dependency-free structural guard, which the ingest gate and the editor bundle
 * can take without dragging zod in, and as `attachmentDriveReferencePayload` in
 * events/ticket-events.ts, which is what the door actually validates. The
 * duplication is the design; drift between the two halves is the hazard, so it
 * is pinned here rather than left to a reviewer to notice. A rename on either
 * side fails this block — the wire half at runtime, the guard half at compile
 * time, since REFERENCE is annotated `DriveReference` and the complete fixture
 * is `Required<DriveReference>`. The annotation is what catches a REMOVAL:
 * without it the fixture's runtime keys came from an untyped literal, so a
 * field dropped from the type would keep appearing in `Object.keys` and the
 * key sets would still agree.
 */
describe('the guard and the wire schema describe one concept', () => {
  /**
   * 9.118 — the structural guard and the wire schema (`attachmentDriveReferencePayload`) describe one concept, checked field-for-field.
   */
  it('agrees with attachmentDriveReferencePayload field for field', () => {
    const complete: Required<DriveReference> = {
      ...REFERENCE,
      iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf',
    };

    // The wire adds exactly what the envelope needs and the guard cannot know:
    // which kind of attachment this claim is, and which attachment it is about.
    expect(Object.keys(attachmentDriveReferencePayload.shape).sort()).toEqual(
      [...Object.keys(complete), 'kind', 'attachmentId'].sort(),
    );

    expect(isDriveReference(complete)).toBe(true);
    expect(() =>
      attachmentDriveReferencePayload.parse({
        kind: 'drive-reference',
        attachmentId: newUlid(),
        ...complete,
      }),
    ).not.toThrow();
  });
});
