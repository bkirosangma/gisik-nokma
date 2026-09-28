import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@gisik-nokma/domain';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import type { TicketComment } from '../../src/views/comments-thread.js';

/**
 * The comment box, AT THE SHEET — where the composer is mounted, gated, and
 * wired to the ledger.
 *
 * ## Case 16.75 — MINTED 2026-09-21, after the block was reallocated
 *
 * The controller ruled on 2026-09-20 (mid-task) that executor 2 had no free
 * ids, so this file shipped with a header saying the id was OWED rather than
 * omitted. **That is now discharged:** the block was reallocated on 2026-09-21
 * (`16.72`–`16.80`) and the owed id is minted as **`16.75`** in
 * `test-cases/16-remaining-doors.md` — see THE BLOCKS there.
 *
 * ⚠ **The id names the FILE, and the cases below are its ARMS.** §16's blocks
 * mint one id per decisive property and name the arms inside the entry, so the
 * `it` blocks below do not each carry their own number.
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
    // The breadcrumb's two crumb fields, added 2026-09-20 by the ancestor-chain
    // change this file's fixtures were written before. No case here reads them,
    // so both take the default a read that composed no key would carry.
    key: null,
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  };
}

function source(
  overrides: Record<string, unknown> = {},
  // `ingest` is on `DataSource`, not on the query — it is the SECOND argument
  // of `createFakeDataSource`, which is why a case that refuses a claim passes
  // it here rather than in the query overrides.
  ingestScript?: IngestScript,
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
    ingestScript,
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
function fakeEditorSlot(seen: {
  modes: string[];
  /**
   * Every `footerNote` the sheet handed the seam, recorded in mount order.
   *
   * OPTIONAL so the cases that only read `modes` keep their one-field literal —
   * and so a case that reads notes is visibly the one asking for them. The
   * comment arm DRAWS the note, which is the plan's permitted fixture edit (d)
   * for Task 7: the thread stopped drawing *"Posting records an event citing
   * you."* itself, so the only thing that can put it on the screen is the host's
   * `footerNote` reaching the composer, and a stub that swallowed it would make
   * the pre-existing assertion below pass over a build that lost the sentence.
   */
  notes?: (string | undefined)[];
}): EditorSlotComponent {
  return function FakeEditorSlot(props) {
    seen.modes.push(props.mode);
    seen.notes?.push(props.footerNote);
    if (props.mode === 'description') {
      // Inert: this file is about the comment box. The description mount's own
      // behaviour is proven in `ticket-sheet.test.tsx`.
      return <div data-testid="fake-description-editor" />;
    }
    return (
      <div data-testid="fake-comment-editor">
        <p>{props.footerNote}</p>
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
    const refusing = source({}, (events) =>
      events.map((event) => ({ status: 'refused' as const, eventId: event.id, rule: 'r', reason: 'the server said no' })),
    );
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

  /**
   * 16.126 / 16.128 — THE HEADING WEARS THE SHEET'S CAPTION CLASS.
   * (sheet prototype parity, 2026-09-22; spec decision 11)
   *
   * The prototype draws `Comments · {count}` and the sheet's `SUBTASKS · …` in the
   * SAME eyebrow style (`desktop.dc.html:1250`, `:1236`), so that style gets one
   * name — `.gn-ticket-sheet__caption` — instead of a copy per section. These two
   * cases pin the NAME on this element.
   *
   * ⚠ **AND THE NAME WAS ALL THAT MOVED WHEN THIS WAS WRITTEN, WHICH IS THE
   * MEASUREMENT THAT MATTERED AND WAS TAKEN RATHER THAN ASSUMED.** `.gn-comments__heading`'s
   * rule already declared the whole eyebrow — `font-size: 0.8125rem`,
   * `line-height: 1.125rem`, `text-transform: uppercase`, `letter-spacing: 0.6px`,
   * `var(--gn-text-muted)` — and the shared rule the plan gives Task 4 is a
   * transcription of exactly those declarations. So the Comments heading changed
   * its LOOK by nothing at all at the moment this landed; it gained the second
   * name for a later task to hang the shared rule on.
   *
   * ⚠ **THE SHARED CLASS HAS A RULE NOW, AND THE DUPLICATE IS GONE WITH IT
   * (2026-09-22).** This paragraph read *"the shared class has no rule yet, and
   * that is why 16.128 exists … dropping it today would leave the element with NO
   * effective style at all"* — true when written, and **the reason 16.128 is the
   * arm that had to be written FIRST.** Task 4 landed `.gn-ticket-sheet__caption`'s
   * rule; the tail lane then removed `.gn-comments__heading`'s six duplicate
   * declarations, which is the sequence the source comment on this element
   * records and the reason that comment was a guard rather than a description.
   *
   * ⚠ **THE CSS HALF IS STILL DELIBERATELY NOT ASSERTED HERE.** A case reading
   * those declarations out of `ui.css` would have had to be rewritten by the tail
   * lane when it removed them — a case that exists to be edited is a liability
   * rather than a guard — and the same argument applies to asserting their
   * ABSENCE now: the pinned `13.1142`-style CSS-binding cases live in the package
   * that owns the stylesheet.
   */
  it('16.126 the Comments heading wears the sheet caption class', async () => {
    renderSheet();
    const section = await screen.findByTestId('sheet-comments');
    expect(within(section).getByText(/^Comments/).className).toContain('gn-ticket-sheet__caption');
  });

  it('16.128 CONTROL — the heading ADOPTED the caption class; it was not RENAMED into it', async () => {
    renderSheet();
    const section = await screen.findByTestId('sheet-comments');
    const heading = within(section).getByText(/^Comments/);
    // The block's own class is still worn, which is the only thing keeping this
    // element styled while the shared rule does not exist yet. A rename would
    // satisfy 16.126 and strip the heading bare.
    expect(heading.className).toContain('gn-comments__heading');
    // …and the element really is the heading, so neither assertion above is a
    // reading of some other node that happens to start with the word.
    expect(heading.tagName).toBe('P');
    expect(heading.textContent).toBe('Comments · 1');
  });

  /**
   * `16.127` — THE POSTING SENTENCE RIDES THE COMPOSER'S FOOTER (Task 7's held
   * half, 2026-09-22).
   *
   * The thread drew *"Posting records an event citing you."* itself, as a line
   * under the composer, and carried a paragraph saying the move was OWED: the
   * sentence belongs in `TicketEditorSlot`'s footer row (the prototype's `cmtHint`
   * slot, `desktop.dc.html:1329`), but handing it over needs a one-line change at
   * the sheet's comment `EditorSlot` mount — a file lane B was barred from
   * touching. **Deleting the thread's paragraph FIRST would have lost the sentence
   * from the product**, since nothing else drew it, so the deletion and the mount
   * are one change and land together here.
   *
   * ⚠ **THE CASE READS BOTH DIRECTIONS, and either alone passes over the defect.**
   * `seen.notes` proves the sentence reached the seam; the COUNT proves the thread
   * stopped drawing its own copy. A build that added `footerNote` without deleting
   * the paragraph would pass the first and show the sentence TWICE — which is the
   * shape this case exists for, and the reason it is not a `getByText`.
   */
  it('16.127 the posting sentence is handed to the composer as its footer note, and the thread draws no second copy', async () => {
    const seen = { modes: [] as string[], notes: [] as (string | undefined)[] };
    renderSheet(source(), { editorSlot: fakeEditorSlot(seen) });
    const section = await screen.findByTestId('sheet-comments');

    expect(seen.notes).toContain('Posting records an event citing you.');
    expect(within(section).getAllByText('Posting records an event citing you.')).toHaveLength(1);
    // And the copy that IS on screen came from the composer rather than from the
    // thread: asserted by containment, so a build whose only copy is the thread's
    // own paragraph cannot pass the count above by drawing it in the wrong place.
    expect(
      screen.getByTestId('fake-comment-editor').contains(
        within(section).getByText('Posting records an event citing you.'),
      ),
    ).toBe(true);
  });

  /**
   * 18.274 — Plan 7 Task 4 (spec §14.2): a ticket chip in a rendered comment
   * links to the ticket's page — `TicketSheet` forwarding its own
   * `resolveTicketHref` prop to `CommentsThread`'s `ticketHref`. Control in
   * the SAME describe: with no `resolveTicketHref` supplied, the identical
   * chip renders as a plain span (spec §14.2's default), never a dead link.
   */
  it('18.274 a ticketRef in a comment links to the ticket\'s page when the app supplies resolveTicketHref', async () => {
    const ticketRefComment: TicketComment = {
      commentId: '01COMMENTTWO',
      authorId: 'user_anselma',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'see ' },
              {
                type: 'ticketRef',
                attrs: { ticketId: TICKET, projectId: 'p_other', key: 'SHOP-9', title: 'Fix the freezer' },
              },
            ],
          },
        ],
      },
      recordedAt: '2026-09-23T09:00:00.000Z',
      files: [],
    };
    renderSheet(source({ getTicketComments: async () => [ticketRefComment] }), {
      resolveTicketHref: ({ ticketId, projectId }: { ticketId: string; projectId: string }) =>
        `/w/${WS}/p/${projectId}?ticket=${ticketId}`,
    });
    const section = await screen.findByTestId('sheet-comments');
    const link = within(section).getByRole('link', { name: 'SHOP-9 Fix the freezer' });
    expect(link).toHaveAttribute('href', `/w/${WS}/p/p_other?ticket=${TICKET}`);
  });

  it('18.274 (control) the same chip renders as a plain span when the app supplies no resolveTicketHref', async () => {
    const ticketRefComment: TicketComment = {
      commentId: '01COMMENTTWO',
      authorId: 'user_anselma',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'ticketRef',
                attrs: { ticketId: TICKET, projectId: 'p_other', key: 'SHOP-9', title: 'Fix the freezer' },
              },
            ],
          },
        ],
      },
      recordedAt: '2026-09-23T09:00:00.000Z',
      files: [],
    };
    renderSheet(source({ getTicketComments: async () => [ticketRefComment] }));
    const section = await screen.findByTestId('sheet-comments');
    expect(within(section).queryByRole('link', { name: 'SHOP-9 Fix the freezer' })).toBeNull();
    expect(within(section).getByText('SHOP-9 Fix the freezer')).toBeInTheDocument();
  });

  /**
   * 18.274 — the other half of the wiring: `TicketSheet` forwards its own
   * `queryTickets`/`resolveTicketHref` props to BOTH `<EditorSlot>` mounts
   * (description and comment), not only to `CommentsThread`.
   */
  it('18.274 forwards queryTickets/resolveTicketHref to both EditorSlot mounts', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const StubSlot: EditorSlotComponent = (props) => {
      captured.push(props as unknown as Record<string, unknown>);
      return <div data-testid={`stub-${props.mode}-editor`} />;
    };
    renderSheet(source(), {
      editorSlot: StubSlot,
      queryTickets: async () => [],
      resolveTicketHref: () => null,
    });
    await screen.findByTestId('stub-comment-editor');
    const description = captured.find((p) => p['mode'] === 'description');
    const comment = captured.find((p) => p['mode'] === 'comment');
    expect(description?.['queryTickets']).toBeDefined();
    expect(description?.['resolveTicketHref']).toBeDefined();
    expect(comment?.['queryTickets']).toBeDefined();
    expect(comment?.['resolveTicketHref']).toBeDefined();
  });

  /**
   * 18.285 — the gap a final review caught: `queryTickets`/`resolveTicketHref`
   * reach both `<EditorSlot>` mounts (18.274 above), but nothing ever built or
   * forwarded a `queryNotes` — so `:note`/`[[` in a REAL ticket description or
   * comment offered nothing, and D27's headline ("tag a note in a ticket
   * comment") had no first-class way to happen: every green Task 5 test drove
   * it through a stub editor that posts a fixed body, never through the real
   * picker. `TicketSheet` now builds `queryNotes` itself from
   * `dataSource.query.getNotes(workspaceId)` — the same client-side
   * substring filter `note-document.tsx`'s own `queryNotes` uses — and
   * forwards it to both mounts, with no new prop on `TicketSheetProps`
   * (unlike `queryTickets`, nothing page-specific is needed: `dataSource` and
   * `workspaceId` are already in scope).
   */
  it('18.285 builds queryNotes from dataSource.query.getNotes and forwards it to both EditorSlot mounts, matching by title substring', async () => {
    const getNotes = vi.fn(async () => [
      { noteId: 'n1', title: 'Cold room' } as NoteSummary,
      { noteId: 'n2', title: 'Compressor log' } as NoteSummary,
    ]);
    const captured: Array<Record<string, unknown>> = [];
    const StubSlot: EditorSlotComponent = (props) => {
      captured.push(props as unknown as Record<string, unknown>);
      return <div data-testid={`stub-${props.mode}-editor`} />;
    };
    renderSheet(source({ getNotes }), { editorSlot: StubSlot });
    await screen.findByTestId('stub-comment-editor');
    const description = captured.find((p) => p['mode'] === 'description');
    const comment = captured.find((p) => p['mode'] === 'comment');
    expect(description?.['queryNotes']).toBeDefined();
    expect(comment?.['queryNotes']).toBeDefined();

    const queryNotes = comment?.['queryNotes'] as (q: string) => Promise<Array<{ noteId: string; title: string }>>;
    const hits = await queryNotes('compr');
    expect(hits).toEqual([{ noteId: 'n2', title: 'Compressor log' }]);
  });

  /**
   * 18.288 — a final-review finding (2026-09-23): `queryNotes`'s note list
   * was fetched through `useLiveQuery`, which REFETCHES on every workspace
   * stream frame while the sheet stays open (`use-live-query.ts`'s own
   * docblock: "load once, then refetch (debounced) whenever the workspace
   * stream moves") — a real cost paid on every unrelated ticket edit in a
   * busy workspace, for a picker that may never be opened. It is now a
   * ONE-TIME fetch on mount (`note-document.tsx`'s own established
   * pattern for the identical picker), not a live subscription — so it is
   * NOT one of `ticket-sheet.test.tsx`'s "nine live reads" (that ratchet
   * stayed at eight; only `getNotesForTicket`, the ATTACHED-notes query,
   * counts there).
   */
  it('18.288 getNotes for the picker is fetched once, not re-fetched on a workspace stream frame', async () => {
    vi.useFakeTimers();
    try {
      const getNotes = vi.fn(async () => [{ noteId: 'n1', title: 'Cold room' } as NoteSummary]);
      const src = source({ getNotes });
      render(<TicketSheet dataSource={src} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getNotes).toHaveBeenCalledTimes(1);

      act(() => {
        src.pushStreamItem({
          type: 'event',
          envelope: {
            id: '01J9GEVT000000000000000099',
            workspaceId: WS,
            entity: { kind: 'ticket', id: TICKET },
            type: 'ticket.field_set',
            version: 1,
            payload: {},
            actorId: 'user_anselma',
            origin: 'web',
            clientTime: '2026-08-20T08:59:00.000Z',
            serverTime: '2026-08-20T09:00:00.000Z',
            seq: 4,
            workspaceSeq: 9,
          },
        });
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      // Still one — a stream frame that would refetch every OTHER live read
      // on this sheet does not touch the note-picker list.
      expect(getNotes).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Cases 18.276–18.277, 18.280 — Plan 7 Task 5 (spec §14.3, D27–D28): the
 * ticket-comment side of "tagging a note attaches it". `attachmentsImpliedBy`
 * itself (the pure document walk, 18.275, 18.279) is
 * `test/flows/attachments-implied-by.test.ts`'s; this file is `submitComment`
 * wiring it to `dataSource.ingest` and the sheet's own `Toast`. 18.278 (note
 * comments never call it) is `apps/web/test/note-comments.test.tsx`'s — that
 * file, not this one, is where `note-comments.tsx`'s own `submitComment` lives.
 */
function wikiLink(noteId: string, title: string): unknown {
  return { type: 'wikiLink', attrs: { noteId, title } };
}

function commentBody(...content: unknown[]): unknown {
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

function noteSummary(noteId: string, title: string): NoteSummary {
  return {
    noteId,
    workspaceId: WS,
    homeProjectId: '',
    authorId: 'user_kiro',
    title,
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  };
}

/** A comment composer stub that posts a FIXED body on Post — unlike `fakeEditorSlot`, whose body is always empty. */
function referencingEditorSlot(body: unknown): EditorSlotComponent {
  return function ReferencingSlot(props) {
    const [accepted, setAccepted] = useState<boolean | null>(null);
    if (props.mode === 'description') return <div data-testid="fake-description-editor" />;
    return (
      <div data-testid="fake-comment-editor">
        <button
          type="button"
          onClick={() => {
            void props.submit?.({ type: 'comment.added', payload: { body } }).then(setAccepted);
          }}
        >
          Post
        </button>
        {/* EXPOSES `submit`'s own return — D28's "the comment stays posted" is
            read by `TicketEditorSlot.handleSubmit` as `true`; a build that
            reported `false` after an already-committed comment would clear
            nothing and would read here as a claim the post FAILED, which is
            the observable shape "the comment was rolled back" takes for a
            caller of this seam. */}
        {accepted === null ? null : <div data-testid="post-accepted">{String(accepted)}</div>}
      </div>
    );
  };
}

describe('TicketSheet — tagging a note in a ticket comment attaches it', () => {
  it('18.276 posting a comment with two note references ingests the comment first, then two attachments; the section reloads and shows both badges', async () => {
    const user = userEvent.setup();
    let reloadCount = 0;
    const getNotesForTicket = vi.fn(async () => {
      reloadCount += 1;
      return reloadCount > 1 ? [noteSummary('n1', 'Cold room'), noteSummary('n2', 'Compressor log')] : [];
    });
    const src = source({ getNotesForTicket });
    const body = commentBody(wikiLink('n1', 'Cold room'), { type: 'text', text: ' and ' }, wikiLink('n2', 'Compressor log'));
    renderSheet(src, { editorSlot: referencingEditorSlot(body) });
    await screen.findByTestId('fake-comment-editor');
    await screen.findByText('Notes · 0');

    await user.click(screen.getByRole('button', { name: 'Post' }));

    // ORDER: the comment first, then the two attachments — as one FURTHER
    // ingest call, not folded into the first.
    await waitFor(() => expect(src.ingested).toHaveLength(2));
    expect(src.ingested[0]).toHaveLength(1);
    expect(src.ingested[0]![0]!.type).toBe('comment.added');
    expect(src.ingested[1]).toHaveLength(2);
    expect(src.ingested[1]!.every((e) => e.type === 'note.attached')).toBe(true);
    expect(src.ingested[1]!.map((e) => e.entity)).toEqual([
      { kind: 'note', id: 'n1' },
      { kind: 'note', id: 'n2' },
    ]);
    expect(src.ingested[1]!.every((e) => e.payload && (e.payload as { ticketId?: string }).ticketId === TICKET)).toBe(
      true,
    );

    // The section's OWN live query reloads and shows both badges.
    await screen.findByText('Notes · 2');
    expect(screen.getByRole('link', { name: 'Cold room' })).toHaveAttribute('href', '/notes/n1');
    expect(screen.getByRole('link', { name: 'Compressor log' })).toHaveAttribute('href', '/notes/n2');
  });

  it('18.277 a refused attachment leaves the comment posted and shows the toast naming the note and the reason', async () => {
    const user = userEvent.setup();
    let call = 0;
    const ingestScript: IngestScript = (events) => {
      call += 1;
      if (call === 1) {
        return events.map((event) => ({
          status: 'committed' as const,
          eventId: event.id,
          seq: 1,
          serverTime: '2026-09-23T09:00:00.000Z',
        }));
      }
      return events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'note.attachment.locked',
        reason: 'This note is locked.',
      }));
    };
    const src = source({}, ingestScript);
    const body = commentBody(wikiLink('n1', 'Cold room'));
    renderSheet(src, { editorSlot: referencingEditorSlot(body) });
    await screen.findByTestId('fake-comment-editor');

    await user.click(screen.getByRole('button', { name: 'Post' }));

    // The comment itself committed — TWO ingest calls happened, the second
    // (the attachment) is the one that was refused.
    await waitFor(() => expect(call).toBe(2));
    // The toast names the note and the server's reason.
    await screen.findByText('Couldn\'t attach "Cold room": This note is locked.');
    // The comment STAYS POSTED (D28) — found by its own thread entry, not by
    // the toast's absence, since a rolled-back comment would leave neither.
    expect(screen.getByText('The bucket is the defect.')).toBeInTheDocument();
    // …and `submitComment` itself answers `true`: a refused ATTACHMENT is not
    // a refused COMMENT, and a `false` here is what "rolled back" looks like
    // to `TicketEditorSlot.handleSubmit` — the composer would keep the words
    // instead of clearing them, over a comment the ledger already has.
    expect(await screen.findByTestId('post-accepted')).toHaveTextContent('true');
  });

  it('18.277b a transport failure on the implied ingest still leaves the comment posted, with its own toast line (D28)', async () => {
    const user = userEvent.setup();
    const src = source({});
    const realIngest = src.ingest.bind(src);
    let call = 0;
    src.ingest = async (events) => {
      call += 1;
      if (call === 1) return realIngest(events);
      throw new Error('network down');
    };
    const body = commentBody(wikiLink('n1', 'Cold room'));
    renderSheet(src, { editorSlot: referencingEditorSlot(body) });
    await screen.findByTestId('fake-comment-editor');

    await user.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(call).toBe(2));
    await screen.findByText("Couldn't attach the tagged notes: the server did not answer.");
    // The comment's own thread entry is still there — nothing rolled it back.
    await screen.findByText('The bucket is the defect.');
  });

  it('18.280 removing a reference later (a new comment without it) detaches nothing; control: the badge stays', async () => {
    const user = userEvent.setup();
    const getNotesForTicket = vi.fn(async () => [noteSummary('n1', 'Cold room')]);
    const src = source({ getNotesForTicket });
    const bodyWithoutReference = commentBody({ type: 'text', text: 'no links here' });
    renderSheet(src, { editorSlot: referencingEditorSlot(bodyWithoutReference) });
    await screen.findByTestId('fake-comment-editor');
    // CONTROL: the badge is there BEFORE posting, from an earlier attach.
    await screen.findByRole('link', { name: 'Cold room' });

    await user.click(screen.getByRole('button', { name: 'Post' }));

    // Only the comment is ever ingested — a body naming no reference implies
    // nothing, so there is no second `ingest` call at all.
    await waitFor(() => expect(src.ingested).toHaveLength(1));
    expect(src.ingested[0]![0]!.type).toBe('comment.added');
    // Still there — never detached.
    expect(screen.getByRole('link', { name: 'Cold room' })).toBeInTheDocument();
    expect(src.ingested.flat().some((e) => e.type === 'note.detached')).toBe(false);
  });
});
