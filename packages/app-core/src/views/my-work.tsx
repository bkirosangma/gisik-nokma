import { renderContestedClaimAttribution } from '@gisik-nokma/domain';
import { Card, Chip } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatDate, formatStateProvenance } from '../provenance.js';
import type { ContestedClaim, MyWorkView, WorkItem } from '../view-types.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

export type MyWorkProps = {
  view: MyWorkView;
  onOpenTicket: (ticketId: string) => void;
};

/**
 * My Work: assigned, in transit, contested (spec §7).
 *
 * ## THE THREE SECTIONS DO NOT GROUP ON THE SERVER'S AXIS, and that is a model
 * difference rather than a rename
 *
 * `GET /v1/me/work` answers `{open, active, terminal}` — STATE CATEGORY, a
 * column read off `proj_tickets`. This view is `{assigned, inTransit,
 * contested}` — CLAIM STATUS, which is a fact about what has happened to the
 * viewer's claims. All three of the server's groups are this viewer's assigned
 * work, so the server's whole answer collapses into ONE of these sections, and
 * the other two are filled from elsewhere or not at all. `mapMyWork`'s docblock
 * records that the axis difference is adaptable and is NOT why `getMyWork`
 * refuses.
 *
 * ## The two empty states say different kinds of thing, deliberately
 *
 * **`inTransit` empty is STRUCTURAL TRUTH for this client.** `inTransit` is the
 * replica's OUTBOX (Plan 10). The web client is online-only — SPEC §5, line 104,
 * whose §5 also places the outbox in the mobile and desktop replicas and nowhere
 * else (Plan 6 carries the constraint at its line 23, and cites it as "spec §5"
 * there — the shorthand "Plan 6 §5" was a MISCITATION, corrected 2026-09-02 at
 * `online/mappers.ts` and the coordination doc; §5 belongs to the spec, and Plan
 * 6 has no §5) — so it has no outbox — there is no place a claim in transit could be held. "No claims
 * in transit." is therefore a true statement about this client's construction,
 * not a read that came back empty, and `mapMyWork` deliberately does NOT list
 * `inTransit` among its serving gaps for exactly that reason. A claim genuinely
 * in flight between submit and the server's answer is the `pending` view flag on
 * a single card (see `board.tsx`), not a queue.
 *
 * **`contested` empty is only ever shown when contested was actually computed.**
 * **⚠ CORRECTED 2026-09-20 — the premise this paragraph rested on has expired.**
 * It read: *"The distinction is reachability, not wording: `getMyWork` REFUSES
 * today (`ServingGapError` — `ContestedClaim.title` is on no contest row and
 * `ContestedClaim.claim.serverTime` is an instant the system never recorded,
 * because a refused claim was never committed and so never stamped), and
 * `useLiveQuery` surfaces that rejection as `error` with `data` left null — so
 * this component does not render at all."* **Rulings P39 and P40 served that read
 * and `getMyWork` answers; the register has been empty since 2026-09-19.** The
 * reachability argument is therefore no longer available on those terms, and what
 * replaces it is a product claim this correction deliberately does NOT take:
 * `contested: []` can now arrive from a real answer, and whether the sentence
 * below still holds is an open question with a named owner — *whoever next
 * touches this component.* The sentence itself is kept rather than deleted. Suppressing the section
 * when empty would lose that.
 *
 * That asymmetry with `AttentionStrip` — which renders NOTHING when it has
 * nothing — is not an inconsistency. The strip's emptiness is the whole
 * message it delivers, and it is structurally incapable of containing its
 * fourth kind; a section heading inside a view the user opened on purpose is
 * not read as an all-clear about the product.
 */
export function MyWork({ view, onOpenTicket }: MyWorkProps) {
  return (
    <div className="gn-my-work">
      <section role="region" aria-label="Assigned to me" className="gn-my-work__section">
        <h3 className="gn-my-work__heading">Assigned to me</h3>
        {view.assigned.length === 0 ? (
          <p className="gn-my-work__empty">Nothing assigned to you.</p>
        ) : (
          view.assigned.map((item) => (
            <WorkItemCard key={item.ticketId} item={item} onOpenTicket={onOpenTicket} />
          ))
        )}
      </section>

      <section role="region" aria-label="My claims in transit" className="gn-my-work__section">
        <h3 className="gn-my-work__heading">My claims in transit</h3>
        {view.inTransit.length === 0 ? (
          <p className="gn-my-work__empty">No claims in transit.</p>
        ) : (
          view.inTransit.map((item) => (
            <WorkItemCard key={item.ticketId} item={item} onOpenTicket={onOpenTicket} pending />
          ))
        )}
      </section>

      <section role="region" aria-label="My contested claims" className="gn-my-work__section">
        <h3 className="gn-my-work__heading">My contested claims</h3>
        {view.contested.length === 0 ? (
          <p className="gn-my-work__empty">No contested claims.</p>
        ) : (
          view.contested.map((contested) => (
            <ContestedCard key={contested.ticketId} contested={contested} onOpenTicket={onOpenTicket} />
          ))
        )}
      </section>

      {/*
        Case 13.176. For a guest on no project this is the ONLY section that can
        ever have rows — the other three are assignment- and claim-scoped, and an
        errand handed to somebody is neither. The section renders unconditionally
        rather than only when non-empty, so "nothing has been shared with you" is
        a sentence the product says rather than a section that vanishes; a
        disappearing section is indistinguishable from one that failed to load.
      */}
      <section role="region" aria-label="Shared with me" className="gn-my-work__section">
        <h3 className="gn-my-work__heading">Shared with me</h3>
        {view.shared.length === 0 ? (
          <p className="gn-my-work__empty">Nothing has been shared with you.</p>
        ) : (
          view.shared.map((item) => (
            <WorkItemCard key={item.ticketId} item={item} onOpenTicket={onOpenTicket} />
          ))
        )}
      </section>
    </div>
  );
}

/**
 * A contested claim names the RULE that refused it and repeats the refusal's
 * own reason verbatim. Both come off the ledger's `claim.contested` event
 * (coordination amendment 16) — the rule engine wrote them when it turned the
 * claim away — and paraphrasing either here would tell the user a second story
 * about why their edit did not land.
 */
function ContestedCard({
  contested,
  onOpenTicket,
}: {
  contested: ContestedClaim;
  onOpenTicket: (ticketId: string) => void;
}) {
  return (
    <Card className="gn-my-work__contested">
      <button
        type="button"
        className="gn-my-work__title"
        onClick={() => onOpenTicket(contested.ticketId)}
      >
        {contested.title}
      </button>
      <Chip tone="contested">{contested.rule}</Chip>
      <p className="gn-my-work__reason">{contested.reason}</p>
      {/*
        Ruling P39. This line used to read `claimed by <name> on
        <serverTime>`, and BOTH halves were claims this row cannot make. There
        is no `actorName` — nothing resolves a refused claim's actor through
        the member roster — and there is no `serverTime` at all: the claim was
        refused at the door, so no server ever stamped it. The old text showed
        a moment that did not exist for this claim, which is the one thing a
        contest banner must not do.

        The domain renders it now, beside `renderContestedClaimText` and for
        the same reason that function exists: one vocabulary for a contested
        claim, and both instants labelled for what they actually are.
      */}
      <span className="gn-my-work__claim">
        {renderContestedClaimAttribution(contested.claim)}
      </span>
    </Card>
  );
}

/**
 * The state is folded behind `formatStateProvenance`, which is the one module
 * that knows a nameless claim still names its actor by id and that every
 * instant this product shows goes through the domain's `formatIstInstant`.
 *
 * The due line is the only DAY CLAIM this package renders. `formatDate` sends
 * it through `istDayBounds`' opening instant so no zone arithmetic can invent a
 * time of day for it — a bare `new Date('2026-08-30').toLocaleDateString()`
 * prints the 29th anywhere west of Greenwich, which would move a deadline off
 * the day somebody claimed. And the due date is ATTRIBUTED: a deadline is a
 * claim a person made, never a property the ticket has.
 */
function WorkItemCard({
  item,
  onOpenTicket,
  pending = false,
}: {
  item: WorkItem;
  onOpenTicket: (ticketId: string) => void;
  pending?: boolean;
}) {
  return (
    <Card className="gn-my-work__item">
      <button
        type="button"
        className="gn-my-work__title"
        onClick={() => onOpenTicket(item.ticketId)}
      >
        {item.title}
      </button>
      {/*
        `WorkItem.projectName`'s own contract: a withheld name leaves the viewer
        holding the `projectId`, "so the item renders id-only rather than blank".
        This line printed `{item.projectName}` — i.e. NOTHING — whenever the rule
        applied, so the type promised one register and the renderer delivered
        another. PRE-EXISTING and reachable before this change (case 7.108's
        guest), but "Shared with me" is where it becomes the NORMAL case rather
        than an edge, so it is fixed here with one rule for every section.

        A withheld NAME is not a withheld ticket, and the card is openable
        either way. An earlier draft of this file gated the open button on
        `projectName !== null`, reasoning that a viewer who may not be told a
        project's name cannot load its page — **and that reasoning was false.**
        `GET /v1/projects/:id/board` gates on WORKSPACE membership
        (`routes/board.ts`: "A workspace member who is NOT on the project passes
        the gate and gets 200 with whatever their visibility yields"), a guest IS
        a workspace member, and the guest arm of `visibleTicketsWhere` IS the
        explicit clause — so their shared ticket is on that board. The gate
        withheld a working affordance from exactly the person the section is
        for. Removed, and recorded here because the comment justifying it read
        as measured and was not.
      */}
      {item.projectName !== null ? (
        <span className="gn-my-work__project">{item.projectName}</span>
      ) : (
        <span
          className="gn-my-work__project gn-my-work__project--id"
          title="You have not been told this project’s name."
        >
          {item.projectId}
        </span>
      )}
      <Chip tone={item.stateCategory} title={formatStateProvenance(item.stateName, item.stateProvenance)}>
        {item.stateName}
      </Chip>
      {pending ? <Chip tone="pending">claim in transit</Chip> : null}
      {item.dueDate !== null ? (
        <span className="gn-my-work__due">
          {`needed by ${formatDate(item.dueDate.date)} — ${actorLabel(item.dueDate.claim.actorId, item.dueDate.claim.actorName)}'s claim`}
        </span>
      ) : null}
    </Card>
  );
}

/**
 * ADAPTATION, twice over. The plan's snippet calls `source.query.getMyWork()`
 * with no argument and `useLiveQuery` with three; the shipped signatures are
 * `getMyWork(workspaceId)` (ruling P25 clause 2 — `GET /v1/me/work` reads
 * `?workspaceId=` before the door and answers 400 without one) and a
 * four-argument hook (ruling P17). See `useAttention` for why `workspaceId`
 * legitimately occupies both the key and the argument position.
 */
export function useMyWork(source: DataSource, workspaceId: string): LiveQueryResult<MyWorkView> {
  return useLiveQuery(source, workspaceId, workspaceId, () => source.query.getMyWork(workspaceId));
}
