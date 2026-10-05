import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Editor } from '@tiptap/core';
import {
  composeEditorSubmission,
  type EditorSubmission,
} from '../src/attachments/compose-editor-submission.js';
import {
  TicketEditorSlot,
  type EditorSlotUpload,
  type TicketEditorSlotProps,
} from '../src/components/TicketEditorSlot.js';
import type { DocJson } from '../src/doc.js';
import { uploadAttachmentHttp, uploadNoteAttachmentHttp } from '../src/upload.js';

const DOC: DocJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the words' }] }],
};

const UPLOADED = {
  attachmentId: '01J9GATA000000000000000000',
  url: '/v1/attachments/01J9GATA000000000000000000',
  mime: 'image/png',
  filename: 'a.png',
  size: 1,
  sha256: 'd'.repeat(64),
};

describe('composeEditorSubmission', () => {
  /**
   * 9.65 — `composeEditorSubmission` maps the two composer modes onto Plan 3's ledger events and nothing else: comment → `comment.added {body}`.
   */
  it('comment mode → comment.added {body}', () => {
    expect(composeEditorSubmission('comment', DOC)).toEqual({
      type: 'comment.added',
      payload: { body: DOC },
    });
  });

  it('description mode → ticket.field_set {fieldId: description, value}', () => {
    expect(composeEditorSubmission('description', DOC)).toEqual({
      type: 'ticket.field_set',
      payload: { fieldId: 'description', value: DOC },
    });
  });

  it("the field_set payload carries a `value` key — the domain door refuses one that is merely absent", () => {
    const submission = composeEditorSubmission('description', DOC);
    // `ticketFieldSetPayload` (packages/domain/src/events/ticket-events.ts:90)
    // refines `value !== undefined` precisely because an absent key used to be
    // folded into a null clearing claim. Assert the KEY, not just the value.
    expect(Object.keys(submission.payload)).toContain('value');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ONE CONTRACT WRITTEN TWICE — the compile-time half of the proof.
//
// TRANSCRIBED from packages/app-core/src/views/editor-slot.tsx on 2026-09-03.
// packages/editor must not depend on app-core (that inverts the dependency and
// drags app-core's tree into the RN webview bundle), so the far half is COPIED
// here and the assignment below is what proves the two halves still meet under
// `strictFunctionTypes` — where props are a parameter and therefore compared
// contravariantly. A transcription can go stale silently, so the runtime check
// further down reads app-core's actual source for the one field that diverged.
// The real end-to-end proof — an actual `<TicketSheet editorSlot={TicketEditorSlot} />`
// — LANDED 2026-09-19 in `apps/web`, which is the app that takes the dependency
// edge on both packages. It cannot live here: the edge is one-way on purpose.
// What stays here is the fast, loud half — a drift between the two declarations
// still fails this file before any build.
// ─────────────────────────────────────────────────────────────────────────────
type AppCoreEditorSlotSubmission =
  | { type: 'comment.added'; payload: { body: unknown } }
  | { type: 'note.body_set'; payload: { body: unknown } }
  | { type: 'ticket.field_set'; payload: { fieldId: 'description'; value: unknown } };

type AppCoreEditorSlotUpload = {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  sha256: string;
};

type AppCoreEditorSlotProps = {
  mode: 'comment' | 'description' | 'note';
  doc: unknown;
  readOnly: boolean;
  workspaceId: string;
  ticketId: string;
  // 18.198 — the note an upload belongs to, in note mode (Plan 5, spec §4.4).
  // Optional here because it is optional there: `ticketId` is required and this
  // one is not, which is a fact about the two modes rather than a slip.
  noteId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  labelledBy?: string;
  footerNote?: string;
  // 26.118 — the submit button's label override (MCP-everything T5), transcribed with the same name.
  submitLabel?: string;
  queryUsers?: (query: string) => Promise<Array<{ userId: string; name: string }>>;
  // 9.280 — the wiki-link four (Plan 4 Task 5). Transcribed here with the same
  // names and inline shapes so the case below, which compares THIS type's field
  // names against `packages/app-core/src/views/editor-slot.tsx`'s, fails if
  // either half gains a prop the other does not have.
  // 9.291-9.293 — the note-mode autosave hooks (Plan 4 Task 8), transcribed
  // with the same names and types as the editor's own declaration.
  onDraft?: (doc: unknown) => void;
  onSave?: (doc: unknown) => void;
  saveState?: 'saved' | 'saving' | 'unsaved';
  queryNotes?: (query: string) => Promise<Array<{ noteId: string; title: string }>>;
  resolveNoteTitle?: (noteId: string) => string | null;
  previewNote?: (noteId: string) => Promise<string | null>;
  onNavigateNote?: (noteId: string) => void;
  // 9.412 — the heading-anchor link builder, transcribed like the fields above.
  headingLink?: (id: string) => string | null;
  // 9.309 — the ticket-ref two (Plan 7 Task 1), transcribed with the same name
  // and inline shape so the case above, which compares this type's field
  // names against `packages/app-core/src/views/editor-slot.tsx`'s, fails if
  // either half gains a prop the other does not have.
  queryTickets?: (query: string) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
  resolveTicketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;
  uploadAttachment?: (file: File) => Promise<AppCoreEditorSlotUpload>;
  emitAttachmentAdded?: (uploaded: AppCoreEditorSlotUpload) => Promise<void>;
  // V7 — mirrored from app-core's seam, and the TYPE is part of the parity the
  // assignment below asserts: `Promise<void>` here would stop representing the
  // other half, and the assignment would pass while the two genuinely differed.
  submit?: (submission: AppCoreEditorSlotSubmission) => Promise<boolean>;
  // 2026-09-23 — the CREATE dialog's half. It needs the document BEFORE any
  // submit, because there is nothing to submit to yet: the ticket does not exist
  // until Create is pressed. Mirrored here for the same reason every other field
  // is — the parity case below compares the three name sets, and a one-sided
  // addition fails it.
  onChange?: (doc: unknown) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
};

/** This assignment IS the assertion: if the halves diverge, typecheck fails. */
const _slotFitsAppCoreContract: (props: AppCoreEditorSlotProps) => ReactElement | null = TicketEditorSlot;
void _slotFitsAppCoreContract;

// `import.meta.url` is not a file: URL under the jsdom environment, so the
// path is resolved from vitest's cwd (this package's root) instead.
const APP_CORE_SLOT_SOURCE = resolve(process.cwd(), '../app-core/src/views/editor-slot.tsx');
const OWN_SOURCE = resolve(process.cwd(), 'test/ticket-editor-slot.test.tsx');
const THIS_HALF_SOURCE = resolve(process.cwd(), 'src/components/TicketEditorSlot.tsx');

describe('the <EditorSlot> contract, written twice', () => {
  /**
   * 9.71 — the `<EditorSlot>` contract written twice does not drift unnoticed: this runtime case reads `packages/app-core/src/views/editor-slot.tsx` and fails if its `doc` stops saying `unknown`. Neither this nor the type-level assignment above is the end-to-end mount — that is 9.61, which `apps/web` now builds.
   */
  it("app-core's half still spells `doc` as unknown, which is why this half widened", () => {
    // POSITIVE CONTROL 1: a missing file must fail here, not silently read as
    // an empty string somewhere downstream.
    expect(existsSync(APP_CORE_SLOT_SOURCE), `not found: ${APP_CORE_SLOT_SOURCE}`).toBe(true);
    const source = readFileSync(APP_CORE_SLOT_SOURCE, 'utf8');
    // POSITIVE CONTROL 2: fail loudly if this is not the declaration file, since
    // a regex that matches nothing in the wrong file reads exactly like a pass.
    const start = source.indexOf('export type EditorSlotProps = {');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n};', start);
    expect(end).toBeGreaterThan(start);
    const declaration = source.slice(start, end);
    // Second control: the block we sliced really is the props block.
    expect(declaration).toMatch(/^\s*readOnly: boolean;$/m);
    expect(declaration).toMatch(/^\s*doc: unknown;$/m);
  });

  /**
   * 9.75 — neither half of the twice-written contract carries a field the other lacks: THREE sets are compared for equality, not two, because assignability alone never rejects extra properties on a type.
   */
  it('neither half of the contract has a field the other lacks', () => {
    const source = readFileSync(APP_CORE_SLOT_SOURCE, 'utf8');
    const appCoreFields = fieldNamesOf(source, 'export type EditorSlotProps = {');
    const transcribedFields = fieldNamesOf(
      readFileSync(OWN_SOURCE, 'utf8'),
      'type AppCoreEditorSlotProps = {',
    );
    // THREE sets, not two, because the chain has three links and comparing only
    // the outer two leaves the middle one unguarded. (a) runtime: app-core's
    // names == the transcription's names. (b) compile-time: the transcription is
    // ASSIGNABLE to this package's props — but assignability is contravariant
    // and never rejects extra properties on a TYPE, so a transcription carrying
    // a field this package's own `EditorSlotProps` does not declare still
    // assigns cleanly. Without (c) below, someone who dutifully updates the
    // transcription after app-core adds a prop turns this case green again
    // while this package's declaration silently never gains the field.
    const thisHalfFields = fieldNamesOf(
      readFileSync(THIS_HALF_SOURCE, 'utf8'),
      'export type EditorSlotProps = {',
    );
    // CONTROLS: all three extractions found a real declaration, so an empty set
    // anywhere fails here rather than passing as a vacuous equality.
    expect(appCoreFields.length).toBeGreaterThan(10);
    expect(transcribedFields.length).toBeGreaterThan(10);
    expect(thisHalfFields.length).toBeGreaterThan(10);
    // The type-level assignment above catches a field whose TYPE diverged; it
    // cannot catch one app-core ADDS, because an optional addition still
    // assigns and a required one this file never transcribed is simply unknown
    // to it. Set equality is what closes that.
    expect([...transcribedFields].sort()).toEqual([...appCoreFields].sort());
    // (c) the middle link: this package's own declaration carries exactly the
    // same field names as the half it is a copy of. `editorRef` is deliberately
    // NOT here — it lives on `TicketEditorSlotProps`, a separate type, which is
    // the whole reason app-core never has to name `@tiptap/core`'s `Editor`.
    expect([...thisHalfFields].sort()).toEqual([...appCoreFields].sort());
  });

  /**
   * 9.309 — Plan 7 Task 1's two ticket-reference options, threaded through
   * this twice-written contract the same way the wiki-link four are: named in
   * all three declarations the set-equality case above already compares.
   */
  it('9.309 the twin transcription covers queryTickets and resolveTicketHref in both files', () => {
    const appCoreFields = fieldNamesOf(
      readFileSync(APP_CORE_SLOT_SOURCE, 'utf8'),
      'export type EditorSlotProps = {',
    );
    const transcribedFields = fieldNamesOf(
      readFileSync(OWN_SOURCE, 'utf8'),
      'type AppCoreEditorSlotProps = {',
    );
    const thisHalfFields = fieldNamesOf(
      readFileSync(THIS_HALF_SOURCE, 'utf8'),
      'export type EditorSlotProps = {',
    );
    for (const field of ['queryTickets', 'resolveTicketHref']) {
      expect(appCoreFields, `app-core's own declaration is missing ${field}`).toContain(field);
      expect(transcribedFields, `the transcription is missing ${field}`).toContain(field);
      expect(thisHalfFields, `this package's own declaration is missing ${field}`).toContain(field);
    }
  });
});

/** Field names of one `type X = { … };` block, by name only — types are the assignment's job. */
function fieldNamesOf(source: string, header: string): string[] {
  const start = source.indexOf(header);
  expect(start, `declaration not found: ${header}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end, `unterminated declaration: ${header}`).toBeGreaterThan(start);
  return [...source.slice(start + header.length, end).matchAll(/^ {2}(\w+)\??:/gm)].map(
    (match) => match[1] as string,
  );
}

function makeProps(overrides: Partial<TicketEditorSlotProps> = {}): TicketEditorSlotProps {
  return {
    mode: 'comment',
    doc: null,
    readOnly: false,
    workspaceId: 'ws_1',
    ticketId: '01J9GTKA000000000000000000',
    queryUsers: async () => [],
    uploadAttachment: vi.fn(async (_file: File) => UPLOADED),
    emitAttachmentAdded: vi.fn(async (_uploaded: EditorSlotUpload) => {}),
    // V7 — the stub ANSWERS, and the answer is part of the contract now: a
    // `void` return would read as "not accepted" and the composer would never
    // clear, so a default that said nothing would fail every clear-related case
    // for a reason that has nothing to do with what they test.
    submit: vi.fn(async (_submission: EditorSubmission) => true),
    ...overrides,
  };
}

/**
 * Mount and wait for a live editor. The suite drives ProseMirror imperatively
 * through `editorRef` — the idiom `ticket-editor.test.tsx` already proves works
 * here — rather than firing synthetic input events at a contenteditable, which
 * jsdom does not turn into ProseMirror transactions.
 */
async function mountSlot(props: TicketEditorSlotProps) {
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const view = render(<TicketEditorSlot {...props} editorRef={editorRef} />);
  await vi.waitFor(() => {
    expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editorRef, editor: editorRef.current as Editor };
}

function proseMirrorText(view: { container: HTMLElement }): string {
  return (view.container.querySelector('.ProseMirror') as HTMLElement).textContent ?? '';
}

function submitButton(view: { container: HTMLElement }): HTMLButtonElement {
  return view.container.querySelector('.editor-slot__submit') as HTMLButtonElement;
}

describe('TicketEditorSlot', () => {
  /**
   * THE PRODUCTION CONFIGURATION, and the only case in this file that mounts it.
   *
   * Every other runtime case here passes `editorRef` — a prop deliberately kept
   * OUT of `EditorSlotProps` (TicketEditorSlot.tsx) because app-core cannot name
   * `@tiptap/core`'s `Editor`. So `props.editorRef ?? ownRef` took its LEFT
   * branch in all of them, and `handleSubmit` returns early on `!editor`: every
   * behaviour those cases prove rests on a ref app-core will never supply. The
   * fallback `ownRef` — the branch that actually runs when the sheet mounts this
   * — had zero executions, and any mutation of it survived the whole battery.
   *
   * The readiness signal here has to be DOM-observable, because the ref is the
   * thing under test. `the words` rendering is the proxy for "the child's effect
   * (TicketEditor.tsx:96-103) has filled `ownRef`"; clicking before that, the
   * early return swallows the click and the `submit` waitFor fails loudly.
   *
   * This is NOT the end-to-end mount (case 9.61): nothing here passes
   * `TicketEditorSlot` to `TicketSheet`'s `editorSlot` prop. **That mount now
   * exists** — `apps/web` passes it — and 9.61 is already ✅ 2026-09-19. This
   * case remains the one that exercises the slot's own production branch.
   */
  /**
   * 9.76 — the slot mounted the way app-core mounts it, with NO `editorRef`, populates its own `ownRef`, submits `comment.added`, fires `onDone` and clears. Every other runtime case in this file injects `editorRef`, so this is the only case that exercises the production branch. Not the end-to-end mount — that is 9.61, which `apps/web` now builds.
   */
  it('mounted the way app-core mounts it — no editorRef — the slot uses its OWN ref, submits, and clears', async () => {
    const submit = vi.fn(async (_submission: EditorSubmission) => true);
    const onDone = vi.fn();
    const view = render(<TicketEditorSlot {...makeProps({ submit, onDone, doc: DOC })} />);
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull();
      expect(proseMirrorText(view)).toContain('the words');
    });
    submitButton(view).click();
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.lastCall?.[0]?.type).toBe('comment.added');
    expect(JSON.stringify(submit.mock.lastCall?.[0]?.payload)).toContain('the words');
    expect(onDone).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(proseMirrorText(view)).toBe('');
    });
    view.unmount();
  });

  /**
   * 9.66 — a successful comment submit clears the composer.
   */
  it('comment mode: submit sends comment.added and clears the composer on success', async () => {
    const submit = vi.fn(async (_submission: EditorSubmission) => true);
    const onDone = vi.fn();
    const { view } = await mountSlot(makeProps({ submit, onDone, doc: DOC }));
    expect(proseMirrorText(view)).toContain('the words');
    submitButton(view).click();
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    const submission = submit.mock.lastCall?.[0];
    expect(submission?.type).toBe('comment.added');
    expect(JSON.stringify(submission?.payload)).toContain('the words');
    expect(onDone).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(proseMirrorText(view)).toBe('');
    });
    view.unmount();
  });

  it('description mode: submit sends ticket.field_set and keeps the content', async () => {
    const submit = vi.fn(async (_submission: EditorSubmission) => true);
    const { view } = await mountSlot(makeProps({ mode: 'description', doc: DOC, submit }));
    submitButton(view).click();
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    const submission = submit.mock.lastCall?.[0];
    expect(submission?.type).toBe('ticket.field_set');
    expect(submission).toMatchObject({ payload: { fieldId: 'description' } });
    // The saved value is what the field now holds; clearing it would show the
    // user an empty description they did not empty.
    expect(proseMirrorText(view)).toContain('the words');
    view.unmount();
  });

  /**
   * 9.67 — a REFUSED submit reports through `onError`, never fires `onDone`, and never clears the words — the clear lives inside the `try` after the `await`, so a rejection skips it.
   */
  it('a refused submit reports the error and never clears the words', async () => {
    const submit = vi.fn(async (_submission: EditorSubmission) => {
      throw new Error('This move must carry a comment explaining it, and none was provided.');
    });
    const onError = vi.fn();
    const onDone = vi.fn();
    const { view } = await mountSlot(makeProps({ submit, onError, onDone, doc: DOC }));
    submitButton(view).click();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    expect(proseMirrorText(view)).toContain('the words');
    // Nothing was done, so onDone did not fire — and the button came back.
    expect(onDone).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(submitButton(view).disabled).toBe(false);
    });
    view.unmount();
  });

  /**
   * 9.74 — two clicks in one React batch append ONE `comment.added`, not two: `disabled` is not committed yet at the second click, so the guard is a ref set synchronously before the first await.
   */
  it('two clicks in one tick append ONE comment, not two — the ledger cannot take it back', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submit = vi.fn(async (_submission: EditorSubmission) => {
      await gate;
      // V7 — the answer travels WITH the resolution. A stub that resolved with
      // nothing would read as "not accepted", so the composer would not clear
      // and this case would fail for a reason unrelated to the double-click it
      // exists to pin.
      return true;
    });
    const { view } = await mountSlot(makeProps({ submit, doc: DOC }));
    // Both clicks land in the same React batch: `disabled` is not committed yet
    // and a `submitting` flag read from the render closure is still false for
    // the second one. An append-only ledger has no way to unsay the duplicate.
    submitButton(view).click();
    // PINS THE DISCRIMINATION. jsdom's `HTMLElement.click()` returns early on a
    // disabled control, so if React ever committed `disabled` between these two
    // statements the second click would be swallowed by the ATTRIBUTE and this
    // case would keep passing while no longer testing `submittingRef` at all.
    // Asserting the button is still enabled makes that regression red instead.
    expect(submitButton(view).disabled).toBe(false);
    submitButton(view).click();
    release();
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  /**
   * 9.68 — the slot takes `doc` as `unknown` and narrows with `isDocJson` at the mount, so `null`, `undefined`, a string, a number and `{}` all open an EMPTY composer.
   */
  it('the doc prop arrives as unknown: a value that is not a document opens an empty composer', async () => {
    for (const notADoc of [null, undefined, 'the words', 42, {}, [{ type: 'doc' }]]) {
      const { view } = await mountSlot(makeProps({ doc: notADoc }));
      expect(proseMirrorText(view)).toBe('');
      view.unmount();
    }
  });

  it('a real document still renders — the narrowing accepts documents, it does not refuse everything', async () => {
    const { view } = await mountSlot(makeProps({ doc: DOC }));
    expect(proseMirrorText(view)).toContain('the words');
    view.unmount();
  });

  /**
   * 9.69 — a slot mounted without `submit` disables the submit button and says WHICH of the two reasons applies in its title, rather than offering a control that discards what is typed.
   */
  it('mounted without submit: the button is disabled and says why, instead of pretending', async () => {
    const props = makeProps();
    delete props.submit;
    const { view } = await mountSlot(props);
    const button = submitButton(view);
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('without a submit handler');
    // The reason is ATTACHED to the control, not merely hoverable: a disabled
    // button is removed from the focus order, so `title` alone is spoken to
    // nobody. `aria-describedby` must resolve to a node carrying the sentence.
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(button.ownerDocument.getElementById(describedBy!)?.textContent).toContain(
      'without a submit handler',
    );
    view.unmount();
  });

  it('read-only: the button is disabled, says why, and the editor is not editable', async () => {
    const { view, editor } = await mountSlot(makeProps({ readOnly: true, doc: DOC }));
    const button = submitButton(view);
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Read-only');
    // Attached as well as hoverable — see the arm above for why.
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(button.ownerDocument.getElementById(describedBy!)?.textContent).toContain('Read-only');
    expect(editor.isEditable).toBe(false);
    view.unmount();
  });

  /**
   * 9.70 — a pasted file routes through `emitAttachmentAdded` — the host owns the ledger.
   */
  it('uploads route through emitAttachmentAdded — the host owns the event', async () => {
    const emitAttachmentAdded = vi.fn(async (_uploaded: EditorSlotUpload) => {});
    const uploadAttachment = vi.fn(async (_file: File) => UPLOADED);
    const { view, editor } = await mountSlot(makeProps({ uploadAttachment, emitAttachmentAdded }));
    pasteFile(editor, new File([new Uint8Array(4)], 'a.png', { type: 'image/png' }));
    await vi.waitFor(() => {
      expect(uploadAttachment).toHaveBeenCalledTimes(1);
      expect(emitAttachmentAdded).toHaveBeenCalledTimes(1);
    });
    expect(emitAttachmentAdded.mock.lastCall?.[0]).toEqual(UPLOADED);
    view.unmount();
  });

  it('mounted without an uploader: a pasted file is refused through onError, never silently dropped', async () => {
    const emitAttachmentAdded = vi.fn(async (_uploaded: EditorSlotUpload) => {});
    const onError = vi.fn();
    const props = makeProps({ emitAttachmentAdded, onError });
    delete props.uploadAttachment;
    const { view, editor } = await mountSlot(props);
    pasteFile(editor, new File([new Uint8Array(4)], 'a.png', { type: 'image/png' }));
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    expect(String((onError.mock.lastCall?.[0] as Error).message)).toContain('without an uploader');
    // The refusal is a refusal: no claim was emitted and no node was inserted.
    expect(emitAttachmentAdded).not.toHaveBeenCalled();
    expect(JSON.stringify(editor.getJSON())).not.toContain('image');
    view.unmount();
  });

  /**
   * MUTATION-TESTED, and the first mutation SURVIVED, which is the useful part.
   * Recreating `TicketEditor`'s extensions on every render (`useMemo(…, [props])`
   * instead of `[]`) did NOT redden this test: `useEditor` captures its options
   * once and does not rebuild the Editor when the array identity changes. What
   * DOES redden it is giving `useEditor` a deps array that varies
   * (`useEditor({…}, [props.placeholder])` plus the changed placeholder below) —
   * so the mechanism keeping the editor alive is `useEditor`'s empty deps, not
   * the extensions memo. Task 14 depends on that stability and does not own it;
   * the extensions memo's own justification is Task 12's to defend.
   */
  /**
   * 9.72 — a parent re-render does not re-initialise the editor. Mutation testing showed the mechanism is `useEditor`'s empty deps inside `TicketEditor`, NOT the extensions `useMemo`.
   */
  it('a parent re-render does not re-initialise the editor', async () => {
    const editorRef: React.MutableRefObject<Editor | null> = { current: null };
    const view = render(<TicketEditorSlot {...makeProps({ doc: DOC })} editorRef={editorRef} />);
    await vi.waitFor(() => {
      expect(editorRef.current).not.toBeNull();
    });
    const first = editorRef.current;
    first?.commands.insertContent(' and more');
    // Fresh callback identities on every prop — the thing that would re-create
    // an editor whose options were not read through a ref.
    view.rerender(
      <TicketEditorSlot
        {...makeProps({ doc: DOC, placeholder: 'changed', submit: vi.fn(async (_s: EditorSubmission) => true) })}
        editorRef={editorRef}
      />,
    );
    expect(editorRef.current).toBe(first);
    expect(proseMirrorText(view)).toContain('and more');
    view.unmount();
  });

  /**
   * 9.73 — `autoFocus` actually focuses the composer, and its absence leaves the composer unfocused.
   */
  it('autoFocus focuses the composer; without it the composer is left alone', async () => {
    const focused = await mountSlot(makeProps({ autoFocus: true }));
    await vi.waitFor(() => {
      expect(focused.editor.isFocused).toBe(true);
    });
    focused.view.unmount();

    const unfocused = await mountSlot(makeProps());
    expect(unfocused.editor.isFocused).toBe(false);
    unfocused.view.unmount();
  });

  /**
   * 9.257 — E4-4 (exec4) — BOTH of the sheet's writing surfaces carry an
   * accessible name, and the two names DIFFER.
   *
   * The defect was not "one unnamed textbox" but "two of them on one sheet with
   * nothing to tell them apart": the judge's line is `TicketEditor.tsx:89-100`,
   * a `useEditor` call with no `editorProps.attributes` at all, so both hosts
   * took Tiptap's library default (`role=textbox`, no name) and a screen reader
   * announced "edit text, multiline" twice (WCAG 4.1.2, Level A).
   *
   * **Both slots are mounted in ONE container on purpose** — mounting them
   * separately would pass a fix that gave both the same name, which is the same
   * failure one attribute later. The two `getByRole(…, { name })` calls are what
   * pins the distinctness, and they are queried by ROLE AND NAME, so they keep
   * passing whichever mechanism supplies the name (`aria-label` here;
   * `aria-labelledby` for the description row, T-P21).
   *
   * `aria-multiline` is asserted on every host found by role, not on a count of
   * its own: the two names above already prove there are two, so a third
   * assertion that merely restated the count would be a number reported twice
   * from one reading.
   */
  it('E4-4 both composers carry an accessible name — Description and Comment — and announce multiline', async () => {
    const view = render(
      <>
        <TicketEditorSlot {...makeProps({ mode: 'description' })} />
        <TicketEditorSlot {...makeProps({ mode: 'comment' })} />
      </>,
    );
    await vi.waitFor(() => {
      expect(view.container.querySelectorAll('.ticket-editor .ProseMirror')).toHaveLength(2);
    });

    const hosts = view.getAllByRole('textbox');
    expect(hosts).toHaveLength(2);
    // Distinctness, in document order: the description row renders first.
    expect(view.getByRole('textbox', { name: 'Description' })).toBe(hosts[0]);
    expect(view.getByRole('textbox', { name: 'Comment' })).toBe(hosts[1]);
    for (const host of hosts) {
      expect(host).toHaveAttribute('aria-multiline', 'true');
    }
    view.unmount();
  });
});

/**
 * Reach the paste path exactly as `ticket-editor.test.tsx` does: jsdom has no
 * real clipboard, so the plugin's `handlePaste` prop is invoked directly with a
 * synthetic event carrying the file.
 */
function pasteFile(editor: Editor, file: File): void {
  const event = {
    clipboardData: { items: [{ kind: 'file', type: file.type, getAsFile: () => file }] },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0)));
}

/**
 * V7 — A REFUSED CLAIM MUST NOT COST THE AUTHOR THEIR WORDS.
 *
 * The clear lives inside the `try`, after the `await`, and the paragraph beside
 * it says so: *"a refused claim must never cost the user their words"*. The
 * mechanism it relied on was **the absence of a throw**, and a refusal does not
 * throw — `TicketSheet.submitComment` records the server's answer in
 * `serverRefusal` and RETURNS NORMALLY. So the promise resolved, the composer
 * cleared, and the person lost what they had written while the refusal sat on
 * screen beside an empty box.
 *
 * This is the one place in this codebase where the two categories the product
 * keeps apart everywhere else — *the server answered "no"* and *nobody
 * answered* (`Ruling 27/33`; the sheet's separate `serverRefusal` /
 * `transportError` / `editorError` slots) — collapsed into one, and the
 * collapse deleted text.
 *
 * THE CASE DRIVES THE SLOT DIRECTLY rather than through the sheet, because the
 * slot is where the clear is. `false` is the whole of the fix's contract, and
 * the second case is the CONTROL: an ACCEPTED submission must still clear, or a
 * fix that simply stopped clearing would satisfy the first assertion and leave
 * the composer unusable for the next comment.
 */
describe('17.023 / V7 — the composer clears on acceptance, not on resolution', () => {
  it('17.023: a REFUSED claim leaves the words in the composer', async () => {
    const submit = vi.fn(async (_submission: EditorSubmission) => false);
    const onDone = vi.fn();
    const onError = vi.fn();
    const { view } = await mountSlot(makeProps({ submit, doc: DOC, onDone, onError }));

    expect(proseMirrorText(view)).toContain('the words');
    submitButton(view).click();
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    // Give the resolution a turn to be acted on wrongly.
    await Promise.resolve();

    // THE PROPERTY: the words are still there.
    expect(proseMirrorText(view)).toContain('the words');
    // Nothing was sent, so nothing was done — and it is not an ERROR either:
    // the server REFUSED, which the sheet renders in its own slot. Routing this
    // through `onError` would put one outcome in two slots, which is the
    // anti-pattern the sheet's `submitTicketEvent` docblock records.
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    view.unmount();
  });

  it('CONTROL — an ACCEPTED claim still clears, and fires onDone', async () => {
    const submit = vi.fn(async (_submission: EditorSubmission) => true);
    const onDone = vi.fn();
    const { view } = await mountSlot(makeProps({ submit, doc: DOC, onDone }));

    submitButton(view).click();
    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    // A fix that stopped clearing altogether would satisfy the case above and
    // leave the person typing the next comment into the previous one.
    expect(proseMirrorText(view)).toBe('');
    view.unmount();
  });
});

/**
 * 13.1270 / 13.1271 / 13.1273 — THE COMPOSER CHROME
 * (spec `2026-09-22-sheet-prototype-parity-design.md` §8, `TicketEditorSlot`).
 *
 * The prototype dresses BOTH composers with one chrome: a toolbar tray on top,
 * a sunken field for the words, and a **footer row** carrying a hint on the
 * left and the submit control on the right (`desktop.dc.html:1168-1173`,
 * `:1298-1331`). Two sentences carry the behaviour:
 *
 *   - the footer takes the SUBMIT control, whose label is `Post` in comment
 *     mode and `Save description` in description mode (spec decision 9);
 *   - the LEFT of the footer is a slot, not a constant. `footerNote` (the
 *     additive optional field this task adds to the twice-written contract)
 *     supplies it in comment mode — the prototype's `cmtHint` — and the
 *     Markdown hint keeps it in description mode, because the prototype's
 *     comment composer has no Markdown hint and its description composer does.
 *
 * **THE HINT MUST NOT BE DRAWN TWICE, and that is what `hintSlot` is for.**
 * `TicketEditor` renders toolbar → content → hint, so a slot that drew the hint
 * in its own footer WITHOUT telling the editor to stop would print the sentence
 * in both places at once. `hintSlot: 'none'` is the mechanism; the assertions
 * below are the reading.
 *
 * These cases mount the slot DIRECTLY with `mode`/`doc`/`readOnly` rather than
 * through `makeProps()`, deliberately: what is under test is the presence and
 * position of the chrome, and `makeProps`'s defaults (`doc: null`, a resolving
 * `submit`) would say nothing about it. `submit` is supplied so the control is
 * the real one rather than the disabled-and-explained arm.
 */
describe('13.1270 the composer chrome', () => {
  it('13.1270 draws a footer row holding the submit control, labelled Post in comment mode and Save description in description mode', () => {
    const c = render(<TicketEditorSlot mode="comment" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} />);
    const footer = c.container.querySelector('.editor-slot__footer');
    expect(footer).not.toBeNull();
    expect(footer!.contains(c.getByRole('button', { name: 'Post' }))).toBe(true);
    c.unmount();
    const d = render(<TicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} />);
    expect(d.container.querySelector('.editor-slot__footer')!.contains(d.getByRole('button', { name: 'Save description' }))).toBe(true);
  });

  it('26.118 submitLabel labels the submit button; absent, the defaults stand', () => {
    const edit = render(<TicketEditorSlot mode="comment" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} submitLabel="Save" />);
    expect(edit.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(edit.queryByRole('button', { name: 'Post' })).toBeNull();
    edit.unmount();
    // CONTROL — no override: both modes keep their own words.
    const post = render(<TicketEditorSlot mode="comment" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} />);
    expect(post.getByRole('button', { name: 'Post' })).toBeTruthy();
    post.unmount();
    const desc = render(<TicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} />);
    expect(desc.getByRole('button', { name: 'Save description' })).toBeTruthy();
  });

  it('13.1271 the footer note sits in the footer in comment mode; the Markdown hint sits in the footer in description mode; neither is drawn twice', () => {
    const c = render(<TicketEditorSlot mode="comment" doc={null} readOnly={false} workspaceId="ws" ticketId="t" footerNote="Posting records an event citing you." />);
    const footer = c.container.querySelector('.editor-slot__footer')!;
    expect(footer.textContent).toContain('Posting records an event citing you.');
    expect(c.container.querySelectorAll('.ticket-editor__hint')).toHaveLength(0);
    c.unmount();
    const d = render(<TicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="ws" ticketId="t" />);
    expect(d.container.querySelector('.editor-slot__footer')!.textContent).toContain('Markdown:');
    expect(d.container.querySelectorAll('.editor-slot__hint')).toHaveLength(1);
  });

  /**
   * 13.1273 — THE CONTROL, and it is a DIRECTION the pair above does not read.
   *
   * 13.1271 counts `.editor-slot__hint` in description mode; the sentence that
   * must NOT appear twice is the Markdown hint, and `.editor-slot__hint` is the
   * FOOTER's class. So the mutation `hintSlot={isComment ? 'none' : 'below'}`
   * — the natural way to write the prop if you think of the footer note as a
   * comment-mode concern — leaves the editor's own `.ticket-editor__hint` in
   * place in description mode while the footer draws `MARKDOWN_HINT` too. The
   * footer count is still 1, the comment arm still reads 0, and 13.1271 stays
   * green over the exact defect it exists to prevent.
   *
   * This case reads the OTHER half of the same fact: in description mode the
   * editor's own hint is gone. Two independent readings of one property, which
   * is why it is a control with its own id rather than a second assertion in
   * 13.1271.
   */
  it('13.1273 CONTROL — in description mode the Markdown hint is in the footer ONLY; the editor draws none', () => {
    const d = render(<TicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="ws" ticketId="t" />);
    expect(d.container.querySelectorAll('.ticket-editor__hint')).toHaveLength(0);
    // And the footer's slot really carries it, so the count above is not a
    // reading of an empty composer with the sentence printed nowhere at all.
    expect(d.container.querySelector('.editor-slot__hint')!.textContent).toContain('Markdown:');
    d.unmount();
  });
});

/**
 * 13.1276 / 13.1277 — the typing area wears the SHARED field class (owner,
 * 2026-09-22: the description and comment areas follow `#gn-new-project-name`).
 * The class is what makes the coat come from `ui.css` in every style×theme
 * rather than from a copy; the placeholder attribute is what the new CSS rule
 * draws from, and the editor had NO placeholder rule anywhere before this, so
 * "No description yet" and "Add a comment…" were configured and never painted.
 */
describe('13.1276 the typing area is a field', () => {
  it('13.1276 the content node carries gn-field__input beside its own class, in both modes', async () => {
    const c = render(<TicketEditorSlot {...makeProps({ mode: 'comment' })} />);
    await vi.waitFor(() => expect(c.container.querySelector('.ticket-editor__content')).not.toBeNull());
    expect(c.container.querySelector('.ticket-editor__content')!.classList.contains('gn-field__input')).toBe(true);
    c.unmount();
    const d = render(<TicketEditorSlot {...makeProps({ mode: 'description' })} />);
    await vi.waitFor(() => expect(d.container.querySelector('.ticket-editor__content')).not.toBeNull());
    expect(d.container.querySelector('.ticket-editor__content')!.classList.contains('gn-field__input')).toBe(true);
  });

  it('13.1277 an EMPTY editor exposes its placeholder as data-placeholder on an is-editor-empty paragraph; a filled one does not (the control)', async () => {
    const empty = render(<TicketEditorSlot {...makeProps({ doc: null, placeholder: 'No description yet' })} />);
    await vi.waitFor(() => expect(empty.container.querySelector('.is-editor-empty')).not.toBeNull());
    expect(empty.container.querySelector('.is-editor-empty')!.getAttribute('data-placeholder')).toBe('No description yet');
    empty.unmount();
    const filled = render(<TicketEditorSlot {...makeProps({ doc: DOC })} />);
    await vi.waitFor(() => expect(filled.container.querySelector('.ProseMirror')).not.toBeNull());
    expect(filled.container.querySelector('.is-editor-empty')).toBeNull();
  });
});

/**
 * 13.1315 — THE SLOT SAYS WHICH COMPOSER IT IS, AND THE FILL RULE'S `>` REALLY
 * MATCHES (owner, 2026-09-22).
 *
 * Two halves, and the second is the control.
 *
 * The mode modifier is what the comment field's shorter height keys on
 * (13.1314's `.editor-slot--comment` rule): the CSS can only scope that rule if
 * the root carries the word. `isComment` already existed in the component, so
 * this is a class on the root and nothing else.
 *
 * The control is the DOM shape the stylesheet depends on. The fill rule is
 * written `.editor-slot .ticket-editor__content > .ProseMirror`, and a `>` in a
 * stylesheet is invisible to a text scan — the rule can exist, be spelled
 * correctly, and match nothing. `EditorContent` is what decides the shape:
 * Tiptap appends `editor.view.dom` into the wrapper node it renders, so the
 * contenteditable is a DIRECT child. Assert `parentElement`, not `closest`, so
 * an intermediate wrapper appearing (a change in Tiptap, or an editor mounted
 * through a different component) reddens here instead of silently leaving the
 * field half-height again.
 */
describe('13.1315 the slot names its mode and the fill rule can match', () => {
  it('13.1315 the root carries editor-slot--comment in comment mode and editor-slot--description in description mode, and .ProseMirror is the DIRECT child of the content node in both', async () => {
    for (const mode of ['comment', 'description'] as const) {
      const { view } = await mountSlot(makeProps({ mode }));
      try {
        const root = view.container.firstElementChild as HTMLElement;
        expect(root.classList.contains('editor-slot')).toBe(true);
        expect(root.classList.contains(`editor-slot--${mode}`)).toBe(true);
        // The OTHER mode's modifier must not be there either: a root carrying
        // both (the natural result of writing the ternary as `&&`, or of adding
        // the class unconditionally) would let the comment height win in
        // description mode on source order alone, and the two `contains` above
        // would still pass.
        expect(
          root.classList.contains(mode === 'comment' ? 'editor-slot--description' : 'editor-slot--comment'),
        ).toBe(false);
        // CONTROL: the `>` in `.editor-slot .ticket-editor__content > .ProseMirror`.
        const prose = view.container.querySelector('.ProseMirror') as HTMLElement;
        const body = view.container.querySelector('.ticket-editor__content') as HTMLElement;
        expect(prose.parentElement).toBe(body);
        // And the body has exactly that one child, which is what the fill rule's
        // own comment claims ("the whole box is the editable node"): a second
        // flex item would be a band of the field that is not the typing area,
        // and every assertion above would still hold over it.
        expect(body.children).toHaveLength(1);
      } finally {
        view.unmount();
      }
    }
  });
});

/**
 * 9.293 — THE note-MODE FIELDS ARE IN BOTH HALVES, AND `'note'` IS A MODE.
 *
 * Its own case rather than a second id on the field-name case above: that one
 * is 9.75's, and this file's header records "two ids on one test at two
 * granularities" as the defect a fix round closed. The plan-close review
 * raised it for exactly that reason — and also because the field-name case
 * alone is not enough for this claim: it compares NAMES, so a `mode` union
 * that lost `'note'` while keeping the field would still pass it.
 */
describe('9.293 the note-mode contract', () => {
  it("9.293 the note-mode fields are transcribed and app-core's mode union carries note", () => {
    const appCore = readFileSync(APP_CORE_SLOT_SOURCE, 'utf8');
    const editorHalf = readFileSync(THIS_HALF_SOURCE, 'utf8');
    const transcription = fieldNamesOf(
      readFileSync(OWN_SOURCE, 'utf8'),
      'type AppCoreEditorSlotProps = {',
    );
    for (const field of ['onDraft', 'onSave', 'saveState']) {
      expect(appCore, `app-core's half is missing ${field}`).toContain(field);
      expect(editorHalf, `the editor's half is missing ${field}`).toContain(field);
      expect(transcription, `the transcription is missing ${field}`).toContain(field);
    }
    // …and the MODE UNION, which a field-name comparison cannot see.
    expect(appCore).toContain("mode: 'comment' | 'description' | 'note'");
  });
});

/**
 * 9.291–9.292 — THE `note` SLOT MODE (spec §8.3 consequence 4, Plan 4 Task 8).
 *
 * A note saves itself: the host receives every change through `onDraft` and a
 * write on blur through `onSave`, and the footer reports the state. So the
 * three things this pins are the three that a copy of the comment composer
 * would get wrong — a submit button that has no event to write, a Markdown
 * hint addressed to a reader who is not choosing to submit, and a `saveState`
 * that never reaches the screen.
 */
describe('9.291-9.292 the note slot mode', () => {
  it('9.291 note mode has no submit control and no hint, drafts every change, and saves on blur', async () => {
    const onDraft = vi.fn();
    const onSave = vi.fn();
    const note = await mountSlot(
      makeProps({ mode: 'note', onDraft, onSave, saveState: 'saved' }),
    );
    // The toolbar IS present: the notes page is an editor, not a viewer.
    expect(note.view.container.querySelector('.ticket-editor__toolbar')).not.toBeNull();
    // …and there is no submit control and no Markdown hint.
    expect(note.view.container.querySelector('.editor-slot__submit')).toBeNull();
    expect(note.view.container.querySelector('.editor-slot__hint')?.textContent).toBe('');

    // EVERY CHANGE IS A DRAFT, read off the serialized document rather than
    // off the call count — a handler wired to the wrong event would still fire
    // once here, and the assertion below is what says which event it was.
    // TWO changes, not one: with a single change the two hooks have the same
    // count under either wiring, and the control below could not tell them
    // apart.
    note.editor.commands.insertContent('hello');
    note.editor.commands.insertContent(' there');
    await vi.waitFor(() => {
      expect(onDraft.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(JSON.stringify(onDraft.mock.calls.at(-1)?.[0])).toContain('hello there');

    // …and a blur is a save, carrying the same document.
    const slot = note.view.container.querySelector('.editor-slot');
    expect(slot).not.toBeNull();
    fireEvent.focusOut(slot!);
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    expect(JSON.stringify(onSave.mock.calls.at(-1)?.[0])).toContain('hello there');
    // THE CONTROL FOR THE SAVE HOOK, and it can now FAIL: two changes were
    // typed and `onSave` fired ONCE. The plan's named mutation — call `onSave`
    // on every change — makes these two counts equal, which is precisely what
    // the comparison catches.
    expect(onDraft.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onSave.mock.calls.length).toBe(1);
    note.view.unmount();

    // THE CONTROL ARM: comment mode still renders the submit control, so a
    // slot that had stopped rendering it everywhere fails here.
    const comment = await mountSlot(makeProps({ mode: 'comment' }));
    expect(comment.view.container.querySelector('.editor-slot__submit')).not.toBeNull();
    comment.view.unmount();
  });

  it('9.292 saveState renders its three texts, each one distinct', async () => {
    const seen: Record<string, string | null> = {};
    for (const state of ['saved', 'saving', 'unsaved'] as const) {
      const slot = await mountSlot(makeProps({ mode: 'note', saveState: state }));
      seen[state] =
        slot.view.container.querySelector('[data-testid="editor-save-state"]')?.textContent ?? null;
      slot.view.unmount();
    }
    expect(seen['saved']).toBe('Saved');
    expect(seen['saving']).toBe('Saving…');
    expect(seen['unsaved']).toBe('Not saved (kept on this device)');
    // THE THREE ARE DISTINCT, which is the whole claim — a map that returned
    // the same string for two states would satisfy every assertion above and
    // tell the reader nothing.
    expect(new Set(Object.values(seen)).size).toBe(3);
  });

  /**
   * 9.299 — NO STATE SUPPLIED MEANS NO STATE REPORTED.
   *
   * The first cut defaulted to `'saved'`, which is the one arm of the three
   * that makes a CLAIM: it tells the reader their work is on the server when
   * the host has said nothing at all. Found by the Task 9 review. A mount that
   * supplies no `saveState` now renders no state element — silence, which is
   * what the host gave it.
   */
  it('9.299 a note mount with no saveState renders no state rather than claiming Saved', async () => {
    const slot = await mountSlot(makeProps({ mode: 'note' }));
    expect(slot.view.container.querySelector('[data-testid="editor-save-state"]')).toBeNull();
    // ⚠ AND NO SUBMIT CONTROL. This assertion is why the FIRST cut of the fix
    // was wrong and the suite was green: the condition was written
    // `isNote && saveState !== undefined ? <state/> : <submit/>`, so a note
    // mount WITHOUT a saveState fell into the ELSE arm and got the very button
    // note mode exists to remove. 9.291 passes `saveState: 'saved'` and so
    // never reached that arm. Silence about the save state must not become a
    // submit button.
    expect(slot.view.container.querySelector('.editor-slot__submit')).toBeNull();
    // THE CONTROL, in the same `it`: neither element is missing because the
    // footer stopped rendering — the toolbar and the field are both there.
    expect(slot.view.container.querySelector('.ticket-editor__toolbar')).not.toBeNull();
    expect(slot.view.container.querySelector('.ProseMirror')).not.toBeNull();
    expect(slot.view.container.querySelector('.editor-slot__footer')).not.toBeNull();
    slot.view.unmount();
  });
});

/**
 * 9.294 — THE MOBILE WEBVIEW BUNDLE CARRIES SCHEMA v2 (Plan 4 Task 8).
 *
 * The bundle is a BUILD ARTEFACT — one self-contained HTML string inlined into
 * `apps/mobile/src/editor/editor-html.generated.ts` — so nothing in this
 * package would notice if it went stale, and `apps/mobile`'s own `test` script
 * is the only thing that checks it (`generate-editor-html.mjs --check`). This
 * case is the fast half: it reads the committed file and fails when the
 * schema moved without a regeneration.
 *
 * Read across packages, the same way the twin-transcription case reads
 * `../app-core`. That is not a dependency — no import, just a file read — and
 * it is the only place in this package where the artefact matters.
 */
describe('9.294 the mobile bundle is regenerated', () => {
  it('9.294 the generated bundle carries the v2 nodes, and is not stale', () => {
    const bundlePath = resolve(process.cwd(), '../../apps/mobile/src/editor/editor-html.generated.ts');
    // POSITIVE CONTROL FIRST: a missing file must fail here rather than read as
    // an empty string somewhere downstream.
    expect(existsSync(bundlePath), `not found: ${bundlePath}`).toBe(true);
    const bundle = readFileSync(bundlePath, 'utf8');
    // `grep -c` counts LINES, and this file is one very long line — so the
    // count is 1 for a needle that is THERE and 0 for one that is not, which
    // is exactly what `>= 1` distinguishes.
    for (const needle of ['detailsSummary', 'taskList', 'wikiLink']) {
      expect(bundle.includes(needle), `the bundle does not carry "${needle}"`).toBe(true);
    }
    // …and a node this schema does NOT have is absent, so the assertion above
    // cannot pass on a bundle that merely contains arbitrary text.
    expect(bundle.includes('rawBlock')).toBe(false);
  });
});

/**
 * 13.1365 — THE SLOT CAN REPORT THE DOCUMENT, AND CAN BE MOUNTED WITHOUT ITS OWN
 * SUBMIT CONTROL.
 *
 * Both halves exist for ONE caller: the New ticket dialog (owner request
 * 2026-09-23). It composes a description at creation, and it is a different
 * mount from every one this component has had until now in two ways that each
 * break an assumption the slot was built on.
 *
 * **The document must leave the editor BEFORE any submit.** Until today the only
 * way a document ever escaped this component was `submit(...)`, on the press of
 * its own button — but the dialog's description has no ticket to submit to: the
 * ticket is created by the dialog's OWN Create control, and a rich-text edit is
 * not a claim until then. So the host needs the document as it stands, and
 * `onChange` is that channel. It is on the shared `EditorSlotProps` rather than
 * on this package's seam-only extras because app-core is the caller and may not
 * name this package at all — the same constraint that widened `doc`.
 *
 * **The slot's own submit control is wrong there.** A "Submit" beside a create
 * form's Create is two controls for one act, and the inner one would send a
 * `ticket.field_set` for a ticket that does not exist. So `submitSlot: 'none'`
 * omits it — a seam-only prop, exactly as `editorRef` is, because only a host
 * that knows which component it is mounting can ask for it.
 */
describe('13.1365 the slot reports the document, and can be mounted without a submit control', () => {
  it('13.1365 onChange receives the document as it is typed, and it is the DOCUMENT rather than a projection', async () => {
    const onChange = vi.fn();
    // No `submit` at all, deliberately: this is the dialog's mount, where there
    // is nowhere to submit to. The slot must still be EDITABLE and must still
    // report — a component that only reported when a submit handler was wired
    // would be useless to the one caller this exists for.
    const { editor } = await mountSlot(makeProps({ doc: null, onChange, submit: undefined }));

    // Nothing is reported before anything is typed. `TicketEditor` wires this to
    // ProseMirror's `onUpdate` and NOT to init, so an untouched composer reports
    // nothing — which is what lets the dialog treat "never reported" as "no
    // description" instead of having to guess whether an empty doc means empty.
    expect(onChange).not.toHaveBeenCalled();

    editor.commands.insertContent('the laminate is peeling');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());

    const reported = onChange.mock.calls.at(-1)?.[0];
    // The DOCUMENT, asserted structurally rather than by identity: a slot that
    // reported `docToPlainText(...)` would satisfy "onChange was called with a
    // string containing the words" and would hand the dialog a value its own
    // `ticket.field_set` door refuses ('Description' needs a document).
    expect(reported).toMatchObject({ type: 'doc' });
    expect(JSON.stringify(reported)).toContain('the laminate is peeling');
  });

  it("13.1365b submitSlot: 'none' omits the footer's submit control — and its ABSENCE is a control arm of its own", async () => {
    const view = render(<TicketEditorSlot {...makeProps({ submitSlot: 'none' })} />);
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull();
    });

    expect(view.container.querySelector('.editor-slot__submit')).toBeNull();
    // …and the composer is still a composer: the FIELD is there and editable, so
    // "no submit button" cannot be satisfied by a slot that rendered nothing.
    expect(view.container.querySelector('.ProseMirror')).not.toBeNull();
    // …and the footer itself survives, because it also carries the hint
    // sentence. Asserted on the FOOTER rather than by counting children, since
    // the hint is a sibling the button's removal must not take with it.
    expect(view.container.querySelector('.editor-slot__footer')).not.toBeNull();

    // CONTROL, in the SAME `it` because a control in a sibling case proves
    // nothing about this one: the same mount WITHOUT the prop still draws the
    // button. Without this arm, the assertions above pass against a component
    // that had simply lost its submit control for every mount.
    const withButton = render(<TicketEditorSlot {...makeProps()} />);
    await vi.waitFor(() => {
      expect(withButton.container.querySelector('.ticket-editor .ProseMirror')).not.toBeNull();
    });
    expect(withButton.container.querySelector('.editor-slot__submit')).not.toBeNull();
    view.unmount();
    withButton.unmount();
  });
});

/**
 * 18.198 — the note owner field, and the upload that carries exactly one of the
 * two (notes series Plan 5, spec §4.4).
 *
 * ## Why the assertion is on the FormData and not on a call
 *
 * `uploadAttachmentHttp(file, ticketId)` has been `form.append('ticketId', …)`
 * since it was written, and the route refuses a request carrying BOTH owners or
 * neither (`attachments/src/routes/attachments.ts:375-388`). A case asserting
 * "it called fetch with a FormData" would pass on a request the server answers
 * 400 to. Reading the body back is what makes the exactly-one rule the subject.
 *
 * The CONTROL is the ticket door in the same case, run through the same fake
 * fetch: without it, an implementation that posted `noteId` for both owners — or
 * for neither — would satisfy the note half alone.
 */
describe('18.198 the upload owner', () => {
  const FILE = new File(['x'], 'a.png', { type: 'image/png' });

  async function postedFields(
    upload: (file: File, ownerId: string, fetchImpl: typeof fetch) => Promise<unknown>,
    ownerId: string,
  ): Promise<Record<string, unknown>> {
    let body: FormData | null = null;
    const fetchImpl = (async (_url: string, init: { body: FormData }) => {
      body = init.body;
      return {
        ok: true,
        status: 201,
        json: async () => UPLOADED,
      };
    }) as unknown as typeof fetch;
    await upload(FILE, ownerId, fetchImpl);
    if (body === null) throw new Error('nothing was posted');
    const entries: Record<string, unknown> = {};
    for (const [key, value] of (body as FormData).entries()) entries[key] = value;
    return entries;
  }

  it('posts exactly one owner: noteId for a note, ticketId for a ticket', async () => {
    const noteFields = await postedFields(
      uploadNoteAttachmentHttp as unknown as (
        file: File,
        ownerId: string,
        fetchImpl: typeof fetch,
      ) => Promise<unknown>,
      '01J9NOTECOLDROOM000000000000',
    );
    expect(noteFields.noteId).toBe('01J9NOTECOLDROOM000000000000');
    // MUTATION TARGET: a helper that appended both owners fails here, and the
    // route it would send to answers 400.
    expect(noteFields.ticketId).toBeUndefined();
    expect(noteFields.file).toBeDefined();

    // CONTROL, same case, same fake fetch: the ticket door still posts its own.
    const ticketFields = await postedFields(
      uploadAttachmentHttp as unknown as (
        file: File,
        ownerId: string,
        fetchImpl: typeof fetch,
      ) => Promise<unknown>,
      '01J9TICKET00000000000000000',
    );
    expect(ticketFields.ticketId).toBe('01J9TICKET00000000000000000');
    expect(ticketFields.noteId).toBeUndefined();
  });
});

/**
 * 9.333–9.335 — Unit 5 (owner: "I thought we already made the attachment
 * feature but i dont see where we can attach files in our build"): the
 * composer's own Attach button. Case ids live in
 * `test-cases/09-editor-attachments.md`, block `9.313`–`9.337`.
 */
describe('9.333-9.335 the Attach button', () => {
  it('9.333 clicking Attach opens the file picker, and a chosen file reaches uploadAttachment through the SAME path a paste uses', async () => {
    const uploadAttachment = vi.fn(async (_file: File) => UPLOADED);
    const emitAttachmentAdded = vi.fn(async (_uploaded: EditorSlotUpload) => {});
    const { view } = await mountSlot(makeProps({ uploadAttachment, emitAttachmentAdded }));
    const button = view.container.querySelector('.editor-slot__attach') as HTMLButtonElement;
    expect(button, 'no Attach button rendered').not.toBeNull();
    expect(button.textContent).toContain('Attach');
    const input = view.container.querySelector('.editor-slot__attach-input') as HTMLInputElement;
    expect(input, 'no hidden file input rendered').not.toBeNull();
    const file = new File([new Uint8Array(4)], 'evidence.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => {
      expect(uploadAttachment).toHaveBeenCalledTimes(1);
      expect(emitAttachmentAdded).toHaveBeenCalledTimes(1);
    });
    // The EXACT file, not a copy or a re-read — one call, one path.
    expect(uploadAttachment.mock.lastCall?.[0]).toBe(file);
    expect(emitAttachmentAdded.mock.lastCall?.[0]).toEqual(UPLOADED);
    view.unmount();
  });

  it('9.334 with no uploader wired, the button is ABSENT — not disabled, not present at all', async () => {
    const props = makeProps();
    delete props.uploadAttachment;
    const { view } = await mountSlot(props);
    expect(view.container.querySelector('.editor-slot__attach')).toBeNull();
    expect(view.container.querySelector('.editor-slot__attach-input')).toBeNull();
    view.unmount();
  });

  it('9.335 the accept list has no client/server disagreement: it names EXACTLY the mime types apps/server/src/attachments/sniff.ts accepts', async () => {
    const serverPath = resolve(process.cwd(), '../../apps/server/src/attachments/sniff.ts');
    expect(existsSync(serverPath), `not found: ${serverPath}`).toBe(true);
    // Comments stripped FIRST — a naive quote-scan over the raw source
    // matches the apostrophe in "domain's EMBEDDABLE_IMAGE_MIME" (this
    // file's own comment) as a string delimiter, which is not a mutation
    // this case should ever need to distinguish from the real list.
    const stripped = readFileSync(serverPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    const match = stripped.match(/ALLOWED_ATTACHMENT_MIME:[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(match, 'ALLOWED_ATTACHMENT_MIME not found in sniff.ts').not.toBeNull();
    const serverMimes = [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(serverMimes.length).toBeGreaterThan(0);

    const { view } = await mountSlot(makeProps());
    const input = view.container.querySelector('.editor-slot__attach-input') as HTMLInputElement;
    const clientMimes = input.accept.split(',');
    expect(new Set(clientMimes)).toEqual(new Set(serverMimes));
    view.unmount();
  });
});
