import { useEffect, useState } from 'react';
import { BUILTIN_TICKET_TYPE_SEEDS, type PublishedWorkflowDef, type TicketTypeDef } from '@gisik-nokma/domain';
import { Button, Card } from '@gisik-nokma/ui';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.js';
import { ReadOnlyBanner } from '../ui/read-only-banner.js';
import { TypeIcon } from './icons.js';

/**
 * `/settings?tab=ticket-types` and `/w/[workspaceId]/settings/ticket-types` —
 * the type list (prototype `design-system/interactive/desktop.dc.html:817-839`,
 * blob `6d7b67c0a52c` at commit `227434a5`).
 *
 * ## WHAT IS DRAWN, and the four things that are NOT
 *
 * The prototype draws a header (an h2, a summary line and a `"New type"` action
 * over a card of rows), and each row as a flex line: a 34px rank tile, the name
 * and a meta line, an optional badge, two reorder controls and an `Edit` button.
 * **The header, the card, the rows, the meta line and the `Built-in` badge are
 * all drawn here. Four elements are ABSENT, and not one of them is an
 * oversight** — two are rulings, two are holds, and each is recorded here so a
 * reader comparing this screen to the prototype meets a decision rather than a
 * silence.
 *
 * - **the `Edit` button — RULED: NOT BUILT** (owner, 2026-09-18). Row-as-door is
 *   a **pre-existing** owner ruling, quoted at the rule itself (`packages/ui/src/
 *   ui.css:1603-1611`, owner 2026-09-10: *"remove [Edit] and open on just
 *   clicking the entire card/row"*). The whole row is one
 *   `<button aria-label={\`Edit ${type.name}\`}>` (`:65-70`), so an `Edit` button
 *   beside it would be a second door to the same place — not a port.
 * - **the `"Draft"` badge — RULED: NOT BUILT** (owner, 2026-09-18). A draft ticket
 *   type is not a state this product has, so `TicketTypeDef` gains no draft flag
 *   and no event carries one. The prototype's other badge value (`"Built-in"`) IS
 *   drawn, beside the rank in the meta line.
 * - **the ↑/↓ reorder controls — HELD, and the hold is NOT about a missing door.**
 *   `docs/lanes/owner-holds.md` §1 puts *"`isTypes` | reorder and per-type counts"*
 *   on the owner's hold list, and that register's own rule is that a hold lifts
 *   only when the owner names it. **Measured 2026-09-18, before writing this,
 *   because the hold's stated scope is screens *"whose prototype controls have no
 *   server behind them"* — and for the reorder that premise does not hold.** The
 *   gateway declares no update op of any kind (`../gateway.ts:56-94`), but the
 *   door is not the gateway's: `onSave` authors a `ticket-type.defined` event
 *   carrying the whole definition — `rank` included
 *   (`ticket-type-editor-screen.tsx:178-204`) — and sends it through
 *   `gateway.submit`. `ticketTypeDefSchema` carries `rank: z.number().int().min(1)`
 *   (`packages/domain/src/ticket-types.ts:98`), so a reorder control would be
 *   *assign a different rank and submit*, which is what the editor's own
 *   `"Hierarchy rank"` field already does. **No new route and no new projection
 *   — so if the hold lifts, this is a render task, not the wire task the delta
 *   audit scoped it as.** Two things a later implementer must carry that the
 *   prototype does not model: the four built-ins are rank-locked server-side
 *   (`packages/rule-engine/src/checks/ticket-type.ts:60-62` refunds
 *   `type.builtin-rank`), so a swap that moved a built-in would be REFUSED rather
 *   than merely surprising; and the prototype's rank is its array index
 *   (`rank: String(i + 1)`, `desktop.dc.html:3150`), while this product's is a
 *   stored number that nothing enforces uniqueness on.
 * - **the `"N tickets"` meta segment — HELD, the same register row.** Unlike the
 *   reorder, this one genuinely needs server surface: the only population read is
 *   `getTypeWorkflowPopulation(workspaceId, typeId, workflowId)`, **pinned to one
 *   workflow**, and the route behind it counts `WHERE workflow_id = $n`
 *   (`apps/server/src/routes/builder-reads.ts:408-414`). Every ticket pins the
 *   workflow it was created under, so that number stops being the type's count
 *   the moment a rebind leaves tickets behind — which is why the meta line names
 *   `rank N · N fields · <workflow name>` and no count at all, and why this
 *   screen's earlier note (`:17-23`) refused to print one.
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
 * (`.gn-list__table-row`, `ui.css:1088`; `.gn-timeline__row`, `:2671`) — that
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
  // in the editor screen refuses to print. A type-wide count is a HELD item
  // (`docs/lanes/owner-holds.md` §1) — see this file's docblock.
  const [workflows, setWorkflows] = useState<PublishedWorkflowDef[] | null>(null);
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
  const canAuthor = canAuthorRole(props.session.role);
  const builtinIds = new Set<string>(BUILTIN_TICKET_TYPE_SEEDS.map((seed) => seed.id));
  const workflowNames = new Map<string, string>(workflows.map((workflow) => [workflow.id, workflow.name]));
  const count = types.length;
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
      <Card className="ticket-type-list__card">
        <ul className="ticket-type-list__rows">
          {types.map((type) => (
            <li key={type.id}>
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
