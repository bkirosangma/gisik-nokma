import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BUILTIN_TICKET_TYPE_SEEDS, type PublishedWorkflowDef, type TicketTypeDef } from '@gisik-nokma/domain';
import { Button, Card, Popover } from '@gisik-nokma/ui';
import { buildTicketTypeDefinedEvent } from '../events.js';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.js';
import { ReadOnlyBanner } from '../ui/read-only-banner.js';
import { TypeIcon } from './icons.js';

/**
 * Visually hidden, inline — the recipe `apps/web/src/route-announcer.tsx`
 * carries, reused rather than re-invented. This product has no `sr-only`-style
 * utility to reuse: the one it had was cut as YAGNI when `aria-label` replaced
 * the mechanism it was written for.
 */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

/**
 * `/settings?tab=ticket-types` and `/w/[workspaceId]/settings/ticket-types` —
 * the type list (prototype `design-system/interactive/desktop.dc.html:817-839`,
 * blob `6d7b67c0a52c` at commit `227434a5`).
 *
 * ## WHAT IS DRAWN, and the two things that are NOT
 *
 * The prototype draws a header (an h2, a summary line and a `"New type"` action
 * over a card of rows), and each row as a flex line: a 34px rank tile, the name
 * and a meta line, an optional badge, two reorder controls and an `Edit` button.
 * **The header, the card, the rows, the meta line, the two reorder controls, the
 * `"N tickets"` segment and the `Built-in` badge are all drawn here. TWO elements
 * are ABSENT, and neither is an oversight** — both are owner rulings, and each is
 * recorded here so a reader comparing this screen to the prototype meets a
 * decision rather than a silence.
 *
 * (The number has moved twice, both on 2026-09-19, and a reader who remembers an
 * earlier one should not go looking for a missing bullet: it was **FOUR** until
 * the owner lifted the hold on the reorder, **THREE** once that shipped, and
 * **TWO** once the count followed it the same day. The two entries below that
 * describe BUILT work — the reorder and the count — are kept because each
 * replaced a written hold, and the hold is what a reader will remember.)
 *
 * - **the `Edit` button — RULED: NOT BUILT** (owner, 2026-09-18). Row-as-door is
 *   a **pre-existing** owner ruling, quoted at the rule itself (`packages/ui/src/
 *   ui.css:1811-1812`, owner 2026-09-10: *"remove [Edit] and open on just
 *   clicking the entire card/row"*). The whole row is one
 *   `<button aria-label={\`${canAuthor ? 'Edit' : 'Open'} ${type.name}\`}>` (`:392-421`),
 *   so an `Edit` button beside it would be a second door to the same place — not a
 *   port. **The verb BRANCHES (E4-34, 2026-09-21):** it read a bare `Edit ${type.name}`,
 *   which told a guest — the reader the read-only banner directly above the list is
 *   addressed to — that five rows were editable. `canAuthor` was already in scope
 *   and already branches at `:344`, `:350` and `:360`; the row itself was the one
 *   place it did not.
 * - **the `"Draft"` badge — RULED: NOT BUILT** (owner, 2026-09-18). A draft ticket
 *   type is not a state this product has, so `TicketTypeDef` gains no draft flag
 *   and no event carries one. The prototype's other badge value (`"Built-in"`) IS
 *   drawn, beside the rank in the meta line.
 * - **the ↑/↓ reorder controls — BUILT 2026-09-19, when the owner lifted the hold.**
 *   `docs/lanes/owner-holds.md` §1 had put *"`isTypes` | reorder and per-type
 *   counts"* on the owner's hold list, and that register's own rule is that a hold
 *   lifts only when the owner names it — **the owner named it on 2026-09-19**. The
 *   register's row for it said *"likely a route and a gateway op"*, and **that was
 *   wrong.** Measured 2026-09-18, before the hold lifted, because the hold's stated
 *   scope is screens *"whose prototype controls have no server behind them"* — and
 *   for the reorder that premise never held. The gateway declares no update op of
 *   any kind (`../gateway.ts:56-94`), but the door is not the gateway's: `onSave`
 *   authors a `ticket-type.defined` event carrying the whole definition — `rank`
 *   included (`ticket-type-editor-screen.tsx:283-309`) — and sends it through
 *   `gateway.submit`. `ticketTypeDefSchema` carries `rank: z.number().int().min(1)`
 *   (`packages/domain/src/ticket-types.ts:98`), so a reorder control is *assign a
 *   different rank and submit*, which is what the editor's own `"Hierarchy rank"`
 *   field already does. **No new route and no new projection** — and so this screen
 *   implements it that way, adding **no gateway method and no event type**.
 *
 *   **It is a SWAP, and that is two events rather than one.** `IngestResult` is
 *   per event, so re-ranking only the moved type would leave it TIED with its
 *   neighbour, and the server's own `ORDER BY rank, type_id` resolves a tie by an
 *   id — by nothing a person can see. Both types are re-ranked in one `submit`.
 *
 *   **The arrow that would move a built-in is DISABLED, not refused after the
 *   fact.** For the same per-event reason: the four built-ins are rank-locked
 *   server-side (`packages/rule-engine/src/checks/ticket-type.ts:60-62` refunds
 *   `type.builtin-rank`), so a swap across one would HALF commit — the neighbour's
 *   re-rank landing while the built-in's is refused — and leave the two tied. The
 *   control therefore anticipates the refusal. A refusal the server returns anyway,
 *   for a reason this screen does not model, is surfaced with the server's own
 *   words rather than swallowed.
 *
 *   One thing the prototype does not model, carried here: its rank is its **array
 *   index** (`rank: String(i + 1)`, `desktop.dc.html:3155`), while this product's is
 *   a **stored number that nothing enforces uniqueness on**.
 * - **the `"N tickets"` meta segment — BUILT 2026-09-19, the same day it was lifted.**
 *   It is the prototype's own LAST meta item — `fields · wf · N tickets`, the count
 *   after the workflow name (`desktop.dc.html:3156`) — so it goes last here too.
 *
 *   **The status this bullet used to carry is settled rather than restated.** It
 *   quoted two documents that disagreed (this dispatch called the count *"still
 *   held-and-unbuilt"*; `docs/lanes/owner-holds.md` §1's verbatim ruling table said
 *   *"per-type counts | **yes** | build it"*). **The register is the authority on its
 *   own holds and it said LIFTED, so the register was followed and the dispatch's
 *   sentence was the error.** With the thing built, re-quoting the contradiction
 *   would be keeping an argument about a decision that has been made.
 *   **Where the number comes from.** `getTicketCountsByType(workspaceId)` — ONE call
 *   for the whole list, answered by `GET /v1/workspaces/:id/ticket-counts-by-type`
 *   (`apps/server/src/routes/builder-reads.ts`). **Not
 *   `getTypeWorkflowPopulation`**, which answers *"how many are on THIS workflow"*:
 *   a ticket pins the workflow it was created under, so that number stops being the
 *   type's count the moment a re-point leaves tickets behind — the divergence this
 *   package's editor screen exists to show. The pinned route was **not** widened to
 *   answer both: a door whose meaning depends on whether an argument was passed is
 *   one thing reached two ways.
 *
 *   The plan's own stop-and-ask was *"if the count turns out to need a new projection
 *   rather than a query, stop and ask — that is a different size of task"*
 *   (`docs/superpowers/plans/2026-09-18-settings-workflows-port.md:236` — **re-pointed
 *   from `:162`, which this bullet cited until the plan's own Task 6+7 correction
 *   merged as `cc4b84bf` moved the sentence. `:162` still RESOLVED; it is now a row of
 *   the version-history table. A citation that resolves to the wrong thing misleads a
 *   reader, which is worse than one that breaks.**). **The measurement was taken and
 *   the answer is a query**: `proj_tickets` already carries `workspace_id` and
 *   `type_id`, so the task did not grow.
 *
 *   A failed read renders `tickets unavailable`, never a `0`; while the read is in
 *   flight the segment is absent rather than showing a number nobody has yet. Those
 *   two states are cases `13.952`–`13.954`, not implementation details.
 *
 * ### The two deltas this change DOES close, and the one it does not
 *
 * The zebra row surface and three strings. The zebra is the prototype's own
 * construct — `(i % 2 ? ";background:var(--fill4)" : "")` over a **0-based** `i`
 * (`desktop.dc.html:3159`), so the tint falls on the **1-indexed EVEN** rows —
 * and this screen's rule takes that parity exactly, `:nth-child(even)` over the
 * rows list, the same shape and the same token the Members roster shipped until UX fixes T6 (23.095) swapped its zebra for
 * a hairline. **Two other families in this repo ported
 * this same construct to ODD and therefore read inverted against the prototype
 * (`.gn-list__table-row`, `ui.css:1088`; `.gn-timeline__row`, `:2703`) — that
 * inversion is already recorded, with a named owner, in `ui.css`'s `.ticket-type-list__row` zebra block,
 * and harmonising them is not this screen's to do.**
 *
 * The three strings: the action is the prototype's `"New type"` (`:823`), the h2
 * carries its `20px/25px` (`:820`), and the summary is its sentence (data
 * `:3150`) — **keeping this screen's singular handling, which the prototype's own
 * `${n} types.` does not have.**
 *
 * **The prototype's leading 34px rank tile is a delta this change does not
 * close** — the row still leads with `<TypeIcon>` and carries the rank in the
 * meta line (`rank N`). It is neither ruled nor held; it simply is not in this
 * task's scope, and it is reported rather than silently dropped.
 */
export function TicketTypeListScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  onOpen(typeId: string): void;
  onNew(): void;
}) {
  const [types, setTypes] = useState<TicketTypeDef[] | null>(null);
  // Workflow names for the meta line.
  const [workflows, setWorkflows] = useState<PublishedWorkflowDef[] | null>(null);
  // A read that REJECTED — distinct from a read still in flight, which is what
  // `types === null` alone says. The two were one state until E2-20: a rejected
  // `Promise.all` left both halves null, so the gate below drew an error as a load
  // that never ends.
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * Every type's OWN ticket count, or `'unavailable'`.
   *
   * Three states rather than two, and each one is a distinct claim: `null` is
   * "not asked yet", the record is the answer, and `'unavailable'` is "the read
   * failed". Collapsing the last into `{}` would render a confident `0 tickets`
   * for every type on the strength of a request that never came back — the
   * invented count `divergenceBody` in the editor screen refuses to print.
   *
   * **This is not `getTypeWorkflowPopulation`.** That answers "how many are on
   * THIS workflow", and a ticket pins the workflow it was created under, so its
   * number stops being the type's count the moment a re-point leaves tickets
   * behind — the very divergence the editor screen exists to show.
   */
  const [ticketCounts, setTicketCounts] = useState<Record<string, number> | 'unavailable' | null>(null);
  // A refusal the CLIENT did not predict. The client predicts the one refusal it
  // knows about (`type.builtin-rank`, below, by disabling the arrow that would
  // provoke it), but the server is the authority and may refuse for a reason
  // this screen does not model. Swallowing it would render a control that does
  // nothing, which a reader cannot tell from a click that worked.
  const [reorderRefusal, setReorderRefusal] = useState<{ rule: string; reason: string } | null>(null);
  // One swap at a time. Without this, a second click landing inside the first
  // `submit`'s round-trip computes from the PRE-swap array and overwrites it —
  // probed by review: two clicks in one tick folded to two types sharing a rank,
  // the exact tie the two-event swap exists to prevent. Every arrow is disabled
  // while a swap is in flight.
  const [reorderPending, setReorderPending] = useState(false);
  /** Per-mount prefix for the reorder reasons' ids — see the buttons' note. */
  const reorderReasonId = useId();
  const { gateway, workspaceId } = props;
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    void Promise.all([gateway.listTicketTypes(workspaceId), gateway.listWorkflows(workspaceId)])
      .then(([loadedTypes, loadedWorkflows]) => {
        if (cancelled) return;
        setTypes(loadedTypes);
        setWorkflows(loadedWorkflows);
      })
      // Without this arm a rejected read left both `types` and `workflows` null,
      // which the gate below draws as "Loading ticket types…" — an error reported
      // as a load that never ends, on the two screens the help corpus calls the
      // ones that make the product yours. The sentence is the one every sibling
      // data screen in this package already uses (`workflow-list-screen.tsx:198`,
      // `workflow-builder-screen.tsx:88`), and it names the one recovery there is.
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    // A SEPARATE promise, and its own rejection handler. Folded into the
    // `Promise.all` above, a failed count would reject the whole tuple and take
    // the LIST down to the load-error arm for a failed count — the counts are one
    // segment of one meta line and must not be able to take the list down.
    void gateway.getTicketCountsByType(workspaceId).then(
      (counts) => {
        if (!cancelled) setTicketCounts(counts);
      },
      () => {
        if (!cancelled) setTicketCounts('unavailable');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId]);

  // The error arm goes BEFORE the loading gate, the order `settings/page.tsx:277-284`
  // records: a failed read and a read still in flight are different states, and a
  // reader who sees the loading sentence cannot tell them apart.
  if (loadFailed) {
    return <p className="ticket-type-list__load-error">Could not load ticket types — reload to try again.</p>;
  }
  if (types === null || workflows === null) return <p className="ticket-type-list__loading">Loading ticket types…</p>;
  // The narrowed array, named once. `types` is still `TicketTypeDef[] | null` to
  // TypeScript INSIDE the two closures below — the early return narrows it for
  // this render scope only, and a closure may outlive it. Reading the narrowed
  // value here is what makes the reorder helpers type-check without a `!`.
  const orderedTypes = types;
  const canAuthor = canAuthorRole(props.session.role);
  const builtinIds = new Set<string>(BUILTIN_TICKET_TYPE_SEEDS.map((seed) => seed.id));
  const workflowNames = new Map<string, string>(workflows.map((workflow) => [workflow.id, workflow.name]));
  const count = types.length;

  /**
   * Why the arrow at `index` pointing `delta` cannot move anything — or `null`
   * when it can. Two blockers are structural:
   *
   *  - the END of the list has nothing to swap with;
   *  - a BUILT-IN is rank-locked server-side (`rule-engine/src/checks/ticket-type.ts:60-62`
   *    refunds `type.builtin-rank`), and that refusal is PER EVENT — `IngestResult`
   *    carries one result per submitted event. A swap that moved a built-in would
   *    therefore HALF commit: the other type's re-rank lands, the built-in's is
   *    refused, and the two then share a rank, which the server's own
   *    `ORDER BY rank, type_id` resolves by an id — that is, by nothing a person
   *    can see. So the arrow is disabled rather than the refusal discovered.
   */
  function moveBlocker(index: number, delta: -1 | 1): string | null {
    const target = index + delta;
    if (reorderPending) return 'A reorder is already in flight.';
    if (target < 0) return 'This type is already first.';
    if (target > orderedTypes.length - 1) return 'This type is already last.';
    if (builtinIds.has(orderedTypes[index]!.id) || builtinIds.has(orderedTypes[target]!.id)) {
      return 'Built-in types keep their rank.';
    }
    return null;
  }

  /**
   * Swap two adjacent types' ranks through the door that already exists.
   *
   * **Two events, not one.** Assigning only one rank would leave the moved type
   * TIED with its neighbour; both go through `ticket-type.defined` carrying the
   * whole definition, rank included, which is why this needs no new route and no
   * new gateway op — the same door the editor's own `"Hierarchy rank"` field
   * uses (`ticket-type-editor-screen.tsx:283-309`).
   */
  async function moveType(index: number, target: number): Promise<void> {
    // The span the move touches: every type from the nearer end to the farther. The moved type takes
    // the slot at `target`; each type between slides one place toward where it was, and the SLOTS'
    // ranks stay where they are — so the ranks held by the span are only re-dealt, never invented.
    const lo = Math.min(index, target);
    const hi = Math.max(index, target);
    const span = orderedTypes.slice(lo, hi + 1);
    const ranks = span.map((type) => type.rank);
    const reordered = span.filter((type) => type.id !== orderedTypes[index]!.id);
    reordered.splice(target - lo, 0, orderedTypes[index]!);
    const next = reordered.map((type, offset) => ({ ...type, rank: ranks[offset]! }));
    setReorderPending(true);
    try {
      const results = await gateway.submit(
        next.map((def) =>
          buildTicketTypeDefinedEvent({ workspaceId, actorId: props.session.userId, origin: 'web', def }),
        ),
      );
      const refusal = results.find((result) => result.status === 'refused');
      if (refusal !== undefined && refusal.status === 'refused') {
        setReorderRefusal({ rule: refusal.rule, reason: refusal.reason });
        return;
      }
      const invalid = results.find((result) => result.status === 'invalid');
      if (invalid !== undefined && invalid.status === 'invalid') {
        setReorderRefusal({ rule: invalid.code, reason: invalid.message });
        return;
      }
      setReorderRefusal(null);
      // Apply what was COMMITTED rather than re-reading: the ranks are now what
      // we sent, and a re-read of a fake — or of a server that has not yet
      // caught up — would show the old order and make a working control look
      // broken.
      //
      // FUNCTIONAL, and matched by id: the update is computed against the state
      // as it is NOW, never against the render-scope `orderedTypes` snapshot this
      // click was born in. Applying a snapshot is what let a second click inside
      // the round-trip overwrite the first swap's result.
      const committed = new Map(next.map((type) => [type.id, type.rank]));
      setTypes((previous) =>
        previous === null
          ? null
          : previous
              .map((type) => (committed.has(type.id) ? { ...type, rank: committed.get(type.id)! } : type))
              .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      );
    } finally {
      setReorderPending(false);
    }
  }

  /** Where "Move to top" goes: the first slot of the unbroken run of custom types ending at `index`. */
  function topOfCustomRun(index: number): number {
    let top = index;
    while (top > 0 && !builtinIds.has(orderedTypes[top - 1]!.id)) top -= 1;
    return top;
  }
  /**
   * The `"N tickets"` meta segment, LAST in the line — which is where the
   * prototype puts it (`desktop.dc.html:3156`, `fields · wf · N tickets`, after
   * the workflow name), and the only ordering fact this segment has.
   *
   * `null` while the read is in flight, so the segment is ABSENT rather than
   * showing a number nobody has yet — and rather than leaving the `·` before it
   * dangling. A failure says `tickets unavailable` in words: `0` is a real
   * answer for a type that genuinely holds nothing, and a screen that printed it
   * for a request that never returned would be inventing it.
   */
  function ticketsSegment(typeId: string): ReactNode {
    if (ticketCounts === null) return null;
    let text: string;
    if (ticketCounts === 'unavailable') {
      text = 'tickets unavailable';
    } else {
      const held = ticketCounts[typeId] ?? 0;
      text = `${held} ${held === 1 ? 'ticket' : 'tickets'}`;
    }
    return (
      <>
        <span className="ticket-type-list__meta-sep" aria-hidden="true">
          ·
        </span>
        <span className="ticket-type-list__tickets">{text}</span>
      </>
    );
  }

  return (
    <section className="ticket-type-list">
      <header className="ticket-type-list__header">
        <div className="ticket-type-list__heading">
          <h2 className="ticket-type-list__title">Ticket types</h2>
          <p className="ticket-type-list__summary">
            {`${count} ${count === 1 ? 'type' : 'types'}. Rank orders them in every picker.`}
          </p>
        </div>
        {canAuthor ? (
          <Button variant="primary" className="ticket-type-list__new" onClick={props.onNew}>
            New type
          </Button>
        ) : null}
      </header>
      {canAuthor ? null : <ReadOnlyBanner />}
      {reorderRefusal === null ? null : (
        <p className="ticket-type-list__reorder-refusal" role="alert">
          {reorderRefusal.reason}
        </p>
      )}
      <Card className="ticket-type-list__card">
        <ul className="ticket-type-list__rows">
          {types.map((type, index) => (
            <li key={type.id}>
              <button
                type="button"
                className="ticket-type-list__row"
                aria-label={`${canAuthor ? 'Edit' : 'Open'} ${type.name}`}
                onClick={() => props.onOpen(type.id)}
              >
                <span className="ticket-type-list__icon">
                  <TypeIcon name={type.icon} />
                </span>
                <span className="ticket-type-list__info">
                  <span className="ticket-type-list__name">{type.name}</span>
                  <span className="ticket-type-list__meta">
                    <span className="ticket-type-list__rank">{`rank ${type.rank}`}</span>
                    <span className="ticket-type-list__meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="ticket-type-list__fields">
                      {type.fields.length === 1 ? '1 field' : `${type.fields.length} fields`}
                    </span>
                    <span className="ticket-type-list__meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="ticket-type-list__workflow">
                      {workflowNames.get(type.workflowId) ?? 'an unknown workflow'}
                    </span>
                    {ticketsSegment(type.id)}
                  </span>
                </span>
                {builtinIds.has(type.id) ? <span className="ticket-type-list__badge">Built-in</span> : null}
              </button>
              {canAuthor && !builtinIds.has(type.id) ? (
                // A SIBLING of the row door, never a child: the whole row is one `<button>` (the row-as-door
                // ruling), and a button inside a button is an invalid tree jsdom renders without complaint.
                // UX fixes T10 (SET-03): one "Reorder" door on a CUSTOM row, after the door so every row's
                // door starts at the same left edge; a built-in is rank-locked and carries no control at all.
                <span className="ticket-type-list__reorder">
                  <ReorderMenu
                    name={type.name}
                    typeId={type.id}
                    reasonId={reorderReasonId}
                    upBlocker={moveBlocker(index, -1)}
                    downBlocker={moveBlocker(index, 1)}
                    onUp={() => void moveType(index, index - 1)}
                    onDown={() => void moveType(index, index + 1)}
                    onTop={() => void moveType(index, topOfCustomRun(index))}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {/*
          E5-14 — WHY THE ARROWS DO NOTHING. All ten ↑/↓ controls render disabled,
          and the reason lived only in each button's `title` attribute
          (`moveBlocker`, "Built-in types keep their rank.") — a hover tooltip,
          with no touch or keyboard equivalent. A reader on a phone met ten dead
          controls and no explanation anywhere on the page.

          The second sentence is the tie, which is the same finding's other half:
          the shipped seed already puts two types at rank 3, and the two-event
          swap exists precisely to prevent a tie. `orderedTypes` breaks one by id
          (`.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : …))`), so a tie
          draws in a fixed order that says nothing about precedence — which is
          worth a reader knowing rather than inferring from two rows that read
          "rank 3".
        */}
        <p className="ticket-type-list__reorder-note" data-testid="ticket-type-reorder-note">
          Built-in types keep their rank; custom types reorder among themselves. Two types that share
          a rank are drawn in id order.
        </p>
      </Card>
    </section>
  );
}

/**
 * The "Reorder" menu on a custom row (UX fixes T10, SET-03, case 23.171): Move up / Move down / Move to top
 * in the shared `Popover`. A blocked item stays disabled and says why in words — a visually-hidden reason the
 * button points at, plus the `title` for a hovering reader (the pair the arrows carried).
 */
function ReorderMenu(props: {
  name: string;
  typeId: string;
  reasonId: string;
  upBlocker: string | null;
  downBlocker: string | null;
  onUp: () => void;
  onDown: () => void;
  onTop: () => void;
}): ReactNode {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const item = (key: 'up' | 'down' | 'top', label: string, blocker: string | null, run: () => void): ReactNode => (
    <>
      <button
        type="button"
        className="ticket-type-list__menu-item"
        disabled={blocker !== null}
        aria-describedby={blocker === null ? undefined : `${props.reasonId}-${key}-${props.typeId}`}
        title={blocker ?? label}
        onClick={() => {
          setOpen(false);
          run();
        }}
      >
        {label}
      </button>
      {blocker !== null && (
        <span id={`${props.reasonId}-${key}-${props.typeId}`} style={VISUALLY_HIDDEN}>
          {blocker}
        </span>
      )}
    </>
  );
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ticket-type-list__move"
        aria-label={`Reorder ${props.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        Reorder
      </button>
      <Popover triggerRef={triggerRef} open={open} onClose={() => setOpen(false)} aria-label={`Reorder ${props.name}`}>
        <div className="ticket-type-list__menu">
          {item('up', 'Move up', props.upBlocker, props.onUp)}
          {item('down', 'Move down', props.downBlocker, props.onDown)}
          {item('top', 'Move to top', props.upBlocker, props.onTop)}
        </div>
      </Popover>
    </>
  );
}
