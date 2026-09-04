import type { TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import { EPIC_RANK } from '@gisik-nokma/app-core';
import type { CustomDateField, ListRow, TicketDatesInput } from '@gisik-nokma/app-core';

/**
 * A `ListRow` as the calendar and the timeline take it.
 *
 * ## Why this exists here, and why it is not a second adapter
 *
 * Plan 6's Step 5b writes `(list.rows ?? []).map(toTicketDatesInput)` and says
 * Plan 9's Task 8 owns the one description of that adapter; Plan 9's Task 14
 * repeats the instruction. Measured: Task 8 landed `dateClaimOf`,
 * `customDateClaimsOf` and `titleOf` — the READERS of a `TicketDatesInput` — and
 * no `toTicketDatesInput` anywhere (`grep -rn "toTicketDatesInput" packages apps`
 * returns only the plan text). So there is no adapter to reuse and the mount
 * cannot compile without one. It lives in the shell rather than in app-core for
 * the reason `claims/ticket-dates.ts` already states about this exact seam: "the
 * mounting shell maps the DataSource's read result into this shape — one site to
 * adjust, and the one place that resolves a `TicketTypeDef` into
 * `customDateFields`". This is that site.
 *
 * ## FOUR FIELDS ARE SYNTHESIZED, AND HERE IS EXACTLY WHICH
 *
 * `TicketDatesInput.state` is a domain `TicketState`. A `ListRow` is not one and
 * cannot be made into one: `online/mappers.ts` refuses `getTickets` outright,
 * and even the `TicketCard` behind it carries no `transitions`. FOUR of the
 * fourteen `TicketState` fields are therefore not the server's answer, and the
 * two the route segments supply are listed beside them so the table is the whole
 * account of where every field comes from:
 *
 * | field             | value      | why it cannot be read from a `ListRow`            |
 * |-------------------|------------|---------------------------------------------------|
 * | `workspaceId`     | the route's| NOT synthesized — the page owns it, and it is true |
 * | `projectId`       | the route's| NOT synthesized — same                             |
 * | `workflowId`      | `''`       | dropped by `ListRow`; the TYPE's binding is not the ticket's (a ticket pins the workflow it was created under, `entity-state.ts`), so reading it off `TicketTypeDef.workflowId` would be a plausible WRONG answer |
 * | `workflowVersion` | `0`        | same                                               |
 * | `collaboratorIds` | `[]`       | dropped by `ListRow`                               |
 * | `transitions`     | `[]`       | never served to any client on this branch          |
 *
 * `workflowId` is `''` and not a made-up id on purpose: `ticketTypeDefSchema`
 * requires `min(1)`, so the empty string is unmistakably "this shell does not
 * know" rather than something a reader could mistake for a real binding.
 *
 * **What reads them, stated rather than left to be discovered.** On the
 * calendar/timeline path nothing does: `calendar-model.ts` and
 * `timeline-model.ts` read `state.id`, `state.typeId` and `state.parentId`
 * (through `epicAncestorOf`), and `ticket-dates.ts` reads `state.fields`. The
 * ONE consumer of the synthesized four is `matchesFilter`, and it runs only when
 * a `filter` option is passed to the model — which the project page's mount does
 * not pass. So the exposure is conditional and it is named: **the day a filter
 * is wired onto the calendar or timeline tab, its `collaboratorIds` axis will
 * silently match nothing**, because every row's collaborator list is `[]` here.
 * That is a fact about `ListRow`'s serving gap, not about this function, and it
 * closes when Plan 7's list route serves the field. Structural, not tested —
 * asserting a filter this mount never passes would be a test of the fixture.
 *
 * ## `pendingFieldIds` is `[]` and that one is TRUE, not synthesized
 *
 * It names the claims applied from an outbox and not yet accepted. This shell is
 * online-only — `BoardCard.pending` is documented as "true only between submit
 * and the server's answer (web is online-only)" — so at the moment a list read
 * lands there is no outbox and nothing is in transit. Plan 10's replica is where
 * that array stops being empty, and it maps its own rows.
 */
export function toTicketDatesInput(
  row: ListRow,
  scope: { workspaceId: string; projectId: string },
  customDateFields: readonly CustomDateField[],
): TicketDatesInput {
  const state: TicketState = {
    kind: 'ticket',
    id: row.ticketId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    typeId: row.typeId,
    parentId: row.parentId,
    workflowId: '',
    workflowVersion: 0,
    stateId: row.stateId,
    stateCategory: row.stateCategory,
    assigneeId: row.assignee?.id ?? null,
    collaboratorIds: [],
    // `row.fields` is the whole claim record the list route already assembles —
    // `title`, `dueDate`, `startDate` and every custom field — so the date
    // readers get the server's claims verbatim, with their actors and both
    // clocks. Nothing here reshapes a claim on its way to a view; that would be
    // the second origin the amendment exists to prevent.
    fields: row.fields,
    transitions: [],
  };
  return { state, pendingFieldIds: [], customDateFields };
}

/**
 * The custom `date`-kind fields of a ticket's own type, in the type's declared
 * field order.
 *
 * Keyed by `typeId` because a project holds tickets of several types and each
 * declares its own fields: one flattened list would offer every type's date
 * fields to every ticket, and `customDateClaimsOf` would then emit an entry for
 * any row that happened to carry a same-named claim. An UNKNOWN type answers the
 * empty list — narrower than the truth, never wrong about it, exactly as
 * `ticket-dates.ts` describes the optional `customDateFields` prop.
 */
export function customDateFieldsByType(
  types: readonly TicketTypeDef[],
): ReadonlyMap<string, readonly CustomDateField[]> {
  const byType = new Map<string, readonly CustomDateField[]>();
  for (const type of types) {
    byType.set(
      type.id,
      type.fields
        .filter((field) => field.type === 'date')
        .map((field) => ({ id: field.id, name: field.name })),
    );
  }
  return byType;
}

/**
 * What this workspace calls an epic, from its own type roster.
 *
 * `EPIC_RANK` is 1 and the server groups by it (`apps/server/src/routes/list.ts`);
 * `epic-ancestor.ts` says a shell that has resolved the roster "should pass its
 * own rank-1 predicate instead, and then client and server agree exactly". This
 * is that predicate. It is built ONLY from a roster that arrived: while the read
 * is in flight or refused the page passes nothing and both views fall back to
 * app-core's own `isBuiltinEpicType` — narrower than the truth (the built-in
 * `epic` id only), never wrong about it. A predicate built from an absent roster
 * would answer `false` for every type, including `epic`, which is wrong about it.
 */
export function rankOneEpicPredicate(types: readonly TicketTypeDef[]): (typeId: string) => boolean {
  // `EPIC_RANK` is IMPORTED, never the literal `1`: app-core already states the
  // rank the server groups by, and a second statement of it here is a second
  // answer to "what is an epic" living one import away from the first.
  const epicTypeIds = new Set(types.filter((type) => type.rank === EPIC_RANK).map((type) => type.id));
  return (typeId: string) => epicTypeIds.has(typeId);
}
