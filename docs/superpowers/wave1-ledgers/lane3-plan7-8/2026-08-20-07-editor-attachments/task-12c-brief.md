### Task 12c: A Drive image is never an inline image

Spec §2, Drive rule 3. Inline embedding stays uploads-only and images-only, and a Drive image is not an exception — its mime says `image/png` while its bytes live somewhere this product cannot read, so a node pointing at it would render as a hole or, worse, as content the board is showing on its own authority.

Enforcement is structural rather than conditional: the drive module **cannot** insert a node, because it does not import the command that inserts nodes — and a scanner test keeps it that way, in the spirit of Plan 6's views-never-import-HTTP scan. Layer 3 needs nothing new: a reference has no `attachments` row, so the existing image-embed gate already refuses it — this task proves that rather than assuming it.

**Files:**
- Test: `packages/editor/test/drive-never-inline.test.ts`
- Test: `apps/server/test/gates/image-embed-gate.test.ts` (append one case)

**Interfaces:**
- Consumes: `createAttachmentPasteExtension`, `buildEditorExtensions` (Task 12); `composeDriveReferenceAdded`, `toDriveReference` (Task 12a); `seedDriveReference` (Task 11a's helper); `RULE_EMBED_UNKNOWN` (Task 11).
- Produces: no new API. The guarantee: **no code path anywhere turns a Drive reference into a document node**, proven at the client (structural + behavioural) and at the server (gate).

- [ ] **Step 1: Write the failing client test**

`packages/editor/test/drive-never-inline.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Editor as CoreEditor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { composeDriveReferenceAdded } from '../src/drive/attachment-claims.js';
import { toDriveReference } from '../src/drive/google-picker.js';
import { createAttachmentPasteExtension } from '../src/extensions/attachment-paste.js';
import { buildEditorExtensions } from '../src/schema/extensions.js';

const DRIVE_PNG = {
  id: '1PnGdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'shelf.png',
  mimeType: 'image/png', // an image by type, and still not ours to show
  url: 'https://drive.google.com/file/d/1PnGdEfGhIjKlMnOpQrStUvWxYz0123456/view',
};

function makeEditor() {
  const calls: string[] = [];
  const editor = new CoreEditor({
    element: document.createElement('div'),
    extensions: [
      ...buildEditorExtensions(),
      createAttachmentPasteExtension({
        uploadAttachment: vi.fn(async () => {
          calls.push('upload');
          throw new Error('no upload should happen for a Drive paste');
        }),
        onAttachmentAdded: vi.fn(),
        onFileAttached: vi.fn(),
        onUploadError: vi.fn(),
        onUploadStart: vi.fn(),
        onUploadEnd: vi.fn(),
      }),
    ],
  });
  return { editor, calls };
}

function imageNodeCount(editor: CoreEditor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') count += 1;
    return true;
  });
  return count;
}

describe('a Drive reference never becomes an inline image (rule 3)', () => {
  it('planted defect: picking a Drive PNG produces an attachment claim and NO image node', () => {
    const { editor } = makeEditor();
    const before = JSON.stringify(editor.getJSON());
    const event = composeDriveReferenceAdded(toDriveReference(DRIVE_PNG, new Date('2026-08-20T10:00:00.000Z')));
    expect(event.payload.kind).toBe('drive-reference');
    expect(event.payload.mimeType).toBe('image/png');
    expect(imageNodeCount(editor)).toBe(0);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    editor.destroy();
  });

  it('planted defect: pasting a Drive link (no file on the clipboard) uploads nothing and embeds nothing', () => {
    const { editor, calls } = makeEditor();
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/uri-list', getAsFile: () => null }],
        getData: () => DRIVE_PNG.url,
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    const handled = editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0))) ?? false;
    // Not handled by us: ProseMirror's own text handling pastes the link,
    // which is exactly right — a link is a link.
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
    expect(imageNodeCount(editor)).toBe(0);
    editor.destroy();
  });

  it('planted defect: the drive module cannot embed, because it never imports the command that embeds', () => {
    const driveDir = new URL('../src/drive/', import.meta.url).pathname;
    const sources = readdirSync(driveDir).filter((name) => name.endsWith('.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) {
      const source = readFileSync(join(driveDir, name), 'utf8');
      for (const forbidden of ['ticket-image', 'insertTicketImage', 'setImageWrap']) {
        expect(source, `${name} must not reach for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
```

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/drive-never-inline.test.ts`
Expected: PASS immediately **only if** Task 12a's modules are clean — this suite asserts an existing guarantee rather than driving new code. Run it before believing it: if the scanner case passes with an obviously broken input, the scan is not scanning. Verify by temporarily adding `// insertTicketImage` to `packages/editor/src/drive/attachment-claims.ts`, re-running (expect FAIL), and removing it again.

- [ ] **Step 2: Append the server-side case (layer 3)**

Append inside the existing `describe('image-embed gate (layer 3)', …)` block of `apps/server/test/gates/image-embed-gate.test.ts`:

```ts
  it('planted defect: a document embedding a Drive reference is refused — a reference has no bytes to show', async () => {
    const referenceId = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: TICKET, attachmentId: referenceId, actorId: ACTOR });
    const event = submitted('comment.added', { body: docEmbedding(referenceId) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    expect(await ledgerCount(event.id)).toBe(0);
  });
```

Add to that file's imports: `import { seedDriveReference } from '../helpers/drive-reference.js';`

The rule id is deliberately the *existing* `attachment.embed-unknown`: from the embedder's point of view there is no image attachment by that id on this ticket, and inventing a third id here would tell an embedder which ids are references — the same existence-leak the gate already refuses to perform.

- [ ] **Step 3: Run both suites**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/drive-never-inline.test.ts && pnpm --filter @gisik-nokma/server exec vitest run test/gates/image-embed-gate.test.ts`
Expected: PASS — 3 client cases, and the gate suite with its new refusal.

- [ ] **Step 4: Commit**

```bash
git add packages/editor apps/server
git commit -m "Inline embedding stays uploads-only: a picked Drive image joins the list, a pasted Drive link stays a link, the drive module cannot even reach the insert command, and the server refuses a document that tries anyway"
```

---

