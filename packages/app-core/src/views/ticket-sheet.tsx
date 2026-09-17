import { useState } from 'react';
import { statesWithBacklog, type SubmittedEvent } from '@gisik-nokma/domain';
import { Button, Chip, Sheet } from '@gisik-nokma/ui';
import type { ClientStateCache } from '../cache.js';
import type { DataSource } from '../data-source.js';
import { precheckEvent, type PrecheckResult } from '../precheck.js';
import { actorLabel, formatDate, formatStateProvenance } from '../provenance.js';
import { makeSubmittedFactory } from '../submit.js';
import type { TicketHistoryEvent, TicketRead } from '../view-types.js';
import { AttachmentList, type AttachmentListEntry } from './attachment-list.js';
import { PlainTextEditorSlot, type EditorSlotComponent } from './editor-slot.js';
import { HistoryList } from './history-list.js';
import { formatRollup } from './rollup-text.js';
import { TransitionDialog, type TransitionSubmission } from './transition-dialog.js';
import { VisibilityEditor, type VisibilityClaim } from './visibility-editor.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

/**
 * How many ledger entries this sheet asks for, and the reason it names a number
 * at all instead of taking whatever arrives.
 *
 * **The shipped route PAGES.** `apps/server/src/routes/ticket-history.ts:78`
 * declares `DEFAULT_LIMIT = 200`, applied at `:155` and reaching the query as
 * `LIMIT $3` at `:305`; `MAX_LIMIT` (`:75`) caps it at 1000. Before this fix the
 * sheet passed neither `afterSeq` nor `limit`, so a long-lived ticket's history
 * was silently cut at whatever the server's default happened to be, with nothing
 * on screen saying so — the same absence-rendered-as-fact defect as the empty
 * `<ol>` below, one layer up: a reader would take the oldest line shown as the
 * beginning of the ticket.
 *
 * Two consequences of naming it here, both deliberate:
 *
 * 1. **The page size is this client's, not a server default it does not
 *    control.** The route may change `DEFAULT_LIMIT` tomorrow; the sentence this
 *    sheet prints about how much it is showing would then be about a number it
 *    never chose. It is a matching value, not an imported one — `app-core` may
 *    not import from `apps/server` (amendment 10 keeps this package free of the
 *    transport, let alone of the server), so the route's file:line is cited
 *    above and a drift shows up as the two numbers disagreeing in prose rather
 *    than as a compile error. **A `MAX_LIMIT` below this number silently
 *    disables the partiality signal**, and that is the second reason the two
 *    must be kept in step: `parsePaging` clamps with
 *    `Math.min(parsed, MAX_LIMIT)` (`ticket-history.ts:170`), so a cap of 100
 *    against this 200 returns a full-but-short page, `length >= 200` is false,
 *    and a genuinely truncated history shows no notice — FIX 1's
 *    absence-as-fact, back again. Nothing client-side can detect it: the body
 *    carries no cap and no cursor, so a short page is indistinguishable from
 *    the end of the ledger.
 * 2. **`events.length === HISTORY_PAGE_LIMIT` is the ONLY partiality signal
 *    available.** The route answers `{ticketId, events}` with no cursor and no
 *    `hasMore`, so a full page is all a client can observe. That over-reports:
 *    a ticket with exactly 200 entries is complete and will still be described
 *    as possibly having more. That trade is taken on purpose — an occasional
 *    "there may be more" is a weaker claim than the truth, while a silent
 *    truncation is a *stronger* one, and this file's whole subject is not making
 *    claims the record did not make. Closing the gap properly means a cursor on
 *    the wire; it is NOT built here (no Load-more, no `afterSeq` walk).
 */
export const HISTORY_PAGE_LIMIT = 200;

export type TicketSheetProps = {
  dataSource: DataSource;
  cache?: ClientStateCache;
  workspaceId: string;
  ticketId: string;
  currentUserId: string;
  onClose: () => void;
  editorSlot?: EditorSlotComponent;
  uploadEvidence?: (file: File) => Promise<{ attachmentId: string }>;
  /** Uploads and Drive references, from the ticket's `attachment.added` history. */
  attachments?: AttachmentListEntry[];
  /**
   * The ticket's standing audience, for the "Who can see this" section.
   *
   * Defaults to `undefined`, which the section renders as the ABSENCE it is —
   * and `undefined` is what every caller passes today, because nothing serves
   * it: `TicketRead` has no visibility field and the shipped ticket route's
   * wrapper carries no provenance block. See `visibility-editor.tsx`.
   */
  visibility?: VisibilityClaim | null;
  /**
   * Whether this viewer may change who sees the ticket. **Defaults to `true`,
   * and the default is the honest one rather than the permissive one.**
   *
   * Spec §6 gives the power to project admins and the ticket's creator. Neither
   * fact is readable from this client: `Actor` is `{id, name}` with no role, and
   * `TicketRead` does not name a creator. The authority that DOES know is the
   * ingest door — `checkVisibilityPermission`
   * (`apps/server/src/permissions/check-permission.ts:743`) refuses a
   * `visibility.set` from anyone lacking project-admin rights or creatorship,
   * reporting `permission.role`, and the editor renders that refusal verbatim.
   *
   * Defaulting to `false` would hide the controls from exactly the people
   * entitled to use them, on a guess, with no way for them to discover the
   * power exists. Defaulting to `true` shows the control and lets the one place
   * that knows answer — which is the same argument `routes/invites.ts` makes
   * for gating `invite.sent` at the ingest door rather than in the handler: a
   * second answer to one question is free to drift from the first. A caller
   * that acquires a real read passes `false` and the controls go.
   */
  canSetVisibility?: boolean;
};

/**
 * The whole ticket: state with its provenance, every field wearing the claim
 * that set it, the parent as the read model saw it, and the ledger behind a
 * tab with BOTH clocks on every line.
 *
 * ## Per-field attribution is the point, not decoration
 *
 * A field row is a VALUE plus WHO claimed it and WHEN — the server-recorded
 * when, because that is the one the system can vouch for; the claimed clock
 * sits beside it in the history tab where the two can be compared. A value with
 * no claim beside it reads as a property the ticket has, which is precisely the
 * laundering invariant 4 forbids: nothing here is a standing fact, everything
 * is somebody's claim.
 *
 * A nameless actor renders by ID through `actorLabel` — never blank, never
 * "system". `nameOf` below is the only join, and it is total by construction.
 *
 * ## THREE ADAPTATIONS from the plan's snippet, each measured
 *
 * 1. **`useLiveQuery` takes a query KEY third** (ruling P17). The plan's four
 *    calls pass three arguments. Without a key the hook keys its refetch on
 *    nothing, and the previous ticket's answer stays on screen under the new
 *    ticket's heading.
 * 2. **The workflow is derived from the read this sheet already has, at the
 *    ticket's PINNED version.** The plan's snippet calls `getTicket` a second
 *    time inside the workflow loader and then asks for the latest definition.
 *    That is two round trips for one fact and two refusal paths for one
 *    failure — and asking for `latest` is wrong besides: a ticket pins the
 *    version it was created under (owner decision 2026-08-26), so the latest
 *    definition may not contain the ticket's own `stateId`, and
 *    `transitionOptions` would then quietly offer only the wildcard edges. The
 *    key carries the workflow id AND version, so a rebind or a publish
 *    refetches.
 * 3. **The ledger payload is the SHIPPED spelling.** See `submitTransition`.
 *
 * ## What this sheet does when the read REFUSES
 *
 * `getTicket` refuses today against the real server (`ServingGapError`, six of
 * thirteen query methods): the shipped route answers a `proj_visibility` row
 * wrapped in `{ticket, parent, rollup}`, which carries no `title`, no
 * provenance block and no `TicketState`. `useLiveQuery` surfaces that rejection
 * as `error` with `data` left null, and this component then renders the REFUSAL
 * — its own text, under its own class — and not a sheet. It is deliberately a
 * different branch from "loading": a permanent serving gap rendered under the
 * word "Loading…" is a wait that never ends dressed as a wait that will.
 *
 * `HistoryTab` (below) applies the SAME three-way distinction to the ledger tab,
 * where the earlier single `history.data ?? []` drew an empty `<ol>` for a
 * pending read, a failed read and a real absence alike. Its error branch is
 * worded and classed differently on purpose: `getTicketHistory` ANSWERS, so its
 * rejection is an ordinary failure rather than a permanent gap. See its docblock.
 */
export function TicketSheet({
  dataSource,
  cache,
  workspaceId,
  ticketId,
  currentUserId,
  onClose,
  editorSlot,
  uploadEvidence,
  attachments,
  visibility,
  canSetVisibility = true,
}: TicketSheetProps) {
  const EditorSlot = editorSlot ?? PlainTextEditorSlot;
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [moveOpen, setMoveOpen] = useState(false);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(null);

  const read = useLiveQuery(dataSource, workspaceId, ticketId, () =>
    dataSource.query.getTicket(workspaceId, ticketId),
  );
  const ticketState = read.data?.ticket ?? null;
  const workflowKey =
    ticketState === null ? '' : `${ticketState.workflowId}@${ticketState.workflowVersion}`;
  const workflow = useLiveQuery(dataSource, workspaceId, workflowKey, async () => {
    const current = read.data?.ticket ?? null;
    return current === null
      ? null
      : dataSource.query.getWorkflowDef(workspaceId, current.workflowId, current.workflowVersion);
  });
  const members = useLiveQuery(dataSource, workspaceId, workspaceId, () =>
    dataSource.query.getMembers(workspaceId),
  );
  const history = useLiveQuery(dataSource, workspaceId, `${ticketId}:history`, () =>
    dataSource.query.getTicketHistory(ticketId, undefined, HISTORY_PAGE_LIMIT),
  );

  if (read.error !== null) {
    return (
      <Sheet open title="Ticket" onClose={onClose}>
        <p className="gn-ticket-sheet__refusal">{read.error}</p>
      </Sheet>
    );
  }

  if (read.data === null) {
    return (
      <Sheet open title="Ticket" onClose={onClose}>
        <p className="gn-ticket-sheet__loading">Loading…</p>
      </Sheet>
    );
  }

  const ticketRead: TicketRead = read.data;
  const nameOf = (userId: string): string =>
    actorLabel(userId, members.data?.find((member) => member.id === userId)?.name ?? null);
  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });

  /**
   * The instant preview, advisory only. With no cache there is no local state
   * to evaluate against, and `not-evaluated` is the honest answer — a `passed`
   * manufactured out of absence is the one thing `precheckEvent` exists to
   * refuse.
   *
   * The candidate carries the SHIPPED payload spelling. It has to:
   * `precheckEvent` runs the shared engine, and `evaluateTicketTransitioned`
   * parses the payload with `ticketTransitionedPayloadSchema` before it does
   * anything else — a `{ toStateId }` payload does not merely fail to preview,
   * it comes back as a REFUSAL naming the client's own payload as malformed,
   * which is a refusal about this code shown to a user as if it were about
   * their move.
   */
  const precheck = async (toStateId: string): Promise<PrecheckResult> => {
    if (cache === undefined) return { kind: 'not-evaluated', why: 'missing-local-state' };
    const candidate: SubmittedEvent = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: { to: toStateId },
    });
    return precheckEvent(candidate, cache);
  };

  /**
   * ADAPTATION 3, and it is the one with a wire consequence.
   *
   * The plan's snippet emits `{ toStateId, comment: 'text' }`. The SHIPPED
   * payload — `ticketTransitionedPayloadSchema`, packages/domain/src/workflow.ts,
   * landed by Plan 2 and parsed by both the rule engine and the ingest door —
   * is `{ to, comment?: { text }, evidenceAttachmentId?, cause? }`. A claim in
   * the plan's spelling is refused whole at the door as a malformed payload,
   * and refused identically by the local pre-check before it ever leaves.
   * Same argument as rulings P24 and P25: where the shipped surface and the
   * plan text disagree about a shape that has already been built, the built
   * one wins, and the adaptation lives at the client edge rather than being
   * pushed into the domain.
   *
   * Field claims go FIRST and the transition last, in one ordered batch, so a
   * `require-field` rule sees the value the dialog just collected.
   */
  const submitTransition = async (submission: TransitionSubmission): Promise<void> => {
    const fieldEvents = Object.entries(submission.fieldValues).map(([fieldId, value]) =>
      make({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId, value },
      }),
    );
    const transitionPayload: Record<string, unknown> = { to: submission.toStateId };
    if (submission.comment !== undefined) transitionPayload['comment'] = { text: submission.comment };
    if (submission.evidenceAttachmentId !== undefined) {
      transitionPayload['evidenceAttachmentId'] = submission.evidenceAttachmentId;
    }
    const transition = make({
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: transitionPayload,
    });
    const results = await dataSource.ingest([...fieldEvents, transition]);
    const failed = results.find((result) => result.status !== 'committed');
    if (failed === undefined) {
      setServerRefusal(null);
      setMoveOpen(false);
      read.reload();
      history.reload();
      return;
    }
    // The authority's own words, carried without paraphrase. A refusal is a
    // named rule and a reason the engine wrote; an `invalid` is the door's code
    // and message. Both reach the user as they were said.
    if (failed.status === 'refused') setServerRefusal({ rule: failed.rule, reason: failed.reason });
    else setServerRefusal({ rule: failed.code, reason: failed.message });
  };

  const state = ticketRead.ticket;
  // `statesWithBacklog`, not `workflow.data?.states` (backlog/closed spec
  // §1.4, 2026-09-17): a ticket in the universal Backlog state has no row in
  // the published definition's own `states`, and the sheet must still say
  // "Backlog" rather than the bare id.
  const currentStateName =
    workflow.data == null
      ? state.stateId
      : statesWithBacklog(workflow.data).find((candidate) => candidate.id === state.stateId)?.name ?? state.stateId;

  return (
    <Sheet open title={ticketRead.title} onClose={onClose}>
      <div role="tablist" className="gn-ticket-sheet__tabs">
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'details'}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'history'}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {tab === 'details' ? (
        <div className="gn-ticket-sheet__details">
          <div className="gn-ticket-sheet__state">
            <Chip tone={state.stateCategory}>{currentStateName}</Chip>
            <span className="gn-ticket-sheet__provenance">
              {formatStateProvenance(currentStateName, ticketRead.stateProvenance)}
            </span>
            <Button onClick={() => setMoveOpen(true)}>Move…</Button>
          </div>

          {/*
            Three different facts, three different sentences. A RESTRICTED
            parent is existence-without-title — the ticket has a parent and this
            viewer may not see which; rendering it as "At project root" would
            turn a restriction into a vanish (invariant 5). A NULL parent really
            is at the root. A visible parent shows its title.
          */}
          <div className="gn-ticket-sheet__parent">
            {ticketRead.parent === null ? (
              <span>At project root</span>
            ) : ticketRead.parent.kind === 'restricted' ? (
              <span className="gn-ticket-sheet__restricted">
                Restricted parent — exists, but you can&apos;t see it
              </span>
            ) : (
              <span>{ticketRead.parent.title}</span>
            )}
          </div>

          {ticketRead.rollup !== null ? (
            <p className="gn-ticket-sheet__progress">{formatRollup(ticketRead.rollup)}</p>
          ) : null}

          <dl className="gn-ticket-sheet__fields">
            <div className="gn-ticket-sheet__field" data-testid="field-assignee">
              <dt>Assignee</dt>
              <dd>{state.assigneeId === null ? '—' : nameOf(state.assigneeId)}</dd>
            </div>
            {Object.entries(state.fields).map(([fieldId, fieldClaim]) => (
              <div key={fieldId} className="gn-ticket-sheet__field" data-testid={`field-${fieldId}`}>
                <dt>{fieldId}</dt>
                <dd>
                  {fieldId === 'description' ? (
                    <EditorSlot
                      mode="description"
                      doc={fieldClaim.value}
                      readOnly
                      workspaceId={workspaceId}
                      ticketId={ticketId}
                      placeholder="No description yet"
                    />
                  ) : (
                    <span>{renderFieldValue(fieldClaim.value)}</span>
                  )}
                  <span className="gn-ticket-sheet__claim">
                    {`set by ${nameOf(fieldClaim.actorId)} on ${formatDate(fieldClaim.serverTime)}`}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <AttachmentList entries={attachments ?? []} />

          {/*
            Spec §6's audience section. It is mounted here and it is DARK
            against the shipped server: this component returns its refusal
            branch above whenever `getTicket` rejects, and `getTicket` refuses
            today (`mapTicketRead`, one of the six serving gaps). So nobody
            reaches this line in production until that read is served — which is
            why the editor's own behaviour is proven in
            `test/views/visibility-editor.test.tsx`, driving the component
            directly, rather than through a fabricated successful read here.
          */}
          <VisibilityEditor
            dataSource={dataSource}
            workspaceId={workspaceId}
            ticketId={ticketId}
            currentUserId={currentUserId}
            members={members.data ?? []}
            current={visibility ?? null}
            canEdit={canSetVisibility}
            onChanged={() => {
              read.reload();
              history.reload();
            }}
          />
        </div>
      ) : (
        <HistoryTab result={history} nameOf={nameOf} />
      )}

      {workflow.data != null ? (
        <TransitionDialog
          open={moveOpen}
          workflow={workflow.data}
          fromStateId={state.stateId}
          ticketFields={state.fields}
          onClose={() => {
            setMoveOpen(false);
            setServerRefusal(null);
          }}
          onSubmit={(submission) => void submitTransition(submission)}
          precheck={precheck}
          serverRefusal={serverRefusal}
          // `submitTransition` above stays unguarded (see its own docblock
          // precedent, cited by `board.tsx`'s `submitDirect`/`submitFromDialog`)
          // — a rejected `ingest` here is an unhandled promise rejection, not a
          // state this component tracks, so there is nothing to pass but `null`.
          // Not Ruling 27's scope: that ruling is about a fabricated `{rule,
          // reason}` pair standing in for a real refusal, which this file never
          // did — it just never caught the rejection at all.
          transportError={null}
          uploadEvidence={uploadEvidence}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * The History tab, and the three-way distinction the sheet body already makes
 * one branch up.
 *
 * ## The defect this closes
 *
 * `useLiveQuery` leaves `data` at `null` BOTH while the load is in flight and
 * after it rejects (`use-live-query.ts:41`, `:66-69` — the rejection handler
 * sets `error` and never touches `data`, and the key-change effect at `:77`
 * cleared it to null before asking). The previous line here was
 * `events={history.data ?? []}`, which collapsed all three of those into one
 * rendering: an empty `<ol>` with no loading and no error indicator. For a
 * ledger-backed product that is the strongest possible false statement about a
 * ticket — the History tab IS the ledger (spec §3), so "nothing here" reads as
 * "nothing was ever claimed about this ticket".
 *
 * ## Branch ORDER is the fix, not just the branch count
 *
 * `error` is tested BEFORE `data === null`, because on a rejection both hold.
 * Reversed, an error renders "Loading…" — the same defect this closes, moved.
 *
 * The consequence of error-first is worth naming: `LiveQueryResult` carries no
 * staleness flag, so a reload that FAILS after a successful load leaves the old
 * rows in `data` with `error` set, and this branch hides them behind the failure
 * line. That is recorded as F6 against `use-live-query.ts:53-58` and owned
 * there; the trade is taken deliberately — rows the client cannot vouch for
 * being current are worse under a ledger heading than a named failure.
 *
 * ## The error branch is an ERROR, not a serving gap, and says so
 *
 * The asymmetry with the sheet body matters. `getTicket` REFUSES against the
 * shipped server for good (`ServingGapError`, one of the six in
 * `src/online/mappers.ts`), so its branch is a REFUSAL: permanent, nothing to
 * retry, and dressing it as a wait would be a wait that never ends.
 * `getTicketHistory` is one of the six that ANSWERS (`online-data-source.ts:151`
 * maps the shipped `/v1/tickets/:id/history`), so a rejection here is an
 * ordinary failure of one read and MAY succeed on a retry. Different fact,
 * different word, and a different class — reusing `gn-ticket-sheet__refusal`
 * would put a false claim in the CSS.
 *
 * ## What the empty branch is allowed to say
 *
 * It says the READ came back with no entries — not that the ticket has no
 * history. The distinction is not pedantry: `online-data-source.ts:151-158`
 * answers `[]` on a 404, and a 404 there means "no such ticket, or not yours"
 * (the frozen `NOT_FOUND_BODY` both routes share). That `[]`-on-404 is
 * plan-sanctioned and stays; what must not follow it is a surface turning it
 * into an assertion about the ticket. A live ticket always carries at least its
 * own `ticket.created`, so a genuinely empty page in production means a 404 or
 * an `afterSeq` past the end — never "this ticket has no history".
 */
function HistoryTab({
  result,
  nameOf,
}: {
  result: LiveQueryResult<TicketHistoryEvent[]>;
  nameOf: (userId: string) => string;
}) {
  if (result.error !== null) {
    return (
      <p className="gn-ticket-sheet__history-error">
        {`This ticket's history could not be read — ${result.error}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
      </p>
    );
  }
  if (result.data === null) {
    return <p className="gn-ticket-sheet__history-loading">Loading…</p>;
  }
  if (result.data.length === 0) {
    return <p className="gn-ticket-sheet__history-empty">No entries came back for this ticket.</p>;
  }
  return (
    <>
      <HistoryList events={result.data} nameOf={nameOf} />
      {result.data.length >= HISTORY_PAGE_LIMIT ? (
        <p className="gn-ticket-sheet__history-partial">
          {`Showing the first ${HISTORY_PAGE_LIMIT} entries — this ticket's history may go on past them.`}
        </p>
      ) : null}
    </>
  );
}

/**
 * A field value as text. A due date arrives as the claim `{ date }` and goes
 * through the one renderer, never an ISO slice; absence renders as an em dash
 * rather than as empty space, so "nobody has set this" is visible instead of
 * being indistinguishable from a layout gap.
 */
function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && 'date' in (value as Record<string, unknown>)) {
    return formatDate(String((value as Record<string, unknown>)['date']));
  }
  return String(value);
}
