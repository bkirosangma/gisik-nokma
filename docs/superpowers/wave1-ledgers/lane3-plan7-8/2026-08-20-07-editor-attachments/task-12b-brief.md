### Task 12b: Honest rendering — a reference is not a held file

Spec §2, Drive rule 2. Two kinds render as two kinds: an upload says what the board holds; a reference says what it last saw, when it saw it, and that it cannot vouch for the contents now. There is deliberately **no positive reachability claim** — this product never tells a user a Drive link is fine, because between the check and the click it may not be. `not-checked` and `unreachable` therefore both render as *unknown*, in different words but with the same honesty.

**Files:**
- Create: `packages/editor/src/components/AttachmentListItem.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/attachment-list-item.test.tsx`

**Interfaces:**
- Consumes: `DriveReference` (Task 11a).
- Produces (cross-plan API — **the same union Plan 6 re-declares** in `packages/app-core/src/views/attachment-list.tsx`, the "one contract written twice" pattern of Open questions 1/13; edit both or neither):
  - ```ts
    export type AttachmentListEntry =
      | { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string | null }
      | ({ kind: 'drive-reference'; attachmentId: string } & DriveReference);
    ```
  - `type DriveLinkCheck = 'not-checked' | 'unreachable'`; `describeDriveReachability(check: DriveLinkCheck): string`
  - `AttachmentListItem(props: { entry: AttachmentListEntry; linkCheck?: DriveLinkCheck; resolveAttachmentUrl?(id: string): string })`, `UploadedAttachmentItem`, `DriveReferenceItem`
  - BEM classes `attachment-item`, `attachment-item--upload`, `attachment-item--drive-reference`, `attachment-item__kind`, `attachment-item__name`, `attachment-item__last-seen`, `attachment-item__reachability`; each item carries `data-attachment-kind`.

- [ ] **Step 1: Write the failing rendering test**

`packages/editor/test/attachment-list-item.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttachmentListItem, type AttachmentListEntry } from '../src/components/AttachmentListItem.js';

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
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  capturedAt: '2026-08-20T10:00:00.000Z',
};

/** Words that would claim knowledge this product does not have. */
const FORBIDDEN = ['deleted', 'missing', 'no longer', 'available', 'verified', 'up to date'];

describe('AttachmentListItem', () => {
  it('an upload renders as a file the board holds, downloadable from the board', () => {
    const view = render(<ul><AttachmentListItem entry={UPLOAD} /></ul>);
    const item = view.container.querySelector('.attachment-item')!;
    expect(item.getAttribute('data-attachment-kind')).toBe('upload');
    expect(item.className).toContain('attachment-item--upload');
    expect(item.querySelector('a')!.getAttribute('href')).toBe('/v1/attachments/01J9GATA000000000000000000');
    expect(item.textContent).toContain('receipt.pdf');
    view.unmount();
  });

  it('planted defect: a Drive reference renders as external and last-seen, never as a held file', () => {
    const view = render(<ul><AttachmentListItem entry={REFERENCE} /></ul>);
    const item = view.container.querySelector('.attachment-item')!;
    // Distinct kind, distinct class — a reader can tell them apart.
    expect(item.getAttribute('data-attachment-kind')).toBe('drive-reference');
    expect(item.className).toContain('attachment-item--drive-reference');
    expect(item.className).not.toContain('attachment-item--upload');
    // It is a link into Drive, never a download from this board.
    const href = item.querySelector('a')!.getAttribute('href')!;
    expect(href).toBe(REFERENCE.kind === 'drive-reference' ? REFERENCE.webViewLink : '');
    expect(href).not.toContain('/v1/attachments/');
    // Last-seen name AND capture date are both on the surface.
    expect(item.textContent).toContain('GST filing Aug 2026.pdf');
    expect(item.textContent).toContain('last seen');
    expect(item.textContent).toContain('2026-08-20');
    expect(item.textContent).toContain('Google Drive');
    view.unmount();
  });

  it('planted defect: an unreachable link is unknown — never absent, never fine', () => {
    const unchecked = render(<ul><AttachmentListItem entry={REFERENCE} /></ul>);
    const failed = render(<ul><AttachmentListItem entry={REFERENCE} linkCheck="unreachable" /></ul>);
    for (const view of [unchecked, failed]) {
      const text = view.container.querySelector('.attachment-item__reachability')!.textContent!;
      expect(text.toLowerCase()).toContain('unknown');
      for (const word of FORBIDDEN) expect(text.toLowerCase()).not.toContain(word);
    }
    // The two states say different things, and neither of them settles anything.
    expect(unchecked.container.textContent).not.toBe(failed.container.textContent);
    unchecked.unmount();
    failed.unmount();
  });

  it('an upload never carries reachability language at all — the board holds it', () => {
    const view = render(<ul><AttachmentListItem entry={UPLOAD} /></ul>);
    expect(view.container.querySelector('.attachment-item__reachability')).toBeNull();
    view.unmount();
  });
});
```

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/attachment-list-item.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 2: Implement the item components**

`packages/editor/src/components/AttachmentListItem.tsx`:

```tsx
import type { DriveReference } from '@gisik-nokma/domain';

/**
 * The two kinds of attachment, as a list renders them. Plan 6 re-declares
 * this union verbatim in `packages/app-core/src/views/attachment-list.tsx`
 * so app-core never depends on this package; structural typing joins them,
 * and the two declarations are ONE contract — edit both or neither.
 */
export type AttachmentListEntry =
  | { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string | null }
  | ({ kind: 'drive-reference'; attachmentId: string } & DriveReference);

export type DriveLinkCheck = 'not-checked' | 'unreachable';

/**
 * There is no "reachable" answer here on purpose. The board does not hold
 * the file, so it cannot say the file is fine — and a link that failed a
 * moment ago may work now, so it cannot say the file is gone either.
 * Both states resolve to the only true word: unknown.
 */
export function describeDriveReachability(check: DriveLinkCheck): string {
  return check === 'unreachable'
    ? 'Contents unknown — the link did not answer when it was last opened from here.'
    : 'Contents unknown — the board holds a link to this file, not the file.';
}

function formatCapturedAt(capturedAt: string): string {
  const at = new Date(capturedAt);
  return Number.isNaN(at.getTime()) ? capturedAt : at.toISOString().slice(0, 10);
}

export function UploadedAttachmentItem(props: {
  entry: Extract<AttachmentListEntry, { kind: 'upload' }>;
  resolveAttachmentUrl?: (attachmentId: string) => string;
}): React.JSX.Element {
  const href = (props.resolveAttachmentUrl ?? ((id: string) => `/v1/attachments/${id}`))(props.entry.attachmentId);
  return (
    <li className="attachment-item attachment-item--upload" data-attachment-kind="upload">
      <a className="attachment-item__name" href={href}>
        {props.entry.filename}
      </a>
      <span className="attachment-item__kind">{props.entry.mime}</span>
    </li>
  );
}

export function DriveReferenceItem(props: {
  entry: Extract<AttachmentListEntry, { kind: 'drive-reference' }>;
  linkCheck?: DriveLinkCheck;
}): React.JSX.Element {
  const { entry } = props;
  return (
    <li className="attachment-item attachment-item--drive-reference" data-attachment-kind="drive-reference">
      <span className="attachment-item__kind">Google Drive reference</span>
      <a className="attachment-item__name" href={entry.webViewLink} target="_blank" rel="noreferrer noopener">
        {entry.name}
      </a>
      <span className="attachment-item__last-seen">
        last seen as “{entry.name}” ({entry.mimeType}) · captured {formatCapturedAt(entry.capturedAt)}
      </span>
      <span className="attachment-item__reachability">{describeDriveReachability(props.linkCheck ?? 'not-checked')}</span>
    </li>
  );
}

export function AttachmentListItem(props: {
  entry: AttachmentListEntry;
  linkCheck?: DriveLinkCheck;
  resolveAttachmentUrl?: (attachmentId: string) => string;
}): React.JSX.Element {
  if (props.entry.kind === 'drive-reference') {
    const forwarded = props.linkCheck === undefined ? {} : { linkCheck: props.linkCheck };
    return <DriveReferenceItem entry={props.entry} {...forwarded} />;
  }
  const forwarded = props.resolveAttachmentUrl === undefined ? {} : { resolveAttachmentUrl: props.resolveAttachmentUrl };
  return <UploadedAttachmentItem entry={props.entry} {...forwarded} />;
}
```

Append to `packages/editor/src/styles/editor.css`:

```css
.attachment-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.35rem 0;
}
.attachment-item__kind,
.attachment-item__last-seen,
.attachment-item__reachability {
  font-size: 0.85rem;
}
.attachment-item--drive-reference {
  border-left: 2px dashed;
  padding-left: 0.5rem;
}
```

(Structural only — the dashed rule inherits `currentColor`; colour arrives from `packages/ui` tokens, Open questions 6.)

Append to `packages/editor/src/index.ts`:

```ts
export {
  AttachmentListItem,
  DriveReferenceItem,
  UploadedAttachmentItem,
  describeDriveReachability,
  type AttachmentListEntry,
  type DriveLinkCheck,
} from './components/AttachmentListItem.js';
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/attachment-list-item.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "Render a Drive reference for what it is: an external link with the name it last had and the day we looked, and a reachability line that only ever says unknown — because the board cannot vouch for a file it does not hold"
```

---

