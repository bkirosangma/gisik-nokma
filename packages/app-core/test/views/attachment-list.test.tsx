import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isDriveReference } from '@gisik-nokma/domain';
import { AttachmentList, type AttachmentListEntry } from '../../src/views/attachment-list.js';

const UPLOAD: AttachmentListEntry = {
  kind: 'upload',
  attachmentId: '01J9GATA000000000000000000',
  filename: 'receipt.pdf',
  mime: 'application/pdf',
  size: 1024,
  sha256: 'a'.repeat(64),
};

const REFERENCE: AttachmentListEntry = {
  kind: 'drive-reference',
  attachmentId: '01J9GATD000000000000000000',
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'receipt.pdf', // same name as the upload on purpose — the name proves nothing
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

/** Words that would claim knowledge about a file this board does not hold. */
const FORBIDDEN = ['deleted', 'missing', 'no longer', 'available', 'verified'];

describe('3.76 AttachmentList', () => {
  it('PLANTED DEFECT — the two kinds are told apart: a Drive reference is never rendered as a held file', () => {
    const view = render(<AttachmentList entries={[UPLOAD, REFERENCE]} />);
    const [uploaded, referenced] = [...view.container.querySelectorAll('.gn-attachment')];

    expect(uploaded!.getAttribute('data-attachment-kind')).toBe('upload');
    expect(uploaded!.querySelector('a')!.getAttribute('href')).toBe(
      '/v1/attachments/01J9GATA000000000000000000',
    );
    expect(uploaded!.textContent).not.toContain('last seen');

    expect(referenced!.getAttribute('data-attachment-kind')).toBe('drive-reference');
    expect(referenced!.className).toContain('gn-attachment--drive-reference');
    // A link into Drive — never a download from this board.
    expect(referenced!.querySelector('a')!.getAttribute('href')).toBe(
      REFERENCE.kind === 'drive-reference' ? REFERENCE.webViewLink : '',
    );
    expect(referenced!.innerHTML).not.toContain('/v1/attachments/');
    // Last-seen name and capture date are on the surface, and nothing settles the contents.
    expect(referenced!.textContent).toContain('Google Drive');
    expect(referenced!.textContent).toContain('last seen');
    // The capture date wears the same rendering as every other date here.
    expect(referenced!.textContent).toContain('20 Aug 2026');
    expect(referenced!.textContent).not.toContain('2026-08-20T');
    const status = referenced!.querySelector('.gn-attachment__status')!.textContent!.toLowerCase();
    expect(status).toContain('unknown');
    for (const word of FORBIDDEN) expect(status).not.toContain(word);
    view.unmount();
  });

  it('PLANTED DEFECT: the same filename on both kinds does not merge them — the NAME settles nothing', () => {
    // Both fixtures are called receipt.pdf. A list that keyed, grouped or
    // de-duplicated on the displayed name would show one row here, and the
    // pointer would have absorbed the held file.
    const view = render(<AttachmentList entries={[UPLOAD, REFERENCE]} />);
    const kinds = [...view.container.querySelectorAll('.gn-attachment')].map((node) =>
      node.getAttribute('data-attachment-kind'),
    );
    expect(kinds).toEqual(['upload', 'drive-reference']);
    view.unmount();
  });

  it('renders nothing when there are no attachments — an empty list is not a heading with nothing under it', () => {
    const view = render(<AttachmentList entries={[]} />);
    expect(view.container.querySelector('.gn-attachments')).toBeNull();
    expect(view.container.textContent).toBe('');
    view.unmount();
  });
});

/**
 * THE TWIN DECLARATION, MEASURED rather than asserted.
 *
 * Plan 6 Open question 13 says `packages/editor` declares this union
 * identically, so app-core never depends on the editor package and structural
 * typing joins the two. This comment used to say that twin did not exist yet,
 * which was true when written; **Plan 7 Task 12b created it at
 * `packages/editor/src/components/AttachmentListItem.tsx:50`.** The two
 * declarations now move together or not at all.
 *
 * The assertion below is deliberately NOT rewritten to import the editor's
 * copy and compare them. app-core depending on `packages/editor` is exactly
 * what the twin arrangement exists to avoid, so the check stays where it was:
 * against the domain's own shape, which both twins are spelled from.
 *
 * What CAN be checked today is the claim the divergence report rests on: Plan 7
 * writes the reference arm as `{kind, attachmentId} & DriveReference`, and
 * `DriveReference` lives in the domain. If the members inlined here are exactly
 * that type's members, the two plan texts describe ONE type in two spellings,
 * and a step-12 reconciliation has nothing to reconcile. This asserts it against
 * the domain's own shape guard rather than against a comment.
 */
describe('3.76 AttachmentListEntry — the drive arm is the domain’s DriveReference, inlined', () => {
  it('PLANTED DEFECT: the reference arm satisfies the domain’s DriveReference guard, member for member', () => {
    expect(REFERENCE.kind).toBe('drive-reference');
    if (REFERENCE.kind !== 'drive-reference') throw new Error('unreachable');
    const { kind: _kind, attachmentId: _attachmentId, ...rest } = REFERENCE;
    expect(isDriveReference(rest)).toBe(true);
    // And the inlined arm carries no member DriveReference does not have: strip
    // the two discriminating fields and what is left is exactly its keys.
    expect(Object.keys(rest).sort()).toEqual(
      ['capturedAt', 'driveFileId', 'mimeType', 'name', 'webViewLink'].sort(),
    );
  });

  it('CONTROL — the guard really can say no, so the assertion above is a measurement', () => {
    const { webViewLink: _dropped, ...withoutLink } = {
      driveFileId: 'd',
      name: 'n',
      mimeType: 'application/pdf',
      webViewLink: 'https://example.test/x',
      capturedAt: '2026-08-20T10:00:00.000Z',
    };
    expect(isDriveReference(withoutLink)).toBe(false);
    expect(isDriveReference({ ...withoutLink, webViewLink: 'https://example.test/x' })).toBe(true);
  });
});
