import type { IngestResult, StateCategory, WorkflowDef } from '@gisik-nokma/domain';
import type {
  Actor,
  BoardCard,
  BoardColumn,
  BoardGroup,
  BoardView,
  ClaimProvenance,
  FilterSpec,
  Grouping,
  ListColumnId,
  ProjectViewPrefs,
  RollupToViewer,
  SavedFilter,
  TicketHistoryEvent,
  TransitionCause,
  UserPreferences,
} from '../view-types.js';

/**
 * The ONE adaptation layer between the shipped `/v1` JSON and the client
 * contract (Plan 6's adaptation rule: nothing outside `src/online/` may know a
 * server spelling). A garbled read fails loudly here; it never renders as a
 * half-truth.
 *
 * ## Three failures, three classes, because they have three different owners
 *
 * - `MappingError` — the response is not the shape this client can read. The
 *   server is wrong, the network is wrong, or the two have drifted.
 * - `ServingGapError` — the response is exactly right and the client view type
 *   still cannot be filled honestly, because the server holds a fact it does not
 *   put on the wire (or has one it never computes). Nobody is wrong; a route has
 *   to change, and the error names WHICH FIELDS and WHO OWNS IT.
 * - `UnexpressibleFilterError` — the client is asking for something the shipped
 *   route's query language cannot say. That one is about a REQUEST, so it is
 *   deliberately not a `MappingError`: no response was involved.
 *
 * ## Why several mappers below are nothing but a refusal
 *
 * Six of the twelve `DataSourceQuery` methods cannot be answered over the routes
 * that shipped. The register — coordination doc, "Step 11 (Plan 6 remainder) —
 * the `DataSource` register, re-derived, and RULING REQUEST P25" — holds the
 * measurement; each refusal below repeats only its own half. A mapper that
 * returned a plausible-looking view with `stateName: card.stateId` or
 * `contested: []` would be the exact failure this series is named for: it would
 * be indistinguishable, on screen, from an answer.
 *
 * The absence lists are DATA (`Absence[]`), not prose, for a reason that is
 * measured rather than tidy: `apps/server/test/integration/client-contract.test.ts`
 * reads this file's source, extracts each list, and asserts every `wireKey` in
 * it is genuinely absent from a real `/v1` body. So the day a route starts
 * serving one of these facts, the refusal that still names it goes RED on the
 * server side — which is the only place that can notice, since nothing in this
 * package talks to a server.
 */
export class MappingError extends Error {
  constructor(path: string, expected: string) {
    super(`response mapping failed at ${path}: expected ${expected}`);
    this.name = 'MappingError';
  }
}

/**
 * One fact a view type needs and the wire does not carry.
 *
 * `field` is the client path. `wireKey` is the key the server would have to send
 * to close it — the thing the contract suite checks is really absent today.
 * `owner` names who closes it, because an absence with no owner is a gap that
 * gets dropped rather than deferred.
 *
 * `wireRoute` is the `/v1` path whose real body that check is made AGAINST, and
 * it exists because an absence is not always missing from the route the client
 * method calls. `MyWorkView.contested` is the case that forced it: `/v1/me/work`
 * does not serve contests and never will, because `GET /v1/contests` already
 * does — so the key that would close the gap has to be looked for THERE, and a
 * cross-check pointed at the my-work body would have measured the wrong route
 * and called it evidence. `null` on either field means no route can close this:
 * the client TYPE is the owner (`FilterSpec` has no key for the server's
 * `blocked` term; `ClaimProvenance` requires an instant the system never
 * recorded).
 */
export type Absence = {
  field: string;
  wireKey: string | null;
  wireRoute: string | null;
  because: string;
  owner: string;
};

/** The response was fine. The view type still cannot be filled honestly. */
export class ServingGapError extends MappingError {
  readonly absences: readonly Absence[];
  constructor(method: string, absences: readonly Absence[]) {
    super(
      method,
      `facts the shipped route does not serve — ${absences
        .map((absence) => `${absence.field} (${absence.because}; owner: ${absence.owner})`)
        .join('; ')}`,
    );
    this.name = 'ServingGapError';
    this.absences = absences;
  }
}

/** A request the shipped route's query language cannot express. */
export class UnexpressibleFilterError extends Error {
  constructor(key: string, detail: string) {
    super(`filter key ${key} cannot be expressed by the shipped read surface: ${detail}`);
    this.name = 'UnexpressibleFilterError';
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MappingError(path, 'an object');
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new MappingError(path, 'an array');
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new MappingError(path, 'a string');
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number') throw new MappingError(path, 'a number');
  return value;
}

/**
 * A boolean the wire declares REQUIRED, read as one.
 *
 * The shape this replaces is `record['x'] === true`, which is not a check: it
 * answers `false` for a missing key, for `'true'`, and for a body that lost the
 * field in transit — and `false` is the harmless-looking direction of every flag
 * this client renders, so the failure is invisible on screen.
 */
function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new MappingError(path, 'a boolean');
  return value;
}

const STATE_CATEGORIES: readonly string[] = ['open', 'active', 'terminal'];

const GROUPINGS: readonly string[] = ['epic', 'status', 'assignee', 'type', 'flat'];

/** `ListColumnId`'s closed members; the sixth arm is the open `field:${string}`. */
const LIST_COLUMN_IDS: readonly string[] = ['status', 'assignee', 'dueDate', 'type', 'progress'];

function asGrouping(value: unknown, path: string): Grouping {
  const text = asString(value, path);
  if (!GROUPINGS.includes(text)) throw new MappingError(path, `one of ${GROUPINGS.join('/')}`);
  return text as Grouping;
}

/**
 * A stored column list. Validated rather than cast, because `preferencesDocSchema`
 * types these as bare strings and this module's promise is that a garbled read
 * fails here instead of reaching a view: a column id nothing renders would be a
 * silently missing column, not a visible error.
 */
function asListColumnIds(value: unknown, path: string): ListColumnId[] {
  return asArray(value, path).map((entry, index) => {
    const id = asString(entry, `${path}[${index}]`);
    if (!LIST_COLUMN_IDS.includes(id) && !id.startsWith('field:')) {
      throw new MappingError(
        `${path}[${index}]`,
        `one of ${LIST_COLUMN_IDS.join('/')} or a \`field:\` id`,
      );
    }
    return id as ListColumnId;
  });
}

function asStateCategory(value: unknown, path: string): StateCategory {
  const text = asString(value, path);
  if (!STATE_CATEGORIES.includes(text)) {
    throw new MappingError(path, `one of ${STATE_CATEGORIES.join('/')}`);
  }
  return text as StateCategory;
}

/**
 * The server's `StateProvenance` is `{actorId, clientTime, serverTime, cause}`;
 * the client's `ClaimProvenance` is the first three plus a display name, and
 * carries the cause one level up on the card. So this drops nothing: `cause` is
 * read separately by `mapBoardCard`.
 *
 * `actorName` is filled from the workspace roster when the roster names this
 * actor and left `null` otherwise — which is LOSSLESS, because the field is
 * `string | null` and `provenance.ts`'s `actorLabel` renders the raw actor id
 * for a null name. `Actor.name` (below) has no such absence value, and that
 * asymmetry is the whole reason one of these is easy and the other is not.
 */
export function mapProvenance(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string> = new Map(),
): ClaimProvenance {
  const record = asRecord(raw, path);
  const actorId = asString(record['actorId'], `${path}.actorId`);
  return {
    actorId,
    actorName: roster.get(actorId) ?? null,
    clientTime: asString(record['clientTime'], `${path}.clientTime`),
    serverTime: asString(record['serverTime'], `${path}.serverTime`),
  };
}

/**
 * `TicketRollup` → `RollupToViewer`. Three of the four fields line up by name;
 * the fourth, `uncategorizedChildren`, is REFUSED rather than dropped.
 *
 * ## Why this refuses where the assignee join (below) degrades
 *
 * The two calls look inconsistent and are decided by the same rule: refuse what
 * cannot happen in production, degrade what can.
 *
 * `read-models.ts` states the condition exactly — `uncategorizedChildren` is 0
 * whenever both projections are current, one ingest transaction writes both or
 * rolls back, and `rebuildProjection` replays the whole ledger inside one
 * transaction. Only a fixture advancing one projection and not the other, or a
 * truncation of a single table, produces a nonzero. So a throw here costs a real
 * user nothing, and what it buys is that the client never renders "5 of 8 done"
 * over counts the server has said are incomplete — `RollupToViewer` has no room
 * to say "and one more I could not categorise", so silently dropping the field
 * would turn an admitted unknown into a confident number.
 *
 * A missing assignee NAME, by contrast, is reachable on the product path today
 * (the roster excludes guests from a non-admin caller's answer), so refusing
 * there would blank a board rather than warn about one.
 *
 * The plan text also had this adapt a `{total, terminal}` spelling. No shipped
 * route sends one — `TicketRollup` is the only rollup on the `/v1` surface — and
 * an adapter for a shape nothing sends is a branch no test can reach honestly,
 * so it is not written.
 */
export function mapRollup(raw: unknown, path = 'rollup'): RollupToViewer | null {
  // `TicketCard.rollup` is `TicketRollup | null`, required. `null` is the
  // server saying this ticket has no children — the truth, and what
  // `formatRollup` renders as no progress line at all. An absent key is a
  // different claim and gets none of that leniency.
  if (raw === null) return null;
  const record = asRecord(raw, path);
  const uncategorized = asNumber(
    record['uncategorizedChildren'],
    `${path}.uncategorizedChildren`,
  );
  if (uncategorized > 0) {
    throw new MappingError(
      `${path}.uncategorizedChildren`,
      `0 — the server counted ${uncategorized} children whose state category it could not read, and RollupToViewer has no field to say so, so rendering the other counts would present an admittedly incomplete total as a complete one`,
    );
  }
  return {
    totalChildren: asNumber(record['totalChildren'], `${path}.totalChildren`),
    terminalChildren: asNumber(record['terminalChildren'], `${path}.terminalChildren`),
    restrictedCount: asNumber(record['restrictedCount'], `${path}.restrictedCount`),
  };
}

/**
 * `GET /v1/workspaces/:workspaceId/members` → `Actor[]`.
 *
 * `{userId, displayName}` → `{id, name}` is a rename and nothing more. `role` is
 * dropped: the client's `Actor` has no room for it, and the server disclosing
 * more than the client reads is the safe direction.
 */
export function mapActors(raw: unknown): Actor[] {
  const record = asRecord(raw, 'members');
  return asArray(record['members'], 'members.members').map((entry, index) => {
    const member = asRecord(entry, `members.members[${index}]`);
    return {
      id: asString(member['userId'], `members.members[${index}].userId`),
      name: asString(member['displayName'], `members.members[${index}].displayName`),
    };
  });
}

/** The roster as the board join consumes it: actor id → display name. */
export function rosterByActorId(actors: readonly Actor[]): Map<string, string> {
  return new Map(actors.map((actor) => [actor.id, actor.name]));
}

/**
 * `StateProvenance.cause` is `TransitionCause | null` — REQUIRED and nullable
 * (`packages/domain/src/read-models.ts`), and `TransitionCause` has exactly one
 * member.
 *
 * `null` therefore survives and is the TRUTH: the server is saying this
 * transition had no cause, which is what the card renders as an ordinary move.
 * The two substitutions that used to sit beside it do not survive. An ABSENT key
 * is not a null — the wire type declares the field, so a body without it is a
 * body this client cannot read. And a `kind` this client does not know used to
 * become `null`, which renders a caused reopen as an anonymous flip: the exact
 * thing `TransitionCause` was added to prevent, produced by the code meant to
 * carry it.
 */
function mapCause(raw: unknown, path: string): TransitionCause | null {
  if (raw === null) return null;
  const record = asRecord(raw, path);
  const kind = asString(record['kind'], `${path}.kind`);
  if (kind !== 'reopened-for-child') {
    throw new MappingError(`${path}.kind`, `reopened-for-child (got ${kind})`);
  }
  return {
    kind: 'reopened-for-child',
    childTicketId: asString(record['childTicketId'], `${path}.childTicketId`),
  };
}

/**
 * The assignee join, and the one place this module puts a value in a slot the
 * wire did not fill.
 *
 * The board sends `assigneeId` and no name; `Actor.name` is `string`, with no
 * absence value. Three moves were available and two are lies:
 *
 * - `assignee: null` says NOBODY IS ASSIGNED about a ticket somebody is assigned
 *   to. Rejected outright — it is a false statement about the work, not a
 *   degraded rendering of a true one.
 * - throwing takes the whole board away. It is reachable, not theoretical: the
 *   members route answers `no-guests`, and `readMembers` hides guests from a
 *   plain member's roster, so a guest assignee (or a guest CALLER, who gets a
 *   404 from the roster route entirely) would blank the board for everyone.
 *   `provenance.ts` already ruled on this shape — "a blank screen is a worse
 *   answer than an invented date".
 * - `name = the actor id`, which is what `actorLabel(id, null)` renders anyway,
 *   so an unnamed assignee looks exactly as it does everywhere else in this
 *   client: attributed, never blank, never a fabricated display name.
 *
 * The third is taken. It is a degradation, not an invention: the id is a fact
 * the server sent.
 */
function mapAssignee(raw: unknown, path: string, roster: ReadonlyMap<string, string>): Actor | null {
  // `TicketCard.assigneeId` is `string | null`, required. `null` is the wire's
  // own word for "nobody is assigned" and is the truth; an absent key is not,
  // and is left to `asString` to refuse.
  if (raw === null) return null;
  const id = asString(raw, path);
  // The one substitution in this function, argued in the docblock above: the id
  // is a fact the server sent, and `actorLabel(id, null)` renders it that way
  // everywhere else in this client.
  return { id, name: roster.get(id) ?? id };
}

function mapBoardCard(raw: unknown, path: string, roster: ReadonlyMap<string, string>): BoardCard {
  const record = asRecord(raw, path);
  const provenancePath = `${path}.stateProvenance`;
  const provenance = asRecord(record['stateProvenance'], provenancePath);
  return {
    ticketId: asString(record['ticketId'], `${path}.ticketId`),
    title: asString(record['title'], `${path}.title`),
    typeId: asString(record['typeId'], `${path}.typeId`),
    assignee: mapAssignee(record['assigneeId'], `${path}.assigneeId`, roster),
    stateProvenance: mapProvenance(provenance, provenancePath, roster),
    // The server nests the cause INSIDE `stateProvenance`; the client carries it
    // on the card. One level, not one meaning.
    cause: mapCause(provenance['cause'], `${provenancePath}.cause`),
    rollup: mapRollup(record['rollup'], `${path}.rollup`),
    // `pending` is client-side truth: set only between submit and the server's
    // answer, so anything off the wire is settled by definition.
    pending: false,
  };
}

function mapBoardColumn(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string>,
): BoardColumn {
  const record = asRecord(raw, path);
  return {
    stateId: asString(record['stateId'], `${path}.stateId`),
    name: asString(record['name'], `${path}.name`),
    category: asStateCategory(record['category'], `${path}.category`),
    // Both fields are REQUIRED on `BoardColumn` (`packages/domain/src/read-models.ts`:
    // `blocked: boolean; cards: TicketCard[]`), so neither had anything to
    // defend against that the contract permits — and both old defaults chose a
    // value that reads on screen as a claim about the work. `blocked === true`
    // rendered an unreadable flag as NOT BLOCKED, the harmful direction of a
    // flag whose whole job is to warn. `cards ?? []` rendered a body that lost
    // its cards as an empty column, which says "there is nothing in this
    // state". This module's promise is that a garbled read fails loudly here;
    // these two were the places it did not.
    blocked: asBoolean(record['blocked'], `${path}.blocked`),
    cards: asArray(record['cards'], `${path}.cards`).map((card, index) =>
      mapBoardCard(card, `${path}.cards[${index}]`, roster),
    ),
  };
}

/**
 * `BoardResponse` → `BoardView`: a pure REGROUPING of the server's flat
 * `columns[]`, plus the roster join above.
 *
 * ## The group key is `(workflowId, workflowVersion)`, not `workflowId`
 *
 * `views/board.tsx:28` renders each group under `` `${workflowId}@${workflowVersion}` ``,
 * so two columns sharing a group are asserting they came from the same published
 * definition. Grouping by `workflowId` alone would put a STRAGGLER column —
 * `workflowVersion: 0`, meaning "no published definition names this column"
 * (`routes/board.ts`'s `appendStragglerColumns`) — under the same heading as
 * that workflow's real states, drawn as one of them. That is the specific lie
 * `workflowVersion` was added to prevent, so the regrouping honours it.
 *
 * Order is first-appearance, which is the server's own order: it emits columns
 * workflow by workflow, states in definition order, with stragglers appended.
 * Regrouping REARRANGES and never filters — every column the server sent lands
 * in exactly one group, which is the same promise `Board` makes about cards.
 */
export function mapBoardView(raw: unknown, roster: ReadonlyMap<string, string> = new Map()): BoardView {
  const record = asRecord(raw, 'board');
  const groups: BoardGroup[] = [];
  const byKey = new Map<string, BoardGroup>();
  asArray(record['columns'], 'board.columns').forEach((entry, index) => {
    const path = `board.columns[${index}]`;
    const column = asRecord(entry, path);
    const workflowId = asString(column['workflowId'], `${path}.workflowId`);
    const workflowVersion = asNumber(column['workflowVersion'], `${path}.workflowVersion`);
    const workflowName = asString(column['workflowName'], `${path}.workflowName`);
    const key = `${workflowId}@${workflowVersion}`;
    let group = byKey.get(key);
    if (group === undefined) {
      group = { workflowId, workflowVersion, workflowName, columns: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.columns.push(mapBoardColumn(column, path, roster));
  });
  return { projectId: asString(record['projectId'], 'board.projectId'), groups };
}

/** The workspace the board body names — what the roster join is fetched for. */
export function boardWorkspaceId(raw: unknown): string {
  return asString(asRecord(raw, 'board')['workspaceId'], 'board.workspaceId');
}

/**
 * `GET /v1/tickets/:id/history` → `TicketHistoryEvent[]`. The two shapes agree
 * field for field; this validates rather than casts, because a cast would let a
 * garbled event render as history.
 */
export function mapHistory(raw: unknown): TicketHistoryEvent[] {
  const record = asRecord(raw, 'history');
  return asArray(record['events'], 'history.events').map((entry, index) => {
    const path = `history.events[${index}]`;
    const event = asRecord(entry, path);
    return {
      id: asString(event['id'], `${path}.id`),
      type: asString(event['type'], `${path}.type`),
      version: asNumber(event['version'], `${path}.version`),
      payload: event['payload'],
      actorId: asString(event['actorId'], `${path}.actorId`),
      origin: asString(event['origin'], `${path}.origin`),
      clientTime: asString(event['clientTime'], `${path}.clientTime`),
      serverTime: asString(event['serverTime'], `${path}.serverTime`),
      seq: asNumber(event['seq'], `${path}.seq`),
    };
  });
}

/**
 * `GET /v1/workspaces/:ws/workflows/:id` → `WorkflowDef`.
 *
 * The wire type is `PublishedWorkflowDef`, which is `WorkflowDef` plus an
 * optional `stateMapping` — a superset, so the definition travels whole. The
 * required fields are CHECKED rather than cast: `as WorkflowDef` would make the
 * day the two diverge a silent one, and the builder republishes what it loads,
 * so a field this client quietly mangled is a field the next publish deletes.
 *
 * ## Down to the ELEMENTS, because that is where the stake actually is
 *
 * This once checked `states` and `transitions` for ARRAY-NESS and no further,
 * then cast — so `states: [null]` and `transitions: [{from: 7}]` both passed a
 * docblock claiming the required fields were checked. Element-level mangling is
 * exactly what the republish sentence above is about: an array of garbage is
 * still an array. Each element is now read against `workflowStateSchema` and
 * `transitionSchema`'s required members (`packages/domain/src/workflow.ts`) —
 * `blocked` is `.optional()` there and is therefore optional here, checked only
 * when present.
 *
 * **What is NOT validated, said plainly rather than left to the word "checked":**
 * the ARM of each entry in `transitions[].rules`. `rules` is checked for
 * array-ness and each element for object-ness, and `kind` is not read. `Rule` is
 * a five-arm discriminated union and it is the rule engine's own vocabulary;
 * restating it here would be a second definition of it inside a module whose job
 * is adaptation, and the two would drift — which is the failure this series keeps
 * finding.
 *
 * The cost is NOT that the engine re-validates. It does not: `evaluateOneRule`
 * (`packages/rule-engine/src/rules/index.ts`) is a `default`-less `switch` over
 * `rule.kind`, deliberately, so its exhaustiveness is a COMPILE-time check over
 * the declared union rather than a runtime one over an unknown value. A rule
 * arriving with a `kind` outside that union therefore falls through the switch,
 * `evaluateOneRule` answers `undefined`, and the caller's `result.refused`
 * throws a `TypeError`. Loud, but named after the wrong thing. That is the
 * trade, and it is recorded here rather than described as safety.
 *
 * Nothing is dropped either way: the whole definition object is returned as it
 * arrived, so what this client passes on is byte-for-byte what it was given.
 */
export function mapWorkflowDef(raw: unknown): WorkflowDef {
  const record = asRecord(raw, 'workflow');
  const definition = asRecord(record['workflow'], 'workflow.workflow');
  asString(definition['id'], 'workflow.workflow.id');
  asNumber(definition['version'], 'workflow.workflow.version');
  asString(definition['name'], 'workflow.workflow.name');
  asString(definition['initialStateId'], 'workflow.workflow.initialStateId');
  asArray(definition['states'], 'workflow.workflow.states').forEach((entry, index) => {
    const path = `workflow.workflow.states[${index}]`;
    const state = asRecord(entry, path);
    asString(state['id'], `${path}.id`);
    asString(state['name'], `${path}.name`);
    asStateCategory(state['category'], `${path}.category`);
    // `blocked` is `z.boolean().optional()` on `workflowStateSchema`, so an
    // absent one is the definition saying nothing rather than a lost field.
    if (state['blocked'] !== undefined) asBoolean(state['blocked'], `${path}.blocked`);
  });
  asArray(definition['transitions'], 'workflow.workflow.transitions').forEach((entry, index) => {
    const path = `workflow.workflow.transitions[${index}]`;
    const transition = asRecord(entry, path);
    asString(transition['from'], `${path}.from`);
    asString(transition['to'], `${path}.to`);
    asArray(transition['rules'], `${path}.rules`).forEach((rule, ruleIndex) => {
      asRecord(rule, `${path}.rules[${ruleIndex}]`);
    });
  });
  return definition as unknown as WorkflowDef;
}

const INGEST_ARMS: Record<string, readonly string[]> = {
  committed: ['eventId', 'seq', 'serverTime'],
  invalid: ['code', 'message'],
  refused: ['eventId', 'rule', 'reason'],
};

/**
 * `POST /v1/events` → index-aligned `IngestResult[]`.
 *
 * The length check is the contract: the server answers one result per submitted
 * event, in order, and a client that matched them up by position without
 * checking would attribute one claim's refusal to another claim. The ARM is
 * checked too — a `refused` result read as `committed` because nobody looked at
 * `status` is a client believing a claim landed that did not.
 */
export function mapIngestResults(raw: unknown, submittedCount: number): IngestResult[] {
  const record = asRecord(raw, 'ingest');
  const results = asArray(record['results'], 'ingest.results');
  if (results.length !== submittedCount) {
    throw new MappingError(
      'ingest.results',
      `${submittedCount} index-aligned results (got ${results.length})`,
    );
  }
  return results.map((entry, index) => {
    const path = `ingest.results[${index}]`;
    const result = asRecord(entry, path);
    const status = asString(result['status'], `${path}.status`);
    const required = INGEST_ARMS[status];
    if (required === undefined) {
      throw new MappingError(`${path}.status`, 'one of committed/invalid/refused');
    }
    for (const field of required) {
      if (result[field] === undefined) throw new MappingError(`${path}.${field}`, 'a value');
    }
    return result as unknown as IngestResult;
  });
}

/* ------------------------------------------------------------------ *
 * Preferences: the client document and the server document, both ways.
 * ------------------------------------------------------------------ */

const FILTER_BLOCKED_ABSENCE: Absence = {
  field: 'FilterSpec.blocked',
  wireKey: 'blocked',
  // No route closes this one: the server ALREADY sends the term and the client
  // type has nowhere to put it.
  wireRoute: null,
  because:
    "the server's filterSpecSchema carries a `blocked` term and the client's FilterSpec has no key for it, so a saved filter using it cannot be shown, edited or written back without silently dropping the criterion",
  owner: 'Plan 6 — the client FilterSpec type (view-types.ts), not a route',
};

/**
 * Server `FilterSpec` → client `FilterSpec`. Singular ids become one-element
 * arrays; `due: {before, after}` becomes `dueBefore`/`dueAfter`.
 *
 * Two server terms have no client key and are REFUSED rather than dropped:
 * `blocked`, and any field clause whose `op` is not `eq` (the client's `fields`
 * is `Record<fieldId, value>`, which can only mean equality and can only hold
 * one clause per field). A dropped criterion would come back on the next PUT as
 * a filter the user never edited but this client silently widened.
 */
export function toClientFilterSpec(raw: unknown, path: string): FilterSpec {
  const record = asRecord(raw, path);
  if (record['blocked'] !== undefined) {
    throw new ServingGapError(path, [FILTER_BLOCKED_ABSENCE]);
  }
  const spec: FilterSpec = {};
  if (record['text'] !== undefined) spec.text = asString(record['text'], `${path}.text`);
  if (record['assigneeId'] !== undefined)
    spec.assigneeIds = [asString(record['assigneeId'], `${path}.assigneeId`)];
  if (record['collaboratorId'] !== undefined)
    spec.collaboratorIds = [asString(record['collaboratorId'], `${path}.collaboratorId`)];
  if (record['typeId'] !== undefined) spec.typeIds = [asString(record['typeId'], `${path}.typeId`)];
  if (record['stateId'] !== undefined)
    spec.stateIds = [asString(record['stateId'], `${path}.stateId`)];
  if (record['stateCategory'] !== undefined)
    spec.stateCategories = [asStateCategory(record['stateCategory'], `${path}.stateCategory`)];
  if (record['due'] !== undefined) {
    const due = asRecord(record['due'], `${path}.due`);
    if (due['before'] !== undefined) spec.dueBefore = asString(due['before'], `${path}.due.before`);
    if (due['after'] !== undefined) spec.dueAfter = asString(due['after'], `${path}.due.after`);
  }
  if (record['fields'] !== undefined) {
    const fields: Record<string, string> = {};
    asArray(record['fields'], `${path}.fields`).forEach((entry, index) => {
      const clausePath = `${path}.fields[${index}]`;
      const clause = asRecord(entry, clausePath);
      const fieldId = asString(clause['fieldId'], `${clausePath}.fieldId`);
      const op = asString(clause['op'], `${clausePath}.op`);
      if (op !== 'eq') {
        throw new ServingGapError(clausePath, [
          {
            field: 'FilterSpec.fields',
            wireKey: null,
            wireRoute: null,
            because: `the client's fields is Record<fieldId, value> — equality only — and this clause asks for op '${op}'`,
            owner: 'Plan 6 — the client FilterSpec type (view-types.ts), not a route',
          },
        ]);
      }
      if (fieldId in fields) {
        throw new MappingError(clausePath, `a field id not already used (${fieldId} appears twice, and Record<fieldId, value> can hold one)`);
      }
      fields[fieldId] = asString(clause['value'], `${clausePath}.value`);
    });
    spec.fields = fields;
  }
  return spec;
}

/**
 * Client `FilterSpec` → server `FilterSpec`. The reverse of the above, and the
 * direction where the plural/singular disagreement bites: the client's arrays
 * are `assigneeIds`, `typeIds`, `stateIds`, `stateCategories`,
 * `collaboratorIds`, and the server has ONE slot for each.
 *
 * A two-assignee filter is therefore not something this client may narrow to its
 * first element and send — that would answer a different question and label it
 * with the user's. It throws, naming the key and the count.
 *
 * `projectIds` throws at ANY length: `filterSpecSchema` has no project term at
 * all, and the list read is project-scoped by its path, so there is nothing to
 * narrow to.
 */
export function toServerFilterSpec(filter: FilterSpec): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  const singular = (key: string, values: string[] | undefined, serverKey: string): void => {
    if (values === undefined || values.length === 0) return;
    if (values.length > 1) {
      throw new UnexpressibleFilterError(
        key,
        `filterSpecSchema has one ${serverKey} and this filter names ${values.length} (${values.join(', ')})`,
      );
    }
    spec[serverKey] = values[0];
  };
  if (filter.text !== undefined) spec['text'] = filter.text;
  singular('assigneeIds', filter.assigneeIds, 'assigneeId');
  singular('collaboratorIds', filter.collaboratorIds, 'collaboratorId');
  singular('typeIds', filter.typeIds, 'typeId');
  singular('stateIds', filter.stateIds, 'stateId');
  singular('stateCategories', filter.stateCategories, 'stateCategory');
  if (filter.projectIds !== undefined && filter.projectIds.length > 0) {
    throw new UnexpressibleFilterError(
      'projectIds',
      'filterSpecSchema has no project term, and the list read is scoped by the project in its own path',
    );
  }
  if (filter.dueBefore !== undefined || filter.dueAfter !== undefined) {
    const due: Record<string, string> = {};
    if (filter.dueBefore !== undefined) due['before'] = filter.dueBefore;
    if (filter.dueAfter !== undefined) due['after'] = filter.dueAfter;
    spec['due'] = due;
  }
  // `{}` for an absent `fields` is the TRUTH and not a substitute: `FilterSpec.fields`
  // is `?:` on the CLIENT type (`view-types.ts`), so this is a caller who named no
  // field clauses, not a wire body that lost some. Same for the `undefined` arms of
  // `singular` and the `dueBefore`/`dueAfter` pair below — every one of them reads a
  // client-supplied filter, never a server response.
  const fields = Object.entries(filter.fields ?? {});
  if (fields.length > 10) {
    throw new UnexpressibleFilterError(
      'fields',
      `filterSpecSchema admits at most 10 field clauses and this filter names ${fields.length}`,
    );
  }
  if (fields.length > 0) {
    spec['fields'] = fields.map(([fieldId, value]) => ({ fieldId, op: 'eq', value }));
  }
  return spec;
}

/**
 * `GET /v1/me/preferences?workspaceId=` → `UserPreferences`.
 *
 * Ruling P24 settled that the SHIPPED `.strict()` document wins over Plan 6's,
 * so this translates rather than asking the server to change: the server's
 * `listColumns` and `grouping` are two records keyed by project id, and the
 * client's `projects` is one record of pairs.
 *
 * ## The half that is absent is reported NOT SET, and this is where that changed
 *
 * This function used to fill a missing half with `DEFAULT_VIEW_PREFS.columns` /
 * `.grouping`, and its docblock defended that as saying the same thing the
 * server's absent key says. **It does not, and ruling P24 forbids it in as many
 * words:** *"a project present in `listColumns` and absent from `grouping` has no
 * faithful client representation, and reaching for `DEFAULT_VIEW_PREFS` there
 * invents a preference the user never set … a project missing from `grouping`
 * surfaces as **not set**, never as a default wearing a user's authority."*
 *
 * The server's absence and the client's default are the same PIXELS and not the
 * same fact: one is "nobody arranged this", the other is "this arrangement is
 * yours". `ProjectViewPrefs` now admits the difference — each half is a `Chosen`
 * whose `default` arm carries no value — so the half that is absent arrives here
 * as `{ origin: 'default' }` and every consumer must narrow before it can render
 * anything. Nothing in this file picks a stock value any more.
 *
 * ## There is no 404 branch here, and its removal is the point
 *
 * This mapper once answered `EMPTY_PREFERENCES` for the transport's `null`,
 * "matching the server's own answer for a user who has never saved". The two are
 * indistinguishable BY CONSTRUCTION and that is precisely why the substitution
 * was wrong: the server's never-saved answer is a **200 carrying
 * `EMPTY_PREFERENCES`** (`apps/server/src/preferences/store.ts` — a missing row
 * answers the empty document), so a 404 can only mean the OTHER thing —
 * `requireMember` said no. Rendering defaults there tells a revoked member that
 * their saved filters are gone and their columns are the stock ones, in the same
 * pixels as a genuine empty document.
 *
 * The 404 is raised as `HttpError` by `getPreferences` in
 * `online-data-source.ts`, one layer out, for the reason `getBoard` already
 * states there: `Promise<UserPreferences>` has no absence value, so the status
 * has to become an exception again, and it is re-raised AS the status so a
 * caller can tell "not yours" from a mapping failure. This function therefore
 * only ever sees a body, and a `null` reaching it is a caller bug that fails
 * loudly at `asRecord`.
 *
 * All three top-level keys are REQUIRED by `preferencesDocSchema`
 * (`packages/domain/src/preferences.ts`) — the document is `.strict()` and
 * declares no optional members — so none of them is defaulted here. A body
 * missing `savedFilters` is not a person who saved none; it is a body this
 * client cannot read.
 */
export function mapPreferences(raw: unknown): UserPreferences {
  const record = asRecord(raw, 'preferences');
  const listColumns = asRecord(record['listColumns'], 'preferences.listColumns');
  const grouping = asRecord(record['grouping'], 'preferences.grouping');
  const projects: Record<string, ProjectViewPrefs> = {};
  for (const projectId of new Set([...Object.keys(listColumns), ...Object.keys(grouping)])) {
    const columns = listColumns[projectId];
    const group = grouping[projectId];
    projects[projectId] = {
      columns:
        columns === undefined
          ? { origin: 'default' }
          : { origin: 'stored', value: asListColumnIds(columns, `preferences.listColumns.${projectId}`) },
      grouping:
        group === undefined
          ? { origin: 'default' }
          : { origin: 'stored', value: asGrouping(group, `preferences.grouping.${projectId}`) },
    };
  }
  const savedFilters: SavedFilter[] = asArray(
    record['savedFilters'],
    'preferences.savedFilters',
  ).map((entry, index) => {
    const path = `preferences.savedFilters[${index}]`;
    const saved = asRecord(entry, path);
    return {
      id: asString(saved['id'], `${path}.id`),
      name: asString(saved['name'], `${path}.name`),
      filter: toClientFilterSpec(saved['filterSpec'], `${path}.filterSpec`),
    };
  });
  return { version: 1, projects, savedFilters };
}

/**
 * `UserPreferences` → the server's `.strict()` document. P24, the other way.
 *
 * ## A half nobody chose is NOT WRITTEN, which is what makes the round trip total
 *
 * The two records are keyed independently, so the server can hold a project in
 * `listColumns` and not in `grouping` — that is the asymmetry P24 names, and it
 * is also the only shape in which this client can store "one half chosen". A
 * version of this function that wrote both halves unconditionally would take a
 * `{ origin: 'default' }` half, spend a stock value on it, and PUT that value
 * under the user's name: the same substitution `mapPreferences` just stopped
 * making, one layer over and permanent, because storage is where a default stops
 * being recoverable as a default.
 *
 * So a `default` half contributes no key, and the fixed point is faithful: a
 * user who chose a grouping and never chose columns round-trips as a grouping
 * key with no matching `listColumns` key, and reads back as
 * `{ columns: { origin: 'default' }, grouping: { origin: 'stored', … } }`. A
 * project whose halves are both `default` disappears from the document, which is
 * the truth about a project nobody has arranged.
 */
export function toServerPreferences(preferences: UserPreferences): Record<string, unknown> {
  const listColumns: Record<string, unknown> = {};
  const groupings: Record<string, unknown> = {};
  for (const [projectId, prefs] of Object.entries(preferences.projects)) {
    if (prefs.columns.origin === 'stored') listColumns[projectId] = prefs.columns.value;
    if (prefs.grouping.origin === 'stored') groupings[projectId] = prefs.grouping.value;
  }
  return {
    savedFilters: preferences.savedFilters.map((saved) => ({
      id: saved.id,
      name: saved.name,
      filterSpec: toServerFilterSpec(saved.filter),
    })),
    listColumns,
    grouping: groupings,
  };
}

/* ------------------------------------------------------------------ *
 * The refusals. Each list is read by the server's contract suite.
 * ------------------------------------------------------------------ */

const MAP_WORKSPACE_REFS_ABSENCES: readonly Absence[] = [
  {
    field: 'WorkspaceRef.projects',
    wireKey: 'projects',
    wireRoute: '/v1/me/workspaces',
    because:
      'no /v1 route reads proj_projects — there is no project-list read anywhere on the surface, so this is not a field a route forgot but a read nobody has designed, and its first question is what a project-scoped guest sees of a workspace it is not otherwise in',
    owner: 'P25 clause 1 — HELD pending the owner ruling, because it carries a visibility decision',
  },
];

/**
 * `GET /v1/me/workspaces` → `WorkspaceRef[]`. REFUSED.
 *
 * The `workspaceId` → `id` rename is adaptable and `role` is a field the server
 * discloses that the client does not read; neither is a gap. `projects` is, and
 * with it the whole method: a nav rendering workspaces with no projects under
 * them, or with an invented empty list, is a nav that says this workspace holds
 * no projects.
 */
export function mapWorkspaceRefs(_raw: unknown): never {
  throw new ServingGapError('getMyWorkspaces', MAP_WORKSPACE_REFS_ABSENCES);
}

const MAP_LIST_VIEW_ABSENCES: readonly Absence[] = [
  {
    field: 'ListRow.typeRank',
    wireKey: 'typeRank',
    wireRoute: '/v1/projects/:projectId/tickets',
    because: 'proj_ticket_types.rank is never joined into the TicketCard the list route serves',
    owner: 'P25 clause 1 — HELD',
  },
  {
    field: 'ListRow.epicId',
    wireKey: 'epicId',
    wireRoute: '/v1/projects/:projectId/tickets',
    because:
      'routes/list.ts computes epicAncestors and uses the epic only as a group key, then discards it',
    owner: 'P25 clause 1 — HELD',
  },
  {
    field: 'ListRow.stateName',
    wireKey: 'stateName',
    wireRoute: '/v1/projects/:projectId/tickets',
    because:
      'cards carry stateId only; the route already fetches the workflow defs that name the state and drops the names. Reading the name from the latest definition instead would be the workflowVersion lie in miniature — the card names no version',
    owner: 'P25 clause 1 — HELD',
  },
  {
    field: 'ListRow.hasRestrictedParent',
    wireKey: 'hasRestrictedParent',
    wireRoute: '/v1/projects/:projectId/tickets',
    because: 'it is a statement about what this viewer may not see, so serving it is a visibility decision under Plan 4 read enforcement',
    owner: 'P25 clause 1 — HELD',
  },
  {
    field: 'ListRow.assignedProvenance',
    wireKey: 'assignedProvenance',
    wireRoute: '/v1/projects/:projectId/tickets',
    because:
      'proj_tickets.assignee_id is a bare column; the provenance is reconstructible only from the raw events table, the shape read/state-provenance.ts already ships for state',
    owner: 'P25 clause 1 — HELD',
  },
];

/**
 * `GET /v1/projects/:projectId/tickets` → `TicketListView`. REFUSED.
 *
 * Four of the five cannot be derived client-side at all, and the fifth
 * (`stateName`) only by reading a definition the card does not name. The
 * response's own shape — `groups` of `{key, label, cards}` with a `nextCursor` —
 * is adaptable and is not why this refuses.
 */
export function mapListView(_raw: unknown): never {
  throw new ServingGapError('getTickets', MAP_LIST_VIEW_ABSENCES);
}

const MAP_TICKET_READ_ABSENCES: readonly Absence[] = [
  {
    field: 'TicketRead.title',
    wireKey: 'title',
    wireRoute: '/v1/workspaces/:workspaceId/tickets/:ticketId',
    because:
      'the route answers a proj_visibility row wrapped in {ticket, parent, rollup}; the title is on the board card, so this is the route’s shape and not a missing fact',
    owner: 'P25 clause 1 — HELD, because reading proj_tickets here is a visibility decision',
  },
  {
    field: 'TicketRead.stateProvenance',
    wireKey: 'stateProvenance',
    wireRoute: '/v1/workspaces/:workspaceId/tickets/:ticketId',
    because: 'the wrapper carries no provenance block at all',
    owner: 'P25 clause 1 — HELD',
  },
  {
    field: 'TicketRead.ticket (a domain TicketState)',
    wireKey: 'transitions',
    wireRoute: '/v1/workspaces/:workspaceId/tickets/:ticketId',
    because:
      'the inner ticket is a snake_case proj_visibility row — own_mode, resolved_mode, seq — with none of a TicketState’s fields or transitions',
    owner: 'P25 clause 1 — HELD',
  },
];

/** `GET /v1/workspaces/:ws/tickets/:ticketId` → `TicketRead`. REFUSED. */
export function mapTicketRead(_raw: unknown): never {
  throw new ServingGapError('getTicket', MAP_TICKET_READ_ABSENCES);
}

const MAP_SEARCH_HITS_ABSENCES: readonly Absence[] = [
  {
    field: 'SearchHit.matchedIn',
    wireKey: 'matchedIn',
    wireRoute: '/v1/search',
    because:
      'proj_search stores title, description and comments as three independently weighted columns and routes/search.ts concatenates them before one ts_headline, so which one matched is destroyed in the query rather than absent from the store',
    owner:
      'recorded for whoever builds the search surface — it is NOT in P25 clause 1, because no Plan 6 view consumes it',
  },
];

/**
 * `GET /v1/search` → `SearchHit[]`. REFUSED.
 *
 * `ticketId`, `projectId` and `title` are all on `hit.card` and are adaptable;
 * the wrapper is adaptable. `matchedIn` is the whole of it — and a hit that
 * claimed `matchedIn: 'title'` because that is the commonest case would be this
 * client inventing the answer to the one question the field asks.
 */
export function mapSearchHits(_raw: unknown): never {
  throw new ServingGapError('search', MAP_SEARCH_HITS_ABSENCES);
}

const MAP_MY_WORK_ABSENCES: readonly Absence[] = [
  {
    field: 'WorkItem.projectName',
    wireKey: 'projectName',
    wireRoute: '/v1/me/work',
    because: 'cards carry projectId, and no /v1 route reads proj_projects to name it',
    owner: 'P25 clause 1 — HELD (the same missing project read as WorkspaceRef.projects)',
  },
  {
    field: 'WorkItem.stateName',
    wireKey: 'stateName',
    wireRoute: '/v1/me/work',
    because:
      'cards carry stateId only, and the card names no workflow version to read the name from',
    owner: 'P25 clause 1 — HELD',
  },
  {
    field: 'ContestedClaim.title',
    wireKey: 'title',
    wireRoute: '/v1/contests',
    because:
      'GET /v1/contests IS shipped and gated per row by canSee (sync/contests-route.ts, registered in app.ts), so the contested rows are one client-side join away — the move getBoard already makes for the roster. What the join cannot produce is the TITLE: ContestView carries ticketId, claimantId, rule, reason and the embedded claim and no title, and no /v1 route answers a ticket’s CURRENT title given only a ticket id. The workspace ticket read answers a proj_visibility row, which has none; every route that does carry a title serves TicketCards selected some other way (a project’s board or list, a search query, this viewer’s own assigned work, or the three computed attention kinds), and none of those is guaranteed to contain an arbitrary contested ticket. The history route carries the ledger, so a title could only be REPLAYED from create and rename events — this client reimplementing a server projection, which is a different thing from the two-route join getBoard makes',
    owner:
      'whoever extends GET /v1/contests — proj_contested already stores ticket_id, so joining the ticket the row names closes this and the attention strip’s copy of it at once',
  },
  {
    field: 'ContestedClaim.claim.serverTime',
    wireKey: 'serverTime',
    wireRoute: '/v1/contests',
    because:
      'ClaimProvenance requires serverTime and the contested claim has none anywhere in this system: originalEvent is a SubmittedEvent, which IS EventEnvelope minus serverTime and seq (envelope.ts), because the claim was refused at the door and never committed. contestedAt is the CONTEST event’s serverTime — when the server filed the refusal, not when it received the claim — so spending it here would attribute one event’s instant to another',
    owner:
      'Plan 6 — the client ClaimProvenance type (view-types.ts), not a route: no route can serve an instant the system never recorded',
  },
];

/**
 * `GET /v1/me/work?workspaceId=` → `MyWorkView`. REFUSED.
 *
 * ## `inTransit` is NOT one of the absences, and the difference is the point
 *
 * `inTransit` is the replica's outbox. The web client is online-only (spec §5,
 * line 104 — Plan 6 carries the constraint at its own line 23, and cites it as
 * "spec §5" there too), so it HAS no outbox and `inTransit: []` would be the true answer, not a
 * degradation — a structural emptiness. `contested` is the opposite: the rows
 * exist in `proj_contested`, so `[]` there would be a claim about the world
 * rather than a fact about this client. That distinction is why the two are
 * treated differently and it is written here rather than left for a reader to
 * infer from an absence list.
 *
 * ## `contested` no longer blames `/v1/me/work`, because the read SHIPPED
 *
 * This absence used to read "/v1/me/work never reads it" and name Plan 10 and
 * `routes/my-work.ts`. Both sentences were true and both sent a fixer to the
 * wrong file: `GET /v1/contests` is registered in `app.ts` today, takes
 * `?workspaceId=&ticketId=&claimantId=&open=true`, filters every row through
 * `canSee`, and its own docblock says "The ticket banner, My Work and the
 * attention strip all read this". So a client-side join IS available — the same
 * move `getBoard` makes for the roster — and the question is only whether the
 * join can fill a `ContestedClaim`.
 *
 * It cannot, and the two entries below are the field-by-field reason. `ticketId`,
 * `rule` and `reason` come straight off the row. `title` is required and is on no
 * contest row and derivable from no other route for a bare ticket id. `claim` is
 * `ClaimProvenance`, non-nullable, and its `serverTime` does not exist: the
 * claim was refused, so it was never committed and never stamped. Fill either
 * one and the banner shows a contest labelled with a title this client made up,
 * or timed by an instant belonging to a different event.
 *
 * The grouping model also differs — the server groups by state category
 * `{open, active, terminal}` and the client by claim status — but that is
 * adaptable (all three groups are this viewer's assigned work) and is not why
 * this refuses.
 */
export function mapMyWork(_raw: unknown): never {
  throw new ServingGapError('getMyWork', MAP_MY_WORK_ABSENCES);
}

const MAP_ATTENTION_ABSENCES: readonly Absence[] = [
  {
    field: "AttentionItem kind 'contested' — its title",
    wireKey: 'title',
    wireRoute: '/v1/contests',
    because:
      'the fourth kind is a client-side join away and not a serving gap in routes/attention.ts: GET /v1/contests is shipped, per-row canSee-gated, and queryable by workspace. The join stops at AttentionItem.title, which is REQUIRED and is on no contest row. It is the title, and the other two candidates are named so a fixer does not re-derive them: AttentionItem.claim is `ClaimProvenance | null`, so the contested claim’s missing serverTime costs the item its provenance rather than making the item unformable, which is not what it does to the non-nullable ContestedClaim.claim; and AttentionItem.projectId is servable — GET /v1/workspaces/:workspaceId/tickets carries project_id — though that read resolves its set through listVisibleTickets while /v1/contests filters through canSee, and the two are not asserted anywhere to answer the same set, so it is a second join with a caveat rather than a free one. Neither is why this refuses. The title is on no route at all',
    owner:
      'whoever extends GET /v1/contests — the same missing title as ContestedClaim.title; one join to the ticket proj_contested already names closes both',
  },
];

/**
 * `GET /v1/workspaces/:ws/attention` → `AttentionItem[]`. REFUSED.
 *
 * Every one of the three shipped kinds maps cleanly (`card.ticketId`,
 * `card.projectId`, `card.title`, the route's own `reason`, and
 * `card.stateProvenance` or the due claim for `claim`). The refusal is about the
 * FOURTH: `AttentionKind` includes `'contested'`, the strip's whole contract is
 * "what needs attention now", and a strip that silently cannot contain a
 * contested claim is worse than no strip, because the user reads its emptiness
 * as an answer.
 *
 * ## The reason NAMED THE WRONG FILE, and the correction narrows the gap
 *
 * This used to refuse because "routes/attention.ts … never reads proj_contested".
 * True, and beside the point: `GET /v1/contests` is shipped
 * (`apps/server/src/sync/contests-route.ts`, registered at `apps/server/src/app.ts`),
 * gated per row by `canSee`, and takes a `workspaceId` — so this client may join
 * it exactly as `getBoard` joins the member roster, and the attention ROUTE owes
 * nothing. `wireKey` therefore no longer says "not a key at all"; it names the
 * key `/v1/contests` would have to grow, so the server-side cross-check watches
 * the route that would actually close this instead of a route that never will.
 *
 * What remains is one field. `AttentionItem.title` is required and no contest row
 * carries a title; `projectId` is joinable and `claim` is nullable, so neither of
 * those is a reason to refuse. The join is one server-side `JOIN` away from being
 * possible, which is why the owner is the contests route rather than "Plan 10".
 */
export function mapAttention(_raw: unknown): never {
  throw new ServingGapError('getAttention', MAP_ATTENTION_ABSENCES);
}

/** Every refusal in this module, so a caller can enumerate the register. */
export const SERVING_GAPS: Readonly<Record<string, readonly Absence[]>> = {
  getMyWorkspaces: MAP_WORKSPACE_REFS_ABSENCES,
  getTickets: MAP_LIST_VIEW_ABSENCES,
  getTicket: MAP_TICKET_READ_ABSENCES,
  search: MAP_SEARCH_HITS_ABSENCES,
  getMyWork: MAP_MY_WORK_ABSENCES,
  getAttention: MAP_ATTENTION_ABSENCES,
};
