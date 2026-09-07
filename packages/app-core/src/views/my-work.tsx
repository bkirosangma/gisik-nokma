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
 * The distinction is reachability, not wording: `getMyWork` REFUSES today
 * (`ServingGapError` — `ContestedClaim.title` is on no contest row and
 * `ContestedClaim.claim.serverTime` is an instant the system never recorded,
 * because a refused claim was never committed and so never stamped), and
 * `useLiveQuery` surfaces that rejection as `error` with `data` left null — so
 * this component does not render at all. The only worlds in which
 * `contested: []` reaches here are worlds where somebody computed it, and there
 * "No contested claims." is the true and useful answer. Suppressing the section
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
            <WorkItemCard key={item.ticketId} item={item} onOpenTicket={onOpenTicket} shared />
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
  shared = false,
}: {
  item: WorkItem;
  onOpenTicket: (ticketId: string) => void;
  pending?: boolean;
  shared?: boolean;
}) {
  /**
   * The ticket sheet lives at `/w/:ws/p/:projectId?ticket=…` — through the
   * PROJECT page — so opening one needs a project this viewer may actually
   * load, and `projectName === null` is exactly the register that says they may
   * not be told the project even exists by name (rulings P32/P38). A guest
   * holding a shared errand is that viewer for every row in this section.
   *
   * So the affordance is gated on the thing it NEEDS, not on the section it sits
   * in: a member whose shared ticket is in a project they are on still gets the
   * button. Offering it to the guest would push them to a page that answers 404
   * while the card said "open" — a control that reads as working and is not,
   * which is the shape `new-ticket-dialog`'s withheld parent picker was fixed
   * for. Only `shared` rows are gated: the other sections' rows reach this state
   * too (a guest ASSIGNED an invisible-project ticket, case 7.108) and that dead
   * click is a real, PRE-EXISTING defect — recorded, not silently widened into
   * here, because changing those sections is not this change's job.
   */
  const openable = !shared || item.projectName !== null;
  return (
    <Card className="gn-my-work__item">
      {openable ? (
        <button
          type="button"
          className="gn-my-work__title"
          onClick={() => onOpenTicket(item.ticketId)}
        >
          {item.title}
        </button>
      ) : (
        <span className="gn-my-work__title gn-my-work__title--unopenable">{item.title}</span>
      )}
      {/*
        `WorkItem.projectName`'s own contract: a withheld name leaves the viewer
        holding the `projectId`, "so the item renders id-only rather than blank".
        This line printed `{item.projectName}` — i.e. NOTHING — whenever the rule
        applied, so the type promised one register and the renderer delivered
        another. PRE-EXISTING and reachable before this change (case 7.108's
        guest), but this section is where it becomes the NORMAL case rather than
        an edge, so it is fixed here with one rule for every section.
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
