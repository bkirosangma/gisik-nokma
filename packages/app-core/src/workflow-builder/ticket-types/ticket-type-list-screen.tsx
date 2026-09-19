import { useEffect, useState } from 'react';
import { BUILTIN_TICKET_TYPE_SEEDS, type PublishedWorkflowDef, type TicketTypeDef } from '@gisik-nokma/domain';
import { Button, Card } from '@gisik-nokma/ui';
import { buildTicketTypeDefinedEvent } from '../events.js';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.js';
import { ReadOnlyBanner } from '../ui/read-only-banner.js';
import { TypeIcon } from './icons.js';

/**
 * `/settings?tab=ticket-types` and `/w/[workspaceId]/settings/ticket-types` —
 * the type list (prototype `design-system/interactive/desktop.dc.html:817-839`,
 * blob `6d7b67c0a52c` at commit `227434a5`).
 *
 * ## WHAT IS DRAWN, and the three things that are NOT
 *
 * The prototype draws a header (an h2, a summary line and a `"New type"` action
 * over a card of rows), and each row as a flex line: a 34px rank tile, the name
 * and a meta line, an optional badge, two reorder controls and an `Edit` button.
 * **The header, the card, the rows, the meta line, the two reorder controls and
 * the `Built-in` badge are all drawn here. THREE elements are ABSENT, and not
 * one of them is an oversight** — two are rulings, one is lifted-and-queued, and each is
 * recorded here so a reader comparing this screen to the prototype meets a
 * decision rather than a silence. (The count was FOUR until 2026-09-19, when the
 * owner lifted the hold on the reorder; a reader who remembers the earlier
 * number should read the ↑/↓ bullet below for what changed and why.)
 *
 * - **the `Edit` button — RULED: NOT BUILT** (owner, 2026-09-18). Row-as-door is
 *   a **pre-existing** owner ruling, quoted at the rule itself (`packages/ui/src/
 *   ui.css:1811-1812`, owner 2026-09-10: *"remove [Edit] and open on just
 *   clicking the entire card/row"*). The whole row is one
 *   `<button aria-label={\`Edit ${type.name}\`}>` (`:311-337`), so an `Edit` button
 *   beside it would be a second door to the same place — not a port.
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
 * - **the `"N tickets"` meta segment — LIFTED 2026-09-19 and QUEUED as Task 8, not built.**
 *   Two committed documents disagree about its status and both are quoted here rather
 *   than one of them being silently dropped: `docs/lanes/owner-holds.md` §1 reads
 *   *"`isTypes` | reorder and per-type counts | **LIFTED 2026-09-19 — both halves
 *   approved**"*, and its verbatim ruling table says *"per-type counts | **yes** |
 *   build it"* — so this is **not a hold**. The dispatch that built the reorder
 *   (`CTL-DISPATCH-2026-09-19-lifted-settings-tasks.md`) calls it *"still
 *   held-and-unbuilt"*, which the register contradicts. **Either way it is not in
 *   this change**, and a reader who needs the status should follow the register.
 *   Unlike the reorder, this one genuinely needs server surface: the only population read is
 *   `getTypeWorkflowPopulation(workspaceId, typeId, workflowId)`, **pinned to one
 *   workflow**, and the route behind it counts `WHERE workflow_id = $n`
 *   (`apps/server/src/routes/builder-reads.ts:408-414`). Every ticket pins the
 *   workflow it was created under, so that number stops being the type's count
 *   the moment a rebind leaves tickets behind — which is why the meta line names
 *   `rank N · N fields · <workflow name>` and no count at all, and why this
 *   screen's earlier note (`:115-122`) refused to print one.
 *   **If it needs a new projection rather than a query, it is a different size of
 *   task** (`docs/superpowers/plans/2026-09-18-settings-workflows-port.md:162`).
 *
 * ### The two deltas this change DOES close, and the one it does not
 *
 * The zebra row surface and three strings. The zebra is the prototype's own
 * construct — `(i % 2 ? ";background:var(--fill4)" : "")` over a **0-based** `i`
 * (`desktop.dc.html:3159`), so the tint falls on the **1-indexed EVEN** rows —
 * and this screen's rule takes that parity exactly, `:nth-child(even)` over the
 * rows list, the same shape and the same token `.gn-members__row` already ships
 * (`apps/web/app/globals.css:1524`). **Two other families in this repo ported
 * this same construct to ODD and therefore read inverted against the prototype
 * (`.gn-list__table-row`, `ui.css:1088`; `.gn-timeline__row`, `:2703`) — that
 * inversion is already recorded, with a named owner, at `globals.css:1518-1523`,
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
  // Workflow names for the meta line only — never a ticket count. There is no
  // `countTicketsOfType(typeId)` on the gateway, and `getTypeWorkflowPopulation`
  // answers "how many are on THIS workflow", which stops being the type's whole
  // count the moment a rebind leaves tickets behind on a workflow it no longer
  // names (the very divergence this package's editor screen exists to show).
  // Showing a number here would be exactly the invented count `divergenceBody`
  // in the editor screen refuses to print. A type-wide count is a separate, LIFTED item — queued as Task 8, not built here;
  // see this file's docblock for the two documents that disagree about its status.
  const [workflows, setWorkflows] = useState<PublishedWorkflowDef[] | null>(null);
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
  const { gateway, workspaceId } = props;
  useEffect(() => {
    let cancelled = false;
    void Promise.all([gateway.listTicketTypes(workspaceId), gateway.listWorkflows(workspaceId)]).then(
      ([loadedTypes, loadedWorkflows]) => {
        if (cancelled) return;
        setTypes(loadedTypes);
        setWorkflows(loadedWorkflows);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId]);

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
  async function moveType(index: number, delta: -1 | 1): Promise<void> {
    const target = index + delta;
    const moving = orderedTypes[index]!;
    const other = orderedTypes[target]!;
    setReorderPending(true);
    try {
      const results = await gateway.submit([
        buildTicketTypeDefinedEvent({
          workspaceId,
          actorId: props.session.userId,
          origin: 'web',
          def: { ...moving, rank: other.rank },
        }),
        buildTicketTypeDefinedEvent({
          workspaceId,
          actorId: props.session.userId,
          origin: 'web',
          def: { ...other, rank: moving.rank },
        }),
      ]);
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
      setTypes((previous) =>
        previous === null
          ? null
          : previous
              .map((type) =>
                type.id === moving.id
                  ? { ...type, rank: other.rank }
                  : type.id === other.id
                    ? { ...type, rank: moving.rank }
                    : type,
              )
              .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      );
    } finally {
      setReorderPending(false);
    }
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
              {canAuthor ? (
                // SIBLINGS of the row, never children: the whole row is one
                // `<button>` (`:311-337`, the row-as-door ruling), and a button
                // inside a button is an invalid tree jsdom renders without
                // complaint — so the controls sit beside the door.
                <span className="ticket-type-list__reorder">
                  <button
                    type="button"
                    className="ticket-type-list__move"
                    aria-label={`Move ${type.name} up`}
                    title={moveBlocker(index, -1) ?? `Move ${type.name} up`}
                    disabled={moveBlocker(index, -1) !== null}
                    onClick={() => {
                      void moveType(index, -1);
                    }}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="ticket-type-list__move"
                    aria-label={`Move ${type.name} down`}
                    title={moveBlocker(index, 1) ?? `Move ${type.name} down`}
                    disabled={moveBlocker(index, 1) !== null}
                    onClick={() => {
                      void moveType(index, 1);
                    }}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              ) : null}
              <button
                type="button"
                className="ticket-type-list__row"
                aria-label={`Edit ${type.name}`}
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
                  </span>
                </span>
                {builtinIds.has(type.id) ? <span className="ticket-type-list__badge">Built-in</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
