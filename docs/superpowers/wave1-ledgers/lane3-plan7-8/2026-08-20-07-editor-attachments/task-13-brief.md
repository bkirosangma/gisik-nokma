### Task 13: Evidence picker and the require-evidence lookup

**Files:**
- Create: `packages/editor/src/attachments/require-evidence.ts`
- Create: `packages/editor/src/components/EvidencePicker.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/evidence-picker.test.tsx`

**Interfaces:**
- Consumes: `WorkflowDef` (Plan 2, from `@gisik-nokma/domain`); `UploadResult` (Task 12).
- Produces (cross-plan API — Plan 6's ticket sheet and Plan 8's builder previews consume these):
  - `transitionRequiresEvidence(def: WorkflowDef, fromStateId: string, toStateId: string): boolean` — true when the matching transition (exact `from` or `'*'`) carries a `require-evidence` rule.
  - `type AttachmentSummary = { attachmentId: string; filename: string; mime: string; size: number }`
  - `function EvidencePicker(props: EvidencePickerProps): React.JSX.Element` with `type EvidencePickerProps = { attachments: AttachmentSummary[]; uploadAttachment(file: File): Promise<UploadResult>; onAttachmentAdded(result: UploadResult): Promise<void> | void; onPick(evidenceAttachmentId: string): void; onCancel(): void }` — pick an existing attachment or upload a new one; either way `onPick` hands the caller the id to place into `ticket.transitioned`'s `evidenceAttachmentId` (Plan 3's payload; Plan 2's `require-evidence` refuses the move without it; Task 11's gate refuses an id that is not real).
  - BEM classes `evidence-picker`, `evidence-picker__option`, `evidence-picker__upload`, `evidence-picker__cancel`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/test/evidence-picker.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { transitionRequiresEvidence } from '../src/attachments/require-evidence.js';
import { EvidencePicker } from '../src/components/EvidencePicker.js';

const DEF: WorkflowDef = {
  id: 'wf_errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
    { id: 'abandoned', name: 'Abandoned', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-evidence' }] },
    { from: '*', to: 'abandoned', rules: [{ kind: 'require-comment' }] },
  ],
};

const ATTACHMENTS = [
  { attachmentId: '01J9GATA000000000000000000', filename: 'receipt.pdf', mime: 'application/pdf', size: 100 },
  { attachmentId: '01J9GATB000000000000000000', filename: 'shelf.png', mime: 'image/png', size: 200 },
];

describe('transitionRequiresEvidence', () => {
  it('reads the exact transition', () => {
    expect(transitionRequiresEvidence(DEF, 'doing', 'done')).toBe(true);
    expect(transitionRequiresEvidence(DEF, 'todo', 'doing')).toBe(false);
  });

  it('matches from-any transitions and unknown pairs answer false', () => {
    expect(transitionRequiresEvidence(DEF, 'doing', 'abandoned')).toBe(false); // rule there is require-comment
    expect(transitionRequiresEvidence(DEF, 'done', 'todo')).toBe(false); // no such transition
  });

  it('an exact transition wins over a from-any to the same state', () => {
    const def: WorkflowDef = {
      ...DEF,
      transitions: [
        { from: 'doing', to: 'abandoned', rules: [{ kind: 'require-evidence' }] },
        { from: '*', to: 'abandoned', rules: [] },
      ],
    };
    expect(transitionRequiresEvidence(def, 'doing', 'abandoned')).toBe(true);
    expect(transitionRequiresEvidence(def, 'todo', 'abandoned')).toBe(false);
  });
});

describe('EvidencePicker', () => {
  it('lists existing attachments and picking one hands over its id', () => {
    const onPick = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={ATTACHMENTS}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    const options = view.container.querySelectorAll('.evidence-picker__option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain('receipt.pdf');
    fireEvent.click(options[1]!);
    expect(onPick).toHaveBeenCalledWith(ATTACHMENTS[1]!.attachmentId);
    view.unmount();
  });

  it('uploading new evidence emits attachment.added first, then picks the fresh id', async () => {
    const order: string[] = [];
    const uploaded = { attachmentId: '01J9GATC000000000000000000', url: '/v1/attachments/01J9GATC000000000000000000', mime: 'application/pdf', filename: 'proof.pdf', size: 3, sha256: 'c'.repeat(64) };
    const uploadAttachment = vi.fn(async () => {
      order.push('upload');
      return uploaded;
    });
    const onAttachmentAdded = vi.fn(async () => {
      order.push('event');
    });
    const onPick = vi.fn(() => {
      order.push('pick');
    });
    const view = render(
      <EvidencePicker
        attachments={[]}
        uploadAttachment={uploadAttachment}
        onAttachmentAdded={onAttachmentAdded}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    const input = view.container.querySelector('.evidence-picker__upload input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(3)], 'proof.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => {
      expect(onPick).toHaveBeenCalledWith(uploaded.attachmentId);
    });
    expect(order).toEqual(['upload', 'event', 'pick']);
    view.unmount();
  });

  it('a failed upload cancels nothing and picks nothing', async () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={[]}
        uploadAttachment={vi.fn(async () => {
          throw new Error('refused');
        })}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={onCancel}
      />,
    );
    const input = view.container.querySelector('.evidence-picker__upload input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] } });
    await vi.waitFor(() => {
      expect(view.container.textContent).toContain('refused');
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    view.unmount();
  });

  it('cancel is an explicit act', () => {
    const onCancel = vi.fn();
    const view = render(
      <EvidencePicker attachments={[]} uploadAttachment={vi.fn()} onAttachmentAdded={vi.fn()} onPick={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(view.container.querySelector('.evidence-picker__cancel') as HTMLButtonElement);
    expect(onCancel).toHaveBeenCalled();
    view.unmount();
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: FAIL — modules do not exist.

`packages/editor/src/attachments/require-evidence.ts`:

```ts
import type { WorkflowDef } from '@gisik-nokma/domain';

/**
 * Does fromStateId → toStateId carry a require-evidence rule? The exact
 * transition wins; a `'*'` (from-any) transition applies only when no
 * exact one matches — mirroring how the engine resolves the transition
 * it will enforce (Plan 2).
 */
export function transitionRequiresEvidence(def: WorkflowDef, fromStateId: string, toStateId: string): boolean {
  const exact = def.transitions.find((t) => t.from === fromStateId && t.to === toStateId);
  const transition = exact ?? def.transitions.find((t) => t.from === '*' && t.to === toStateId);
  if (!transition) return false;
  return transition.rules.some((rule) => rule.kind === 'require-evidence');
}
```

`packages/editor/src/components/EvidencePicker.tsx`:

```tsx
import { useState } from 'react';
import type { UploadResult } from '../upload.js';

export type AttachmentSummary = {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
};

export type EvidencePickerProps = {
  /** The ticket's existing attachments — any of them can serve as evidence. */
  attachments: AttachmentSummary[];
  uploadAttachment(file: File): Promise<UploadResult>;
  /** Emit attachment.added for a fresh upload before it is offered as evidence. */
  onAttachmentAdded(result: UploadResult): Promise<void> | void;
  /** The chosen id goes into ticket.transitioned's evidenceAttachmentId. */
  onPick(evidenceAttachmentId: string): void;
  onCancel(): void;
};

/**
 * The require-evidence companion (spec §4): when a transition demands an
 * attachment, this is where the user names one — an existing attachment
 * or a fresh upload. The picker only ever hands back an id that a real
 * upload produced; the server's evidence gate re-proves it exists.
 */
export function EvidencePicker(props: EvidencePickerProps): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const result = await props.uploadAttachment(file);
      await props.onAttachmentAdded(result);
      props.onPick(result.attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="evidence-picker" role="dialog" aria-label="Choose evidence">
      <p>This move must carry an attachment as evidence.</p>
      <ul>
        {props.attachments.map((attachment) => (
          <li key={attachment.attachmentId}>
            <button
              type="button"
              className="evidence-picker__option"
              onClick={() => props.onPick(attachment.attachmentId)}
            >
              {attachment.filename} · {attachment.mime}
            </button>
          </li>
        ))}
      </ul>
      <label className="evidence-picker__upload">
        {uploading ? 'Uploading…' : 'Upload new evidence'}
        <input
          type="file"
          disabled={uploading}
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </label>
      {error === null ? null : <p role="alert">{error}</p>}
      <button type="button" className="evidence-picker__cancel" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}
```

Append to `packages/editor/src/styles/editor.css`:

```css
.evidence-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.evidence-picker__option {
  text-align: left;
  cursor: pointer;
}
```

Append to `packages/editor/src/index.ts`:

```ts
export { transitionRequiresEvidence } from './attachments/require-evidence.js';
export { EvidencePicker, type AttachmentSummary, type EvidencePickerProps } from './components/EvidencePicker.js';
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "Evidence picker: existing attachment or fresh upload, attachment.added before the id is offered, and a require-evidence lookup that resolves transitions the way the engine does"
```

---

### Task 13a: Drive references are not offerable as evidence

Spec §2, Drive rule 1, at the surface. Task 11a makes the ledger refuse a Drive reference named as evidence; this task makes sure a user never gets that far by accident, and — when they try — reads the same sentence the server would have said.

The refusal is **structural, not conditional**: references arrive on their own prop and there is no code path from that list to `onPick`. A disabled option is a UI state that can be defeated; a list with no pick handler cannot be.

**Files:**
- Modify: `packages/editor/src/components/EvidencePicker.tsx`
- Modify: `packages/editor/src/styles/editor.css`
- Test: `packages/editor/test/evidence-picker.test.tsx` (append cases — the existing ones are untouched)

**Interfaces:**
- Consumes: `EVIDENCE_DRIVE_REFERENCE_REASON`, `DriveReference` (Task 11a).
- Produces (additive to Task 13's contract — every existing call site stays valid):
  - `type DriveReferenceSummary = { attachmentId: string } & DriveReference`
  - `EvidencePickerProps` gains `driveReferences?: DriveReferenceSummary[]` (default `[]`). They render in a separate, unofferable section carrying the named reason; `AttachmentSummary` keeps meaning *uploaded attachment*, which is the only thing evidence can be.
  - BEM classes `evidence-picker__unavailable`, `evidence-picker__unavailable-item`, `evidence-picker__reason`.

- [ ] **Step 1: Append the failing cases**

Append inside the existing `describe('EvidencePicker', …)` block of `packages/editor/test/evidence-picker.test.tsx`:

```tsx
  const DRIVE_REFERENCES = [
    {
      attachmentId: '01J9GATD000000000000000000',
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
      name: 'receipt.pdf', // same name as an upload on purpose: names prove nothing
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
      capturedAt: '2026-08-20T10:00:00.000Z',
    },
  ];

  it('planted defect: a Drive reference is never among the offerable options', () => {
    const onPick = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={ATTACHMENTS}
        driveReferences={DRIVE_REFERENCES}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    // Exactly the uploads are offerable — the reference did not sneak in on a matching name.
    const options = [...view.container.querySelectorAll('.evidence-picker__option')];
    expect(options).toHaveLength(ATTACHMENTS.length);
    for (const option of options) {
      expect(option.textContent).not.toContain('Google Drive');
    }
    // Clicking anything in the unavailable section picks nothing.
    for (const item of view.container.querySelectorAll('.evidence-picker__unavailable-item')) {
      fireEvent.click(item);
    }
    expect(onPick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("planted defect: the reference is shown with the server's own reason, word for word", () => {
    const view = render(
      <EvidencePicker
        attachments={[]}
        driveReferences={DRIVE_REFERENCES}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const unavailable = view.container.querySelector('.evidence-picker__unavailable')!;
    expect(unavailable.textContent).toContain('receipt.pdf');
    expect(view.container.querySelector('.evidence-picker__reason')!.textContent).toBe(EVIDENCE_DRIVE_REFERENCE_REASON);
    view.unmount();
  });
```

Add to that file's imports: `import { EVIDENCE_DRIVE_REFERENCE_REASON } from '@gisik-nokma/domain';`

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: FAIL — `driveReferences` is not a prop and the unavailable section does not exist.

- [ ] **Step 2: Extend the picker (named modification of Task 13's component)**

In `packages/editor/src/components/EvidencePicker.tsx`:

1. Add the imports: `import { EVIDENCE_DRIVE_REFERENCE_REASON, type DriveReference } from '@gisik-nokma/domain';`
2. Add the summary type and the prop:

```tsx
export type DriveReferenceSummary = { attachmentId: string } & DriveReference;
```

and, inside `EvidencePickerProps`:

```tsx
  /**
   * Drive references on this ticket. They are listed so the user is not
   * left wondering where their file went — and they arrive on their own
   * prop, with no pick handler anywhere near them, because "not offerable"
   * must be a fact about the code and not a disabled attribute someone can
   * defeat (spec §2, Drive rule 1).
   */
  driveReferences?: DriveReferenceSummary[];
```

3. Render the section immediately after the offerable `<ul>` and before the upload control:

```tsx
      {(props.driveReferences ?? []).length === 0 ? null : (
        <div className="evidence-picker__unavailable">
          <p className="evidence-picker__reason">{EVIDENCE_DRIVE_REFERENCE_REASON}</p>
          <ul>
            {(props.driveReferences ?? []).map((reference) => (
              <li key={reference.attachmentId} className="evidence-picker__unavailable-item">
                {reference.name} · Google Drive reference, last seen {reference.capturedAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      )}
```

Nothing else in the component changes: the offerable list still maps `props.attachments`, which still means uploads.

Append to `packages/editor/src/styles/editor.css`:

```css
.evidence-picker__unavailable {
  border-left: 2px dashed;
  padding-left: 0.5rem;
}
.evidence-picker__unavailable-item {
  font-size: 0.85rem;
}
```

- [ ] **Step 3: Run the picker suite**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/evidence-picker.test.tsx`
Expected: PASS (9 tests — Task 13's seven and these two).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "The evidence picker will not offer a Drive reference — it lists them with the same words the server would have refused with, and there is no code path from that list to a pick"
```

---

