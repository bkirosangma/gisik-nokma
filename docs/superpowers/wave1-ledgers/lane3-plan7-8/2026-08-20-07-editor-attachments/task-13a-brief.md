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

