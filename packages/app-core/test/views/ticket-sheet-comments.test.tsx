import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import type { TicketComment } from '../../src/views/comments-thread.js';

/**
 * The comment box, AT THE SHEET — where the composer is mounted, gated, and
 * wired to the ledger.
 *
 * ## ⚠ NO CASE ID IS MINTED IN THIS FILE, AND THAT IS DELIBERATE
 *
 * The controller ruled on 2026-09-20 (mid-task) that executor 2 has no free
 * ids. The allocation is with the owner, the request is filed, and
 * `test-cases/` is untouched by this change set for that reason. The ids here
 * are OWED, not omitted.
 *
 * ## The three things this file exists to pin, none of which the renderer's own
 * ## suite can see
 *
 *  1. **The sheet READS the thread and RELOADS THE THREAD after a post.**
 *     `history` is reloaded too. **`read` is deliberately NOT** — a comment
 *     changes no head state, so that reload could not return a different answer
 *     (`ticket-sheet.tsx`'s `submitComment` carries the argument). ⚠ **CORRECTED
 *     2026-09-21 BY AN INDEPENDENT REVIEWER: this read *"`read` and `history` are
 *     reloaded too"*, which contradicted the implementation docblock in the same
 *     change set — two halves of one change describing different code, with the
 *     test half being the wrong one.** And the reload is now PINNED rather than
 *     described: the reviewer measured that commenting out `comments.reload()`
 *     left all 107 tests in the three comment suites green, so the case below
 *     counts the reads instead.
 *  2. **No composer without a real editor.** `EditorSlot` falls back to
 *     `PlainTextEditorSlot`, which cannot compose; a comment box drawn from it
 *     would be a composer-shaped thing with no control in it. This is asserted
 *     as an ABSENCE, which is the only way to see it.
 *  3. **The submitted claim is the EDITOR's composition**, handed to the
 *     envelope unaltered — the same rule the description case states, because a
 *     sheet that re-spelled the payload would be sending a different claim.
 */

const COMMENT: TicketComment = {
  commentId: '01COMMENTONE',
  authorId: 'user_anselma',
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The bucket is the defect.' }] }],
  },
  recordedAt: '2026-09-20T16:23:57.306Z',
  files: [],
};

function read(): TicketRead {
  return {
    ticket: ticketStateSeed({ fields: {} }),
    title: 'File the GST return',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  };
}

function source(
  overrides: Record<string, unknown> = {},
  // `ingest` is on `DataSource`, not on the query — it is the SECOND argument
  // of `createFakeDataSource`, which is why a case that refuses a claim passes
  // it here rather than in the query overrides.
  ingestScript?: (events: unknown[]) => Array<Record<string, unknown>>,
) {
  return createFakeDataSource(
    {
      getTicket: async () => read(),
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [
        { id: 'user_kiro', name: 'Kiro', role: 'owner' },
        { id: 'user_anselma', name: 'Anselma Marak', role: 'member' },
      ],
      getTicketHistory: async () => [],
      getTickets: async (projectId: string) => ({ projectId, rows: [] }),
      getTicketTypes: async () => [
        { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] },
      ],
      getTicketComments: async () => [COMMENT],
      ...overrides,
    },
    ingestScript as never,
  );
}

function renderSheet(sheetSource = source(), extra: Record<string, unknown> = {}) {
  render(
    <TicketSheet
      dataSource={sheetSource}
      workspaceId={WS}
      ticketId={TICKET}
      currentUserId="user_kiro"
      onClose={vi.fn()}
      {...extra}
    />,
  );
  return sheetSource;
}

/**
 * A mode-aware stub, and the mode-awareness is the contract rather than
 * convenience: the real `TicketEditorSlot` labels its control by mode, and a
 * stub that ignored `mode` would put two description controls on a screen that
 * has one description row and one comment box.
 */
function fakeEditorSlot(seen: { modes: string[] }): EditorSlotComponent {
  return function FakeEditorSlot(props) {
    seen.modes.push(props.mode);
    if (props.mode === 'description') {
      // Inert: this file is about the comment box. The description mount's own
      // behaviour is proven in `ticket-sheet.test.tsx`.
      return <div data-testid="fake-description-editor" />;
    }
    return (
      <div data-testid="fake-comment-editor">
        <button
          type="button"
          onClick={() =>
            void props.submit?.({
              type: 'comment.added',
              payload: { body: { type: 'doc', content: [] } },
            })
          }
        >
          Post
        </button>
        {/* The uploader seam, driven directly. ⚠ THE `.catch` IS THE CONTRACT
            BEING MODELLED, not defensive noise: the real
            `createAttachmentPasteExtension` awaits this call and catches a
            rejection into `onUploadError` → `props.onError`
            (`attachment-paste.ts:49-62`), which is how a refused claim stops
            the image node from being inserted. A stub that void'ed the promise
            would leave an unhandled rejection and prove nothing about what the
            sheet does with a refusal. */}
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(
              props.emitAttachmentAdded?.({
                attachmentId: '01UPLOADED',
                filename: 'evidence.png',
                mime: 'image/png',
                size: 2048,
                url: '/v1/attachments/01UPLOADED',
                sha256: 'b'.repeat(64),
              }),
            ).catch((err: unknown) => props.onError?.(err));
          }}
        >
          Emit attachment
        </button>
      </div>
    );
  };
}

describe('TicketSheet — the comment thread and its box', () => {
  it('draws the thread the sheet reads, in the section the prototype draws it in', async () => {
    renderSheet();
    const section = await screen.findByTestId('sheet-comments');

    expect(within(section).getByText('Comments · 1')).toBeInTheDocument();
    expect(within(section).getByText('The bucket is the defect.')).toBeInTheDocument();
    // The name comes from the sheet's ONE actor join, the same `nameOf` every
    // other row uses — a second lookup here is how two rows name one person
    // differently.
    expect(within(section).getByText('Anselma Marak')).toBeInTheDocument();
  });

  it('draws NO composer when the app has mounted no editor, and no promise about one', async () => {
    renderSheet();
    await screen.findByTestId('sheet-comments');

    // ⚠ AN ABSENCE ASSERTION, and the only one that can see this: with no
    // `editorSlot` the sheet falls back to `PlainTextEditorSlot`, which cannot
    // compose, so a box drawn from it would offer a control that does not
    // exist. The sentence goes with it — "Posting records an event citing you."
    // is a claim about a control that is not on the screen.
    expect(screen.queryByTestId('fake-comment-editor')).toBeNull();
    expect(screen.queryByText('Posting records an event citing you.')).toBeNull();
  });

  it('mounts the composer in COMMENT mode, with the prototype’s sentence, and posts through the door', async () => {
    const seen = { modes: [] as string[] };
    const sheetSource = renderSheet(source(), { editorSlot: fakeEditorSlot(seen) });
    const section = await screen.findByTestId('sheet-comments');

    // ⚠ TWO MOUNTS, ONE SEAM, and the mode is what tells them apart — a sheet
    // that passed the wrong one would write the comment into the ticket's
    // description, and the assertion has to survive re-renders. **A COUNT OF
    // RENDERS IS NOT A COUNT OF MOUNTS**: the first version of this case
    // asserted `seen.modes` had one `'comment'` and measured THREE, because the
    // stub records on every render and the sheet re-renders as its reads settle.
    // So the probe is the DOM: exactly one comment editor is on the screen, the
    // description mount is a different one, and both modes were handed to the
    // seam. `Set` on the recorded modes, `getAllByTestId` on the elements.
    expect(new Set(seen.modes)).toEqual(new Set(['description', 'comment']));
    expect(screen.getAllByTestId('fake-comment-editor')).toHaveLength(1);
    expect(screen.getAllByTestId('fake-description-editor')).toHaveLength(1);
    expect(within(section).getByText('Posting records an event citing you.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(section).getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(sheetSource.ingested).toHaveLength(1));
    // `toEqual` on the payload, not `toMatchObject`: the envelope must carry
    // EXACTLY the editor's composition.
    expect(sheetSource.ingested[0]![0]!.type).toBe('comment.added');
    expect(sheetSource.ingested[0]![0]!.payload).toEqual({ body: { type: 'doc', content: [] } });
    // The entity is the ticket the sheet is mounted for — a comment filed
    // against anything else would land on another ticket's thread.
    expect(sheetSource.ingested[0]![0]!.entity).toEqual({ kind: 'ticket', id: TICKET });
  });

  it('emits `attachment.added` from the SERVER-SNIFFED upload result, and refuses one that did not land', async () => {
    const seen = { modes: [] as string[] };
    const sheetSource = renderSheet(source(), { editorSlot: fakeEditorSlot(seen) });
    const section = await screen.findByTestId('sheet-comments');

    const user = userEvent.setup();
    await user.click(within(section).getByRole('button', { name: 'Emit attachment' }));

    await waitFor(() => expect(sheetSource.ingested).toHaveLength(1));
    const claimed = sheetSource.ingested[0]![0]!;
    expect(claimed.type).toBe('attachment.added');
    expect(claimed.entity).toEqual({ kind: 'ticket', id: TICKET });
    // ⚠ `toEqual`, because the payload must be the truth the UPLOAD answered
    // with — the sniffed mime, the hash of the stored bytes — and not anything
    // re-derived here from the file the user chose. A sheet that recomputed
    // `size` or dropped `sha256` would be asserting facts nobody measured, and
    // `attachmentUploadedPayload` requires all five.
    expect(claimed.payload).toEqual({
      kind: 'upload',
      attachmentId: '01UPLOADED',
      filename: 'evidence.png',
      mime: 'image/png',
      size: 2048,
      sha256: 'b'.repeat(64),
    });
  });

  it('THROWS when the upload’s claim is refused, so no unfinished picture is inserted', async () => {
    const seen = { modes: [] as string[] };
    // A source that refuses the claim. `emitAttachmentAdded` must reject: the
    // editor awaits it before inserting the node, and resolving quietly would
    // put a picture into the document naming an attachment no event records.
    const refusing = source({}, () => [{ status: 'refused', rule: 'r', reason: 'the server said no' }]);
    renderSheet(refusing, { editorSlot: fakeEditorSlot(seen) });
    const section = await screen.findByTestId('sheet-comments');

    const user = userEvent.setup();
    await user.click(within(section).getByRole('button', { name: 'Emit attachment' }));

    // The failure reaches the sheet's ALERT slot rather than vanishing: the
    // editor reports it through `onError`, which the sheet draws.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no/);
  });

  it('RELOADS the thread after a post, so the author sees their own comment', async () => {
    // ⚠ THIS CASE EXISTS BECAUSE A REVIEWER MEASURED THAT NOTHING PINNED IT:
    // with `comments.reload()` commented out, all 107 tests across the three
    // comment suites stayed green. The reload is not decoration — the sheet owns
    // the thread read (unlike `attachments`, which the page owns), so a write
    // that did not reload it would show the author a thread without their own
    // comment until something else happened to refetch.
    //
    // Counted rather than inferred: the fake answers a constant fixture, so
    // "the thread still renders" cannot distinguish a refetch from no refetch.
    let reads = 0;
    const sheetSource = renderSheet(
      source({
        getTicketComments: async () => {
          reads += 1;
          return [COMMENT];
        },
      }),
      { editorSlot: fakeEditorSlot({ modes: [] }) },
    );
    const section = await screen.findByTestId('sheet-comments');
    await waitFor(() => expect(reads).toBeGreaterThan(0));
    const before = reads;

    const user = userEvent.setup();
    await user.click(within(section).getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(sheetSource.ingested).toHaveLength(1));
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it('draws a FAILED thread read as a sentence, not as "No comments yet."', async () => {
    renderSheet(
      source({
        getTicketComments: async () => {
          throw new Error('the thread could not be read');
        },
      }),
    );

    const failure = await screen.findByTestId('sheet-comments-unavailable');
    expect(failure).toHaveAttribute('role', 'alert');
    expect(failure).toHaveTextContent('the thread could not be read');
    // The empty sentence is a claim ABOUT THE TICKET, and a failed read has not
    // earned it. This is the whole reason `getTicketComments` throws on a 404
    // rather than answering `[]`.
    expect(screen.queryByText('No comments yet.')).toBeNull();
    expect(screen.queryByText('Comments · 0')).toBeNull();
  });
});
