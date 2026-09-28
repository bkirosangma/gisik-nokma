import { isRankKey, NOTE_SCOPE_MODES, PRIORITIES, VISIBILITY_MODES } from '@gisik-nokma/domain';
import type {
  DeletedItem,
  FieldClaim,
  IngestResult,
  NoteComment,
  NoteDetail,
  NoteScope,
  NoteScopeMode,
  NoteSummary,
  NoteVersion,
  Priority,
  StateCategory,
  TicketState,
  TicketTypeDef,
  VisibilityMode,
  WorkflowDef,
} from '@gisik-nokma/domain';
import type {
  Actor,
  AttentionItem,
  BoardCard,
  BoardColumn,
  BoardGroup,
  BoardView,
  ClaimProvenance,
  ContestedClaim,
  FilterSpec,
  Grouping,
  IdAxes,
  ListColumnId,
  ListRow,
  MyWorkView,
  // The VIEW model, from `../view-types.js` and not from the domain: it is the
  // one with `source` on it, and `mapNoteSearchHits` is where `source` is made.
  NoteSearchHit,
  ParentRef,
  PriorityView,
  ProjectViewPrefs,
  ResolvedVisibilityMode,
  RollupToViewer,
  RosterMember,
  SavedFilter,
  SearchHit,
  TicketHistoryEvent,
  TicketListView,
  TicketRead,
  TicketVisibility,
  TransitionCause,
  UserPreferences,
  WorkItem,
  WorkspaceRef,
  WorkspaceSettings,
} from '../view-types.js';
// What a roster JOIN's value is built with. A REAL runtime import, unlike the
// two type-only ones below: this module is what resolves an actor id to
// something printable, and the rule for that is `memberLabel`'s.
import { memberLabel } from '../member-label.js';
// The list entry union lives with the component that renders it; see the note
// on the same import in `../data-source.ts`. Type-only, so no runtime edge.
import type { AttachmentListEntry } from '../views/attachment-list.js';
// The comment view type lives with its component for the same reason, and the
// same type-only import keeps the dependency erased at runtime.
import type { TicketComment } from '../views/comments-thread.js';

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
 * ## Why several mappers below USED to be nothing but a refusal
 *
 * **⚠ CORRECTED 2026-09-20 — this section is the register's own, and it was the one
 * place the falsified count was never swept.** The heading read *"Why several
 * mappers below are nothing but a refusal"*, and the paragraph read *"Four of the
 * thirteen `DataSourceQuery` methods cannot be answered over the routes that
 * shipped — six until ruling P25 clause 1's buildable subset landed and
 * `mapListView` and `mapTicketRead` became real mappers."* **The number is ZERO.**
 * It fell 6 → 4 (ruling P25 clause 1, `c86c4b5c`, 2026-09-06) → 3 (P32/P38) → 1
 * (P39/P40) → 0 on 2026-09-19, when the owner ruled the search QUERY must derive
 * `matchedIn`; **no mapper in this file refuses outright, and 3.39 asserts
 * it.** The register — coordination doc, "Step 11 (Plan 6 remainder) —
 * the `DataSource` register, re-derived, and RULING REQUEST P25" — holds the
 * measurement. A mapper that
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
 * method calls.
 *
 * **The example this paragraph used to give was WRONG, and it is corrected in
 * place rather than swapped out** (ruling P40), because a false sentence a
 * maintainer reasons from is worse than a missing one. It said `/v1/me/work`
 * "does not serve contests and never will, because `GET /v1/contests` already
 * does". It does serve them now, and the reason it had to is the one that
 * sentence could not see: `MyWorkView.contested` is the viewer's OWN claims,
 * "the viewer" is a fact only the server holds, and `/v1/contests`' `claimantId`
 * is caller-supplied. `routes/my-work.ts` had reserved the additive key for
 * exactly this all along, and `proj_contested`'s `(workspace_id, claimant_id)`
 * index names this access path in its own migration comment.
 *
 * The FIELD the paragraph exists for is still real and is better illustrated by
 * the attention strip, which keeps its cross-route shape: its `'contested'`
 * items are joined from `/v1/contests`, so an absence on that surface is
 * measured against the contests body and not against the attention route's.
 *
 * `null` on either field means NO route can close it, because the client TYPE
 * is the owner. `FilterSpec` has no key for the server's `blocked` term, and
 * that is still the shape. The other example this sentence used to give —
 * `ClaimProvenance` requiring an instant the system never recorded — was
 * retired by ruling P39, which did not find the instant but removed the field:
 * a contested claim carries a `ContestedClaimProvenance` now, with no
 * `serverTime` member at all. It is worth keeping as the WORKED example of the
 * `null` case even so, since a type-owned absence is closed by changing the
 * type and not by finding the data.
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

/**
 * ONE PAGE of the list route, which is what the wire actually carries.
 *
 * Deliberately NOT `TicketListView` and deliberately not exported as a view:
 * `TicketListView` means *the complete row set for this project*, and
 * `views/list-model.ts` groups it on exactly that promise. This type is the
 * thing that is true before the loop finishes — rows, plus whether there are
 * more — and it exists so that "a page" and "the project" have different names
 * in the one place where confusing them served fifty tickets as a project.
 */
export type ListPage = { projectId: string; rows: ListRow[]; nextCursor: string | null };

/**
 * The page size this client ASKS FOR, and the reason it asks at all.
 *
 * The route's own default is 50 and its validated maximum is 200
 * (`routes/list.ts`, `MAX_LIMIT`; a larger value is a 400, so this is the
 * biggest legal page). Sending it explicitly does two things. It **cuts the
 * round trips for a large project four-fold** — 2000 rows is 10 requests here
 * rather than 40 at the server's default, and each one runs a recursive
 * ancestor CTE. And it makes the row bound below **true by construction**
 * instead of true by coupling: the first draft of this constant computed
 * "2000 rows" from the server's `DEFAULT_LIMIT`, which is a NON-EXPORTED const
 * in another package that this client never sent and could not observe. Had it
 * dropped to 25, the shipped client would have refused at 1000 rows while
 * telling the user, in a message it renders, that it refused at 2000.
 */
export const LIST_PAGE_SIZE = 200;

/**
 * The row bound, and it is a DISCLOSED ASSUMPTION rather than a measurement
 * (ruling P41).
 *
 * Nobody has measured a real project's ticket count on this product — there is
 * no production instance — so 2000 is a guess with a stated basis and not a
 * finding. It exists because an unbounded loop against a pathological project
 * is an unbounded number of round trips, and it is a REFUSAL rather than a
 * truncation because a silently truncated set is exactly the defect this whole
 * change closes, one bound further out.
 *
 * Owner: whoever first has a real project-size distribution. Raising it is a
 * one-line change and needs no new argument; the loud refusal is what makes the
 * limit safe to be wrong about.
 */
export const LIST_ROW_CAP = 2000;

/**
 * Derived, never typed twice. The row cap is the number a human reasons about
 * and the page cap is the number the loop counts, and writing both by hand is
 * how they drift apart.
 */
export const LIST_PAGE_CAP = LIST_ROW_CAP / LIST_PAGE_SIZE;

/**
 * The refusal beyond the cap. In the register with every other absence, so a
 * shell renders it the same way, and SELF-EXPIRING: the moment the loop can
 * finish, it never constructs this.
 */
/**
 * ## This absence is NOT added to `SERVING_GAPS`, and that is a decision
 *
 * P41 said "a loud refusal in the `ServingGapError` register". It is one — it
 * throws `ServingGapError` carrying a named `Absence`, which is what a shell
 * renders. It is deliberately NOT a `SERVING_GAPS['getTickets']` key, because
 * **that map means *this method refuses ALWAYS***, and `getTickets` answers for
 * every project small enough to finish. ⚠ **CORRECTED 2026-09-20:** the next
 * sentence read *"It would also contradict the standing fact that the register
 * carries `search` alone"* — it does not, and the register carries **nothing**:
 * `search` was its last key and was served 2026-09-19. The DECISION this sentence
 * supports is untouched and rests on its own reason, two sentences up. Ratified by
 * the controller 2026-09-06.
 *
 * *(An earlier draft of this note also claimed a key would "detonate
 * `stub-services.ts`'s `refuse(method)` lookup". **That was false and is
 * corrected rather than deleted, per ruling P40**: `refuse()` throws only when
 * a named gap DISAPPEARS from the register, and `getTickets` is `unstubbed`
 * there — `refuse('getTickets')` is called nowhere. What a key would actually
 * break is `mappers.test.ts`'s register assertions and two web tests. The
 * decision was right; the mechanism named for it was not, and a maintainer
 * sent to `stub-services.ts` would have found nothing.)*
 */
export const LIST_TOO_LARGE_ABSENCE: Absence = {
  field: 'TicketListView.rows',
  // Both `null`, which in this register means NO ROUTE CAN CLOSE IT — the
  // client TYPE is the owner. The server serves every page asked for; what
  // cannot be served is a COMPLETE row set inside a bound this client chose,
  // and no wire key exists for "the project is too big for the view type".
  wireKey: null,
  wireRoute: null,
  because: `the project holds more than ${LIST_ROW_CAP} tickets and TicketListView is the COMPLETE row set — serving the pages already fetched would present a truncated list as the whole project, which is the defect this loop exists to prevent`,
  owner: `raise LIST_ROW_CAP once a real project-size distribution is known, or give the list surface a paged view type — the bound is a disclosed assumption (${LIST_ROW_CAP} rows = ${LIST_PAGE_CAP} pages x ${LIST_PAGE_SIZE}, a page size this client SENDS rather than inherits), never a measurement`,
};

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

/**
 * A string the wire declares REQUIRED but whose VALUE may honestly be `null`
 * (`DeletedItem.projectId` et al.) — the key itself must be present, exactly
 * the discipline every other required field in this module gets, but unlike
 * `asString` a `null` value is not a `MappingError`: it is a real, distinct
 * claim this type carries ("no project", "not marked"), not a second spelling
 * of "the route forgot to answer".
 */
function asStringOrNull(record: Record<string, unknown>, key: string, path: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new MappingError(path, `a "${key}" key — present and either a string or null`);
  }
  const value = record[key];
  if (value === null) return null;
  return asString(value, path);
}

const STATE_CATEGORIES: readonly string[] = ['open', 'active', 'terminal'];

const GROUPINGS: readonly string[] = ['epic', 'status', 'assignee', 'type', 'priority', 'flat'];

/** `ListColumnId`'s closed members; the seventh arm is the open `field:${string}`. */
const LIST_COLUMN_IDS: readonly string[] = [
  'status',
  'assignee',
  'dueDate',
  'type',
  'progress',
  'priority',
];

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
 * `GET /v1/workspaces/:workspaceId/members` → `RosterMember[]`.
 *
 * `{userId, displayName, role, email?}` → `{id, name, role, email?}` is a rename
 * plus the role CARRIED rather than dropped, plus the address carried **only
 * when the server sent one** — the field it withholds for a phone member is a
 * phone number wearing an invalid domain, and the reasoning is stated once, in
 * `WorkspaceMember` (`@gisik-nokma/domain`).
 *
 * ## The docblock this replaces, and why its argument was wrong HERE
 *
 * It read: "`role` is dropped: the client's `Actor` has no room for it, and the
 * server disclosing more than the client reads is the safe direction." The
 * second clause is true of a value nobody can use, and it was false about this
 * one for a reason the sentence could not see from where it stood: `role` is
 * the SUBJECT of the screen that reads this method. `/w/[workspaceId]/members`
 * draws a person and their standing in the workspace, so dropping the field did
 * not withhold a disclosure — it removed a column the product is supposed to
 * draw, and no test noticed because every view test drove a fake data source.
 * **A withheld field and an unbuilt column look identical from the client.**
 *
 * The route has sent `role` since it first answered
 * (`routes/builder-reads.ts:247`, returned at `:259`), and the wire type is
 * `WorkspaceMember` (`packages/domain/src/read-models.ts:547`).
 *
 * ## What did NOT change
 *
 * `rosterByActorId` below still answers the actor-id → string map the board join
 * wants, and `RosterMember` is an `Actor`, so nothing on that path moves. (The
 * STRING it answers is `memberLabel`'s since 2026-09-22 — see that function
 * below — which is a change to what the value is, not to the shape of the map,
 * and this paragraph is about the shape.) The board sends `assigneeId` and no
 * role, and it still gets no role — the width added here is on the ROSTER value,
 * not on the ticket's `assignee`.
 *
 * `role` is REQUIRED and read with `asString`, so an entry that arrives without
 * one is a `MappingError` naming the path rather than a person silently
 * rendered as whatever a default would have been. See `RosterMember`'s docblock
 * (`view-types.ts`) for why absent and `member` must not be able to look alike,
 * and why the value stays a plain `string` rather than the domain's
 * `WorkspaceRole` union.
 */
export function mapActors(raw: unknown): RosterMember[] {
  const record = asRecord(raw, 'members');
  return asArray(record['members'], 'members.members').map((entry, index) => {
    const member = asRecord(entry, `members.members[${index}]`);
    const email = member['email'];
    return {
      id: asString(member['userId'], `members.members[${index}].userId`),
      name: asString(member['displayName'], `members.members[${index}].displayName`),
      role: asString(member['role'], `members.members[${index}].role`),
      // `email` is the ONE field here whose ABSENCE is the server's decision
      // rather than a malformed body (`WorkspaceMember.email`), so it passes
      // through as absent instead of being defaulted — a `?? ''` would convert
      // "the product decided not to say" into "the product says nothing", which
      // is the same mistake a withheld count read as `0` would be.
      //
      // Present-but-not-a-string still THROWS, which is the point of routing it
      // through `asString` rather than a truthiness check: `null` is not this
      // field's spelling of absent, and a body that sends one is a body this
      // client cannot read.
      ...(email === undefined
        ? {}
        : { email: asString(email, `members.members[${index}].email`) }),
    };
  });
}

/**
 * The roster as the join consumes it: actor id → **the member's LABEL**.
 *
 * `memberLabel`, not `actor.name`. The value used to be the raw display name,
 * and a display name of `''` is a shape this product really produces — an email
 * sign-up has none, because better-auth's magic-link plugin creates the user
 * with `name: name || ""` (`member-label.ts` has the full account) — so the join
 * handed every downstream mapper an EMPTY NAME to print. Rendering an empty name
 * is not a degradation, it is a hole on screen; the mappers were left to invent
 * something or show nothing, and the surfaces holding a roster row in hand had
 * each grown their own copy of the fallback instead.
 *
 * Resolving it HERE rather than at each render is what makes the rule hold for
 * every join at once: `mapAssignee` and `mapProvenance` are unchanged by it and
 * now correct (case 13.1292), and a future caller that joins a roster gets the
 * fallback without knowing it exists.
 *
 * The parameter is structural — `{id, name, email?}` — so `RosterMember` passes
 * and `Actor` does too (a ticket's `assignee`, `replica-data-source.ts`'s
 * synthesised rows). An `Actor` simply has no address to offer, which is the
 * correct answer for a value that cannot know one.
 */
export function rosterByActorId(
  actors: readonly { id: string; name: string; email?: string }[],
): Map<string, string> {
  return new Map(actors.map((actor) => [actor.id, memberLabel(actor)]));
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
 *
 * ## …and the roster's VALUE is now a label, not a display name
 *
 * The substitution above is `roster.get(id) ?? id` and nothing else, which is
 * still the whole of this function's judgement. What changed is what the map
 * HOLDS: `rosterByActorId` builds each value with `memberLabel` (name → email →
 * id), because a display name of `''` is a shape this product really produces
 * and an empty name is a hole on screen rather than a degradation of one. So an
 * assignee whose name the server did not set reads as their ADDRESS here, and
 * one with neither reads as their id — the row's own case is 13.1292.
 *
 * This is the one place the change reaches: the substitution rule, the refusal
 * to invent, and the `null` arm above are all untouched.
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

/**
 * `BoardCard.parent`/`BoardCard.epic`'s own wire shape, both `{ ticketId, key
 * }`-or-`null` (epic adds `title`) — see those fields' own docblocks
 * (`view-types.ts`) for why NEITHER carries an existence leak the way
 * `ParentRef.restricted` does: an ABSENT key here is a body this client
 * cannot read (`asRecord`/`asString` refuse it), never a silent `undefined`,
 * which is the same "a missing field is a refusal" rule every other required
 * field on this card already keeps.
 */
function mapBoardParent(raw: unknown, path: string): { ticketId: string; key: string | null } | null {
  if (raw === null) return null;
  const record = asRecord(raw, path);
  return {
    ticketId: asString(record['ticketId'], `${path}.ticketId`),
    key: record['key'] === null ? null : asString(record['key'], `${path}.key`),
  };
}

function mapBoardEpic(
  raw: unknown,
  path: string,
): { ticketId: string; key: string | null; title: string } | null {
  if (raw === null) return null;
  const record = asRecord(raw, path);
  return {
    ticketId: asString(record['ticketId'], `${path}.ticketId`),
    key: record['key'] === null ? null : asString(record['key'], `${path}.key`),
    title: asString(record['title'], `${path}.title`),
  };
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
    // The SAME reader the list card uses, over the same wire field — ruling
    // E5-2. `TicketCard.dueDate` was already on every card the board is
    // projected from; this mapper was the one place that did not look at it.
    dueDate: mapDueDate(record['dueDate'], `${path}.dueDate`, roster),
    priority: mapPriority(record['priority'], `${path}.priority`, roster),
    // `pending` is client-side truth: set only between submit and the server's
    // answer, so anything off the wire is settled by definition.
    // `null` is the truth ("no prefix in the ledger") and survives; an ABSENT
    // key is a body the server does not send since 2026-09-22 and `asString`
    // refuses it, so a forgotten field cannot pass as a prefix-less workspace.
    key: record['key'] === null ? null : asString(record['key'], `${path}.key`),
    pending: false,
    parent: mapBoardParent(record['parent'], `${path}.parent`),
    epic: mapBoardEpic(record['epic'], `${path}.epic`),
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
    // `creatable` is REQUIRED on `BoardColumn` for the identical reason
    // `blocked` is, in the comment above: a garbled or absent read must fail
    // loudly here rather than default to a value that reads on screen as a
    // claim about the work (starting-status design, 2026-09-23).
    creatable: asBoolean(record['creatable'], `${path}.creatable`),
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
 * The workspace the LIST body names — the same join, one route over.
 *
 * `ListResponse.workspaceId` is REQUIRED (`packages/domain/src/read-models.ts`),
 * so an absent key is a body this client cannot read rather than one it should
 * degrade around: `asString` refuses it by NAME, beside the sibling
 * `boardWorkspaceId`, which is what makes a route that stopped sending the field
 * a one-line failure here instead of every assignee in the list quietly
 * rendering as a ULID again.
 */
export function listWorkspaceId(raw: unknown): string {
  return asString(asRecord(raw, 'list')['workspaceId'], 'list.workspaceId');
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
 * `GET /v1/workspaces/:ws/tickets/:id/attachments` → `AttachmentListEntry[]`.
 *
 * ## Every field is checked, and `kind` is written by this mapper rather than
 * ## sent
 *
 * The route serves `{attachmentId, filename, mime, size, sha256}` — the five
 * fields the `upload` arm names — so this is a field-for-field read and the
 * `kind: 'upload'` literal is the mapper's own statement about what the door it
 * reads can produce. That is the honest place for it: the wire carries no
 * `kind` because the `attachments` table has no kind column, and a mapper that
 * wrote a `kind` it had not been told would be inventing one if the arm ever
 * widened. **When a Drive-reference row becomes producible, the wire grows a
 * `kind` and this mapper reads it** — the route's docblock carries that
 * recorded owner.
 *
 * `sha256` is checked as `string | null` rather than as a string: the column is
 * nullable (an unknown hash is written as `null` honestly, not as a default),
 * and `AttachmentListEntry`'s upload arm says `string | null`. The one thing
 * this refuses is the shape the view model cannot describe at all.
 *
 * **⚠ CORRECTED 2026-09-20: this read *"would reach the view as `undefined` and
 * render as nothing", and NO surface renders `sha256`** — `attachment-list.tsx`'s
 * upload arm draws the filename and the mime and nothing else, and every other
 * `sha256` under `views/` is a type declaration. The check is unchanged and
 * still right; the stated consequence was imaginary. What it actually buys is
 * that a value the contract cannot hold never enters the view model at all,
 * where a later renderer would inherit the lie instead of a type error.
 *
 * No `ServingGapError` branch: nothing here is a fact the server holds and
 * withholds. The mapped rows ARE the answer, which is what a gap-free mapper
 * looks like.
 */
export function mapTicketAttachments(raw: unknown): AttachmentListEntry[] {
  const record = asRecord(raw, 'attachments');
  return asArray(record['attachments'], 'attachments.attachments').map((entry, index) => {
    const path = `attachments.attachments[${index}]`;
    const row = asRecord(entry, path);
    const sha256 = row['sha256'];
    if (sha256 !== null && typeof sha256 !== 'string') {
      throw new MappingError(`${path}.sha256`, 'a hex string or null');
    }
    return {
      kind: 'upload' as const,
      attachmentId: asString(row['attachmentId'], `${path}.attachmentId`),
      filename: asString(row['filename'], `${path}.filename`),
      mime: asString(row['mime'], `${path}.mime`),
      size: asNumber(row['size'], `${path}.size`),
      sha256,
    };
  });
}

/**
 * `GET /v1/workspaces/:ws/tickets/:id/comments` → the thread.
 *
 * ## `body` is NOT validated, and that is the contract rather than an omission
 *
 * A comment body is a ProseMirror document, and amendment 12 keeps that opaque
 * outside `packages/editor`: app-core passes it through or renders it with
 * `docToPlainText`, which is total (it answers `''` for anything it cannot
 * read rather than throwing). So there is nothing here this module could check
 * that the renderer does not already handle, and a `MappingError` on a body
 * this client cannot parse would turn a malformed document into a failed READ —
 * losing the whole thread for one comment the renderer would have shown as
 * empty. `PlainTextEditorSlot` takes the identical position on the identical
 * value for the identical reason.
 *
 * ## `files`
 *
 * The three fields the chip row draws, and no more. `mime` is `string | null`
 * and not `string`: `null` is the server saying an embedded id resolved to no
 * attachment row, which it renders as the id in place of a name rather than
 * dropping the entry. A mapper that demanded a string here would convert that
 * honest fallback into a failed read. Note what is deliberately NOT carried:
 * `size` and `sha256` are on the attachments route's rows because
 * `AttachmentListEntry` needs them, and nothing on this screen does.
 */
export function mapTicketComments(raw: unknown): TicketComment[] {
  const record = asRecord(raw, 'comments');
  return asArray(record['comments'], 'comments.comments').map((entry, index) => {
    const path = `comments.comments[${index}]`;
    const row = asRecord(entry, path);
    const files = asArray(row['files'], `${path}.files`).map((fileEntry, fileIndex) => {
      const filePath = `${path}.files[${fileIndex}]`;
      const file = asRecord(fileEntry, filePath);
      const mime = file['mime'];
      if (mime !== null && typeof mime !== 'string') {
        throw new MappingError(`${filePath}.mime`, 'a string or null');
      }
      return {
        attachmentId: asString(file['attachmentId'], `${filePath}.attachmentId`),
        filename: asString(file['filename'], `${filePath}.filename`),
        mime,
      };
    });
    return {
      commentId: asString(row['commentId'], `${path}.commentId`),
      authorId: asString(row['authorId'], `${path}.authorId`),
      body: row['body'],
      // The envelope's `serverTime`, ISO 8601 — the server serializes it so,
      // and `formatDateTime` is the one renderer for it.
      recordedAt: asString(row['recordedAt'], `${path}.recordedAt`),
      files,
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

/**
 * `GET /v1/workspaces/:workspaceId/ticket-types` → `TicketTypeDef[]`.
 *
 * ## This is an ADAPTATION, not a serving gap, and that was measured
 *
 * Every field the client needs is on the wire, under the client's own spelling:
 * the route's body is typed `TicketTypeListResponse`
 * (`packages/domain/src/read-models.ts:301`) whose `ticketTypes` are the very
 * `TicketTypeDef` this returns, and `readTicketTypes`
 * (`apps/server/src/routes/builder-reads.ts:172`) builds each entry as
 * `{id, name, icon, rank, workflowId, fields}`. Case 7.38
 * (`apps/server/test/routes/builder-reads.test.ts:250`) pins that body against a
 * real database and real doors — `[['epic',1,'wf-errands'], ['chore',3,
 * 'wf-second'], ['task',3,'wf-errands']]`, names, icons and `fields` included.
 * So there is nothing to rename and nothing absent to refuse over; this mapper
 * VALIDATES and hands the definitions on.
 *
 * The validation is not ceremony. `ticket-types` is the one read whose answer
 * this shell turns into a WRITE — the id chosen in the picker is the `typeId` in
 * `ticket.created` — so a malformed entry that survived to the dialog would be
 * submitted and refused by `ticketTypeExists` under the actor's name. Failing
 * here names the response; failing there names the person.
 *
 * `fields` is validated only as far as ARRAY. The custom-field shapes are
 * `customFieldDefSchema`'s (`packages/domain/src/ticket-types.ts:10`) and
 * re-stating them here would be a second declaration of one shape, free to
 * disagree with the first; nothing in this shell reads a field definition yet.
 * Stated rather than left implicit: a garbled `fields[0].type` reaches a future
 * consumer unchecked, and that consumer is where it must be caught.
 */
export function mapTicketTypes(raw: unknown): TicketTypeDef[] {
  const record = asRecord(raw, 'ticketTypes');
  return asArray(record['ticketTypes'], 'ticketTypes.ticketTypes').map((entry, index) => {
    const path = `ticketTypes.ticketTypes[${index}]`;
    const type = asRecord(entry, path);
    return {
      id: asString(type['id'], `${path}.id`),
      name: asString(type['name'], `${path}.name`),
      icon: asString(type['icon'], `${path}.icon`),
      rank: asNumber(type['rank'], `${path}.rank`),
      workflowId: asString(type['workflowId'], `${path}.workflowId`),
      fields: asArray(type['fields'], `${path}.fields`) as TicketTypeDef['fields'],
    };
  });
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
  if (record['priority'] !== undefined) {
    // The reverse of the `singular('priorities', …, 'priority')` above, and it
    // validates through the same reader the cards use rather than casting: a
    // stored filter naming a level off the ladder is refused here, not rendered
    // as a criterion nothing can match.
    const priority = asString(record['priority'], `${path}.priority`);
    if (!PRIORITIES.includes(priority as Priority)) {
      throw new MappingError(`${path}.priority`, `one of ${PRIORITIES.join('/')}`);
    }
    spec.priorities = [priority as Priority];
  }
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
  // `closed` (backlog/closed spec §3.2/§4, 2026-09-17): the wire and the
  // client spell it the same, a plain carry rather than a rename — but a
  // REQUIRED boolean read as one (`asBoolean`'s own docblock): a `'true'`
  // string silently becoming `true` is the exact failure that guard exists
  // to catch, and it applies here the same as everywhere else this module
  // reads a wire boolean.
  if (record['closed'] !== undefined) spec.closed = asBoolean(record['closed'], `${path}.closed`);
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

  // Exclude-mode spec §2 (2026-09-17): `filterSpecSchema` has no negation term,
  // so an exclude half cannot be sent. Refused, not dropped — the identical
  // reasoning as the plural refusal below. Empty lists and an empty object
  // exclude nothing and are not refused.
  const exclude = filter.exclude ?? {};
  const excludedAxes = (Object.keys(exclude) as (keyof IdAxes)[]).filter(
    (axis) => (exclude[axis]?.length ?? 0) > 0,
  );
  if (excludedAxes.length > 0) {
    throw new UnexpressibleFilterError(
      'exclude',
      `filterSpecSchema has no negation term, and this filter excludes on ${excludedAxes.join(', ')}`,
    );
  }

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
  // Spec 2026-09-22. Singular like `stateCategory` and for the same reason: the
  // wire has ONE `priority` term, so two levels are an
  // `UnexpressibleFilterError` rather than a silent narrowing to the first.
  singular('priorities', filter.priorities, 'priority');
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
  // `closed` — the wire and the client spell it the same (`filterSpecSchema`
  // already carries the term server-side), so this is a plain carry and not
  // a narrowing like the plural axes above.
  if (filter.closed !== undefined) spec['closed'] = filter.closed;
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


/**
 * An optional COUNT: absent means withheld, present must be a number.
 *
 * The `in` check is the whole point and a truthiness check would not do: `0` is
 * a served count and falsy, so `record[key] ? … : null` would map an honest zero
 * to withheld — the same conflation in the other direction, and the one a test
 * with tidy non-zero fixtures never catches.
 *
 * `undefined` rather than `!(key in record)` because a JSON object never carries
 * an explicitly-undefined key: absence and `undefined` are the same state here,
 * and an explicit `null` is neither and reaches `asNumber`, which refuses it.
 */
function withheldOrNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
): number | null {
  return record[key] === undefined ? null : asNumber(record[key], path);
}

/**
 * A nullable text column where **the KEY is required and the VALUE may be null**
 * (door A, 2026-09-19).
 *
 * **The refusal on an absent key is the point of this helper, not a side
 * effect.** `withheldOrNumber` above reads an absent key as a WITHHOLDING,
 * because for a count that is exactly what the server did — it decided not to
 * count for this caller. A description has no withholding state: the route
 * always sends the key, spelling "nobody has described this project" as `null`.
 * So an absent key here can only mean a construction site that did not carry
 * the field, and the two failures this closes are the ones this repo keeps
 * paying for:
 *
 * - **Silently arriving `undefined` on a route nobody tested.** `undefined` on
 *   the client means NOT DESCRIBED (`view-types.ts`), so a forgotten site would
 *   render as a correct-looking card with no description — a wrong answer that
 *   is indistinguishable from the right one.
 * - **A test that agrees with the bug**, because its fixture was built from the
 *   same shape the mapper was reading.
 *
 * A throw names the path, so the failure says which row on which route omitted
 * it rather than surfacing as a blank line in a UI.
 */
function describedText(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new MappingError(
      path,
      'a project description key — every project row must state its description, ' +
        'spelling "not described" as null rather than omitting the key',
    );
  }
  const value = record[key];
  // null -> undefined, the ONE thing that produces NOT DESCRIBED on the client.
  if (value === null) return undefined;
  return asString(value, path);
}

/**
 * `GET /v1/me/workspaces` → `WorkspaceRef[]`. **ANSWERS** since rulings P32/P38.
 *
 * It REFUSED, and the reason it gave was right: "a nav rendering workspaces with
 * no projects under them, or with an invented empty list, is a nav that says
 * this workspace holds no projects." No `/v1` route read `proj_projects` at all,
 * so there was nothing honest to render.
 *
 * What unblocked it was not a new read but a RULING about who may be told a
 * project's name. `read/visible-projects.ts` applies `resolveEffectiveRole`:
 * owner sees every project (the shipped `canSeeResolved` switch exempts owner by
 * name), everyone else sees `eff.projects` — the same set that function already
 * consults for project-mode tickets, with no admin bypass.
 *
 * So the list is PARTIAL for most viewers, and that is the correct answer rather
 * than the "invented empty list" the old refusal feared. The difference between
 * the two is the difference between withholding a name and asserting an absence.
 *
 * The `workspaceId` → `id` rename is adaptable. **`role` is READ now (Task 15,
 * the audit's approved role-label addition)** — it was a field the server
 * discloses that the client did not read, and the display, not the data, was
 * the gap.
 *
 * ## Task 16's counts: ABSENT and `0` are different claims, and both are read
 *
 * `memberCount`, `ticketCount` and `blockedCount` are OPTIONAL on the wire and
 * `number | null` here. The server omits the key when the caller is a guest in
 * that workspace, and `withheldOrNumber` maps that absence to `null` — which the
 * card renders as "Restricted". A key that IS present must be a number: `null`,
 * a string or a boolean on the wire is a `MappingError`, not a second spelling
 * of withheld, because a server that sent `null` did something this contract
 * does not describe and the honest response is to say so rather than guess which
 * of the two claims it meant.
 *
 * **There is no `?? 0` on this path and there must not be.** Defaulting the
 * absence to zero would convert a withholding into the assertion "this project
 * holds no work", which is the exact lie the withholding exists to avoid, and it
 * would do it silently — the shape a renderer cannot detect.
 *
 * `archived` is REQUIRED, not optional: it is served to every caller who is told
 * the project's name at all, so an absent key means the route did not answer
 * this question and `asBoolean` refuses it. That is the same distinction the
 * `projects` key draws two paragraphs down between absent and `[]`.
 *
 * ## Task 18's `nameRestrictedProjectCount`, and the sentence it amends
 *
 * The inline comment on the `projects` key below used to say a count of the
 * projects a viewer may not name would "itself be the disclosure the rule
 * withholds". **The owner ruled otherwise on 2026-09-09**, for a narrower count
 * than the one that sentence was written against: only the projects the caller
 * can already see a TICKET in, whose `projectId` they therefore already carry.
 * The full text of the ruling and the two options it refused are in
 * `docs/lanes/owner-question-restricted-project-count.md`; the reasoning is
 * restated at the comment site and at `read/workspace-counts.ts`, which is
 * where the set is computed.
 *
 * The field is REQUIRED here, unlike the three counts above: it has no withheld
 * state, because it is served to a guest too. That asymmetry is the ruling's
 * whole content and it is worth stating twice — a future reader pattern-
 * matching the counts beside it would make this optional and hand a guest
 * `null`, which is the one viewer the number was ruled FOR.
 */
export function mapWorkspaceRefs(raw: unknown): WorkspaceRef[] {
  const record = asRecord(raw, 'workspaces');
  return asArray(record['workspaces'], 'workspaces.workspaces').map((entry, index) => {
    const path = `workspaces[${index}]`;
    const workspace = asRecord(entry, path);
    return {
      id: asString(workspace['workspaceId'], `${path}.workspaceId`),
      name: asString(workspace['name'], `${path}.name`),
      // The workspace prefix (owner spec 2026-09-20) — `CC` in `CCSO-1183`.
      // REQUIRED and a plain string, not a nullable one: the server answers
      // `null` here only for a workspace it cannot NAME, and `name` above is
      // read first and refuses that row outright. So a `prefix` that is absent
      // or null on a row that got this far is a construction site that forgot
      // the field, which is a bug worth a loud refusal rather than a blank
      // half of every key in the workspace.
      prefix: asString(workspace['prefix'], `${path}.prefix`),
      role: asString(workspace['role'], `${path}.role`),
      // Trash series, Plan 1 Task 5 (spec T8). REQUIRED, not `withheldOrNumber`-
      // style optional — same reasoning `nameRestrictedProjectCount` gives
      // below and the sibling `project.archived` mapping gives two screens
      // down: served to every caller told about this workspace at all, guest
      // included, so an absent key is a construction site that forgot the
      // field, not a withholding.
      archived: asBoolean(workspace['archived'], `${path}.archived`),
      memberCount: withheldOrNumber(workspace, 'memberCount', `${path}.memberCount`),
      // REQUIRED, and deliberately not `withheldOrNumber`: this count has no
      // withheld state on the wire — the server serves it to every caller
      // including a guest — so an absent key means the route did not answer
      // this question and `asNumber` should say so. Reading it as optional
      // would invent a third state (`null`) the card would then need a branch
      // for, and a renderer given a branch nothing produces is a branch nobody
      // ever sees fail. Same argument as `archived` two lines down.
      nameRestrictedProjectCount: asNumber(
        workspace['nameRestrictedProjectCount'],
        `${path}.nameRestrictedProjectCount`,
      ),
      // A PARTIAL LIST IS THE CORRECT ANSWER, not a defect (rulings P32/P38).
      // Every role except owner is served only the projects it holds a
      // membership in, because a project's NAME is itself a disclosure.
      //
      // **AMENDED, Task 18, owner ruling 2026-09-09.** This comment used to
      // end: "there is deliberately no 'and N more', because the COUNT would
      // itself be the disclosure the rule withholds." That sentence was right
      // about a count of EVERY project — which is the option the owner refused
      // — and wrong about the one now served. `nameRestrictedProjectCount`
      // counts only projects this caller can already see a ticket in, and a
      // visible ticket card carries its own `projectId`, so the number is a
      // count of ids the reader is holding as they read it. It discloses a NAME
      // restriction, not an existence: the P32 distinction
      // `read/visible-projects.ts` draws in its own words. The rule this
      // comment protects is unchanged — the LIST still names nothing extra.
      //
      // The key is REQUIRED, never defaulted to `[]`. An absent `projects`
      // would mean the route did not answer this question at all; `[]` is a
      // different claim — "you are in none of this workspace's projects" —
      // which a viewer may act on. `asArray` refuses the first and serves the
      // second, which is the same distinction `mapRollup` draws for a null.
      projects: asArray(workspace['projects'], `${path}.projects`).map((project, projectIndex) => {
        const projectPath = `${path}.projects[${projectIndex}]`;
        const row = asRecord(project, projectPath);
        // Read BEFORE the object literal so the spread below can leave the key
        // out entirely rather than writing it as `undefined`.
        const description = describedText(row, 'description', `${projectPath}.description`);
        return {
          id: asString(row['projectId'], `${projectPath}.projectId`),
          name: asString(row['name'], `${projectPath}.name`),
          archived: asBoolean(row['archived'], `${projectPath}.archived`),
          // Required key, nullable value — see `describedText`. A row that
          // omits it is a construction site that forgot the field, not a
          // project without a description, and the two must not read alike.
          //
          // SPREAD rather than written as `description: <string | undefined>`,
          // so NOT DESCRIBED is a genuinely absent key on the client and
          // `'description' in ref` answers the same question as
          // `ref.description === undefined`. The type's docblock claims absence,
          // and a key that is present-and-undefined would make that claim false
          // for anyone who tested it with `in` — the difference `13.976`
          // asserts on the domain payload for exactly the same reason.
          ...(description === undefined ? {} : { description }),
          // The project prefix — `SO` in `CCSO-1183`. REQUIRED and never null,
          // and unlike `description` two lines up there is no "not entered"
          // state to spell: the server has already collapsed stored-or-derived
          // into one value, so a null here is not a project without a prefix
          // but a route that did not resolve one. `asString` refuses it.
          prefix: asString(row['prefix'], `${projectPath}.prefix`),
          ticketCount: withheldOrNumber(row, 'ticketCount', `${projectPath}.ticketCount`),
          blockedCount: withheldOrNumber(row, 'blockedCount', `${projectPath}.blockedCount`),
        };
      }),
    };
  });
}

/**
 * One `FieldClaim` map, verbatim but VALIDATED.
 *
 * The two sides are the same type — `view-types.ts` imports `FieldClaim` from
 * `@gisik-nokma/domain`, which is the type the server's reducer writes — so
 * there is nothing to adapt and the temptation is a cast. A cast would let a
 * claim with no actor render as a field somebody set, which is the provenance
 * floor's exact inverse. `value` is deliberately NOT checked: it is `unknown` on
 * both sides and every value including `null` is a claim somebody made.
 */
function mapFieldClaims(raw: unknown, path: string): Record<string, FieldClaim> {
  const record = asRecord(raw, path);
  const fields: Record<string, FieldClaim> = {};
  for (const [key, entry] of Object.entries(record)) {
    const claim = asRecord(entry, `${path}.${key}`);
    fields[key] = {
      value: claim['value'],
      actorId: asString(claim['actorId'], `${path}.${key}.actorId`),
      clientTime: asString(claim['clientTime'], `${path}.${key}.clientTime`),
      serverTime: asString(claim['serverTime'], `${path}.${key}.serverTime`),
    };
  }
  return fields;
}

/**
 * The server's three-state `TicketDueDate` → the client's
 * `{date, claim} | null`.
 *
 * **`null` here covers TWO server states and the loss is named rather than
 * hidden**: `never-claimed` (nobody ever gave this ticket a due date) and
 * `cleared` (somebody removed the one it had). `ListRow` has one nullable field
 * and no room for the difference, so both collapse — and the collapse is honest
 * in the direction that matters, because `null` renders as "no due date", which
 * is true of both. What is lost is the CLEARING's provenance, and it is not
 * destroyed: the claim is in the ledger and `getTicketHistory` serves it.
 *
 * A `claimed` state with no `claim` object, or one missing its date, throws —
 * a due date is a promise somebody made, and rendering one with an invented
 * actor would attribute it to nobody.
 */
function mapDueDate(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string>,
): { date: string; claim: ClaimProvenance } | null {
  const record = asRecord(raw, path);
  const state = asString(record['state'], `${path}.state`);
  if (state === 'never-claimed' || state === 'cleared') return null;
  if (state !== 'claimed') {
    throw new MappingError(`${path}.state`, 'one of claimed/cleared/never-claimed');
  }
  const claim = asRecord(record['claim'], `${path}.claim`);
  return {
    date: asString(claim['date'], `${path}.claim.date`),
    claim: mapProvenance(claim, `${path}.claim`, roster),
  };
}

/**
 * `TicketCard.priority` → `PriorityView`. ALWAYS present on the wire (spec
 * 2026-09-22), so there is no `null` arm and no absent-key tolerance here the
 * way `mapDueDate` has both: `applyTicketEvent` writes the birth claim on every
 * `ticket.created`, and `assembleTicketCards` THROWS rather than serve a card
 * without one.
 *
 * **A missing or off-ladder value is a `MappingError`, never a silent P2.** The
 * only way the server sends one is a `proj_tickets` that predates the reducer
 * and was never rebuilt, and filling in the default here would be the
 * reader-side default the spec rejected — it would also print a value with no
 * claim line beside it, which is the thing invariant 4 forbids. `PRIORITIES` is
 * imported rather than restated: this package holds no copy of the ladder.
 */
function mapPriority(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string>,
): PriorityView {
  const record = asRecord(raw, path);
  const value = asString(record['value'], `${path}.value`);
  if (!PRIORITIES.includes(value as Priority)) {
    throw new MappingError(`${path}.value`, `one of ${PRIORITIES.join('/')}`);
  }
  return { value: value as Priority, claim: mapProvenance(record, path, roster) };
}

/**
 * `TicketCard.closed` → `ListRow.closed`, unchanged: REQUIRED on both sides
 * (backlog/closed spec §1.2/§3.3, 2026-09-17), `null` meaning never closed or
 * reopened. The same shape `mapCause` takes — `null` survives as the truth,
 * an ABSENT key is a different claim left to `asRecord` to refuse, and the
 * two members are read rather than cast so a garbled claim (no actor, no
 * clock) cannot render as one somebody made.
 */
function mapClosed(raw: unknown, path: string): { actorId: string; at: string } | null {
  if (raw === null) return null;
  const record = asRecord(raw, path);
  return {
    actorId: asString(record['actorId'], `${path}.actorId`),
    at: asString(record['at'], `${path}.at`),
  };
}

/**
 * The wire's `rank` → `string | null` (spec §8.1, second wave 2026-09-18).
 * `null` survives as the truth — "nobody has ranked this ticket", which is a
 * different claim from a key and is the whole reason `compareByRank` can order
 * a project — and an ABSENT key is a different claim again, left to this
 * function to refuse for `mapClosed`'s own reason: `rank` is REQUIRED on the
 * wire (`TicketCard.rank`), the server reads the column unconditionally, so a
 * body that omits the key is a mapper that stopped reading it — the shape case
 * 13.603's second `it` exists to catch.
 *
 * **The predicate is `isRankKey`, not `RANK_KEY_REGEX`, and the plan's own
 * Interfaces line names the regex.** That line is the looser one on purpose and
 * the difference is load-bearing, in `rank.ts`'s words: the regex admits `'a0'`,
 * and a key ending in `0` has NO key below it, so `rankBetween` cannot order it
 * (measured non-terminating at i=20001). The DOMAIN door already uses
 * `isRankKey` for exactly that reason (`ticketRankedPayload`), and a client-side
 * predicate that were looser than the door's would admit into the Backlog tab's
 * sort a key the domain refuses to place — a second copy of a rule is how two
 * copies drift, so this borrows the rule instead of restating it.
 */
function mapRank(raw: unknown, path: string): string | null {
  if (raw === null) return null;
  if (!isRankKey(raw)) {
    throw new MappingError(path, "a rank key over 0-9a-z not ending in '0', or null");
  }
  return raw;
}

/**
 * An OPTIONAL instant on the wire → `string | null` (spec §8.2, second wave
 * 2026-09-18). `null`, an absent key and `undefined` all answer `null`; any
 * other non-string is refused.
 *
 * The tolerance is the whole reason this is a named function rather than an
 * inline `?? null`: `mapClosed` and `mapRank` beside it are strict, and a
 * reader meeting the three should be able to see that the difference is a
 * decision about THIS field (a server-side sweep input that no surface renders)
 * rather than an inconsistency somebody introduced by accident. See
 * `mapTicketState`'s comment at the call site for the reachability argument.
 */
function mapOptionalInstant(raw: unknown, path: string): string | null {
  if (raw === null || raw === undefined) return null;
  return asString(raw, path);
}

function mapListRow(raw: unknown, path: string, roster: ReadonlyMap<string, string>): ListRow {
  const record = asRecord(raw, path);
  return {
    ticketId: asString(record['ticketId'], `${path}.ticketId`),
    title: asString(record['title'], `${path}.title`),
    // The SAME read the board card makes over the same wire field (`mapBoardCard`,
    // where `ListCard = TicketCard & {…}` guarantees the field is on the body):
    // `null` is the truth ("no prefix in the ledger") and survives; an ABSENT key
    // is a body the server does not send since 2026-09-22 and `asString` refuses
    // it, so a forgotten field cannot pass as a prefix-less workspace.
    key: record['key'] === null ? null : asString(record['key'], `${path}.key`),
    typeId: asString(record['typeId'], `${path}.typeId`),
    typeRank: asNumber(record['typeRank'], `${path}.typeRank`),
    // `parentId` and `epicId` are `string | null` and REQUIRED on both sides:
    // null is the wire's own word for "no parent" / "under no epic this viewer
    // may see", and an absent key is a different claim, left to `asString` to
    // refuse.
    parentId: record['parentId'] === null ? null : asString(record['parentId'], `${path}.parentId`),
    epicId: record['epicId'] === null ? null : asString(record['epicId'], `${path}.epicId`),
    stateId: asString(record['stateId'], `${path}.stateId`),
    stateName: asString(record['stateName'], `${path}.stateName`),
    stateCategory: asStateCategory(record['stateCategory'], `${path}.stateCategory`),
    stateProvenance: mapProvenance(
      record['stateProvenance'],
      `${path}.stateProvenance`,
      roster,
    ),
    assignee: mapAssignee(record['assigneeId'], `${path}.assigneeId`, roster),
    // `null` is the truth when nobody is assigned; the server pairs the two, and
    // `assembleListCards` throws rather than serving an assigned card without a
    // claim, so a null here cannot mean "assigned by somebody unknown".
    assignedProvenance:
      record['assignedProvenance'] === null
        ? null
        : mapProvenance(record['assignedProvenance'], `${path}.assignedProvenance`, roster),
    dueDate: mapDueDate(record['dueDate'], `${path}.dueDate`, roster),
    priority: mapPriority(record['priority'], `${path}.priority`, roster),
    fields: mapFieldClaims(record['fields'], `${path}.fields`),
    rollup: mapRollup(record['rollup'], `${path}.rollup`),
    hasRestrictedParent: asBoolean(
      record['hasRestrictedParent'],
      `${path}.hasRestrictedParent`,
    ),
    // `false`, and it is a FACT here rather than a default. `pending` means "a
    // claim for this ticket is sitting in the outbox, unacknowledged". An
    // online-only shell HAS no outbox — `createOnlineDataSource` builds none and
    // ingest goes straight to the door — so nothing is ever in transit for it.
    // `view-types.ts`'s own argument for widening `ListRow` under ruling P30
    // says exactly this, and says the online mapper's answer "was already
    // written and already correct" BECAUSE `getTickets` refused outright. That
    // premise expired when P25 clause 1 made this mapper answer, and the
    // conclusion had to be written down rather than inherited: a required field
    // whose justification was "the function throws" needs a value the moment it
    // stops throwing. It is NOT read off the wire — the list route has no
    // concept of this client's outbox, so a `pending` on the body would be the
    // server asserting something only the client can know.
    pending: false,
    closed: mapClosed(record['closed'], `${path}.closed`),
    // The Global Constraint's field for this task, carried end to end: the
    // server assembler reads `proj_tickets.rank` (`read/ticket-cards.ts`), the
    // card's `rank` rides the JSON, and this is the client half — case 13.703.
    rank: mapRank(record['rank'], `${path}.rank`),
  };
}

/**
 * `GET /v1/projects/:projectId/tickets` → `TicketListView`. **This mapper used
 * to REFUSE, and the five facts it refused over are served now** (ruling P25
 * clause 1, this change set).
 *
 * The absence list this function threw is deleted rather than emptied: an
 * `Absence[]` with no entries is a refusal nobody can read, and
 * `client-contract.test.ts` throws on a list it cannot parse precisely so that
 * closing a gap forces the record to be removed instead of hollowed out.
 * `typeRank`, `epicId`, `stateName` and `assignedProvenance` are on every card;
 * `hasRestrictedParent` is `canSeeResolved` applied to each card's parent
 * (`apps/server/src/read/restricted-parents.ts`).
 *
 * ## The GROUPS are flattened, and that is not information lost here
 *
 * The server returns `groups` of `{key, label, cards}` and `TicketListView` is
 * `{projectId, rows}` — flat. The grouping is a function of the `groupBy` this
 * client SENT (`listQueryString`), and the client's own list view groups the
 * rows it holds; keeping the server's buckets would give a view two disagreeing
 * groupings of the same rows. Order is preserved exactly: groups in the order
 * the server emitted them (sorted by key), cards in the `ticket_id` order the
 * page arrived in. Flattening REARRANGES and never filters — every card the
 * server sent becomes exactly one row.
 *
 * ## `nextCursor` is RETURNED, and this mapper maps a PAGE (ruling P41, Door B)
 *
 * It used to refuse a non-null cursor outright, because `TicketListView` is
 * `{projectId, rows}` and had nowhere to say "there is more" — so serving the
 * rows would have presented a page as the whole project. That refusal was
 * honest and it is now unnecessary rather than wrong: **this function no longer
 * claims to produce the view.** It maps ONE PAGE to `ListPage`, a wire-shaped
 * type that carries the cursor, and `onlineDataSource.getTickets` follows the
 * cursor to exhaustion and assembles the complete `TicketListView` itself.
 *
 * Ruling P41 chose that door over the other two. A cursor ON `TicketListView`
 * was refused because nothing could act on it: `DataSourceQuery.getTickets`
 * (`data-source.ts`) takes `(projectId, filter, grouping)` and has nowhere to
 * put an incoming cursor, so the view type would have become able to express
 * partiality and unable to resolve it. It also would have inverted a decision
 * that is deliberately tripwired — `views/list-model.ts` licenses client-side
 * grouping ONLY because the view is the complete row set, and
 * `test/views/list-model.test.ts` enforces that as a TYPE guard on
 * `keyof TicketListView`. **Door B keeps that license TRUE rather than making
 * the tripwire something to route around**, which is why the guard is still
 * there and still passing.
 *
 * ## The roster is the CALLER'S, and it is now a real one
 *
 * `mapBoardView` joins the members route for display names because the board
 * body names its workspace. This body names one too — `ListResponse.workspaceId`,
 * added for exactly this (case 13.1287) — so `getTickets` fetches the roster
 * through `listWorkspaceId(raw)` and passes it in here, once for the whole walk,
 * exactly as `getBoard` does through `boardWorkspaceId(raw)`.
 *
 * The parameter still DEFAULTS to an empty map, and that is not a leftover: it
 * is the shape a roster the caller may not read arrives in. `mapAssignee` and
 * `mapProvenance` both degrade correctly on it — the assignee's `name` becomes
 * the actor id, which is what `actorLabel(id, null)` renders everywhere else in
 * this client, and `actorName` stays `null`, which is that field's documented
 * absence value. A name is missing; no fact is invented. Verified at the seam
 * by case 13.1289, where the members route answers 404.
 */
export function mapListPage(
  raw: unknown,
  roster: ReadonlyMap<string, string> = new Map(),
): ListPage {
  const record = asRecord(raw, 'list');

  // THE CURSOR IS CARRIED OUT, not dropped and not refused (ruling P41).
  //
  // What follows is the argument that USED to end in a refusal here, kept
  // because it is the reason the loop above this function has to exist.
  //
  // `GET /v1/projects/:id/tickets` pages at `DEFAULT_LIMIT = 50` and emits a
  // non-null `nextCursor` when it saw a 51st row. `TicketListView` is
  // `{projectId, rows}` — it has nowhere to put a cursor and no way to say
  // "there are more". So a mapper that dropped the cursor handed every consumer
  // fifty rows wearing the meaning "this project's tickets", and nothing
  // downstream could tell a page from a set: the project page renders fifty as
  // the complete list, and a calendar with no cell for row 51 then asserts
  // nothing is due on a day that has work on it.
  //
  // This is `mapRollup`'s rule, applied — not a new one. That mapper refuses a
  // non-zero `uncategorizedChildren` because `RollupToViewer` has no field to
  // carry it and rendering the other counts would present an admittedly
  // incomplete total as a complete one. Same sentence, same file, one level up:
  // the view type cannot express partiality, so partiality is refused rather
  // than dropped.
  //
  // That was the choice ruling P41 made: the SECOND of the two closures named
  // there — a paging loop in the online source — rather than a cursor on the
  // view type. So the cursor is validated and returned, and the caller that
  // receives it is the only thing allowed to decide the list is complete.
  //
  // `null` and absent are the same answer — "no more pages" — because the
  // server omits the key rather than sending null on a terminal page for some
  // shapes, and a mapper that distinguished them would make an unobservable
  // wire detail load-bearing. Anything else is a type error rather than a
  // silent coercion: a cursor arriving as a number would otherwise be
  // stringified into a request the server cannot resolve.
  const rawCursor = record['nextCursor'];
  const nextCursor =
    rawCursor === null || rawCursor === undefined ? null : asString(rawCursor, 'list.nextCursor');

  const rows: ListRow[] = [];
  asArray(record['groups'], 'list.groups').forEach((entry, groupIndex) => {
    const path = `list.groups[${groupIndex}]`;
    const group = asRecord(entry, path);
    asArray(group['cards'], `${path}.cards`).forEach((card, cardIndex) => {
      rows.push(mapListRow(card, `${path}.cards[${cardIndex}]`, roster));
    });
  });
  return { projectId: asString(record['projectId'], 'list.projectId'), rows, nextCursor };
}

/**
 * The wire's `ticketState` → the domain `TicketState` the client's `TicketRead`
 * declares.
 *
 * Validated field by field rather than cast, and the reason is the same one
 * `mapFieldClaims` gives: both sides name the SAME type
 * (`packages/domain/src/entity-state.ts`), so a cast compiles and checks
 * nothing. This is the object the rule engine reads; a `stateId` that arrived as
 * a number, or a missing `workspaceId`, would surface far from here as a refusal
 * that reads like a permissions problem (`checkTicketCreated`'s parent guard
 * compares `parent.workspaceId !== env.workspaceId`, and `undefined !==
 * anything` is always true).
 *
 * `kind` is asserted equal to `'ticket'` rather than copied from the wire: it is
 * the discriminant every `EntityState` narrowing turns on, and a body carrying
 * `kind: 'membership'` on this route is a body this client must not read.
 */
function mapTicketState(raw: unknown, path: string): TicketState {
  const record = asRecord(raw, path);
  const kind = asString(record['kind'], `${path}.kind`);
  if (kind !== 'ticket') throw new MappingError(`${path}.kind`, `ticket (got ${kind})`);
  return {
    kind: 'ticket',
    id: asString(record['id'], `${path}.id`),
    workspaceId: asString(record['workspaceId'], `${path}.workspaceId`),
    projectId: asString(record['projectId'], `${path}.projectId`),
    typeId: asString(record['typeId'], `${path}.typeId`),
    parentId: record['parentId'] === null ? null : asString(record['parentId'], `${path}.parentId`),
    workflowId: asString(record['workflowId'], `${path}.workflowId`),
    workflowVersion: asNumber(record['workflowVersion'], `${path}.workflowVersion`),
    stateId: asString(record['stateId'], `${path}.stateId`),
    stateCategory: asStateCategory(record['stateCategory'], `${path}.stateCategory`),
    assigneeId:
      record['assigneeId'] === null ? null : asString(record['assigneeId'], `${path}.assigneeId`),
    collaboratorIds: asArray(record['collaboratorIds'], `${path}.collaboratorIds`).map(
      (id, index) => asString(id, `${path}.collaboratorIds[${index}]`),
    ),
    fields: mapFieldClaims(record['fields'], `${path}.fields`),
    transitions: asArray(record['transitions'], `${path}.transitions`).map((entry, index) => {
      const at = `${path}.transitions[${index}]`;
      const transition = asRecord(entry, at);
      return {
        toStateId: asString(transition['toStateId'], `${at}.toStateId`),
        actorId: asString(transition['actorId'], `${at}.actorId`),
        seq: asNumber(transition['seq'], `${at}.seq`),
        workflowId: asString(transition['workflowId'], `${at}.workflowId`),
        workflowVersion: asNumber(transition['workflowVersion'], `${at}.workflowVersion`),
      };
    }),
    // Case 13.603 (final whole-branch review Finding 1, BLOCKER, 2026-09-17):
    // this member was missing entirely — every OTHER field above was hand
    // enumerated when `closed` did not exist yet, and it was never added when
    // it did. REQUIRED on the wire (backlog/closed spec §1.2 — the server
    // always sends it, `rowToTicketState` sets it on every row), so `mapClosed`
    // (`:1247`, the same shape `mapListRow` already reads it through) is the
    // right helper: it throws on an absent key rather than defaulting to
    // `null`, which is what would have hidden this exact defect a second time.
    closed: mapClosed(record['closed'], `${path}.closed`),
    // The SAME lesson, applied before it can cost anything: `rank` reaches a
    // client on this body too (`GET /v1/workspaces/:w/tickets/:id` →
    // `mapTicketRead` → here), so enumerating it in `mapListRow` alone would
    // reproduce 13.603 exactly — one route's consumers green against a fake,
    // the other route's field dead. `TicketState.rank?` is optional on the
    // DOMAIN type (legacy literals only); the wire always sends it, because
    // `rowToTicketState` reads the column unconditionally.
    rank: mapRank(record['rank'], `${path}.rank`),
    // The SAME lesson a third time, and the last member this mapper could still
    // have dropped: `reopenedAt` reaches this body (`GET /v1/workspaces/:w/
    // tickets/:id`) because `rowToTicketState` reads the column
    // unconditionally, and enumerating fields by hand is precisely how `closed`
    // went missing for a whole task (13.603).
    //
    // **Tolerant, unlike `mapClosed`/`mapRank`, and the price is stated rather
    // than argued away.** The plan's Task 7 Files line mandates this read
    // ("`mapTicketState` reads `reopenedAt ?? null`"), so an absent key answers
    // `null` — the same value as an explicit null, which is the distinction
    // 13.724 asserts. What that costs is real and it is one thing: the
    // tripwire. `mapClosed`/`mapRank` throw on an absent key because an absent
    // key there means the SERVER stopped sending a field a surface renders, and
    // 13.603 is what that costs when nobody notices. `reopenedAt` is a
    // server-side sweep input, and that is measured rather than assumed:
    // `reopenedAt` appears across `packages/*/src` and `apps/*/src` in exactly
    // one producer — this line — and **no comparator exists between this
    // mapper's output and a folded replica state** (the repo's two-sided rig
    // compares the server PROJECTION against the replica, and neither side
    // passes through this mapper). So a silent drop here would be invisible,
    // and the tolerance spends a tripwire for a comparison nobody makes today.
    // Recorded rather than left implied; if a surface ever renders this field,
    // the read should become strict on `mapRank`'s rule.
    //
    // The VALUE is still policed: `string | null` is the whole type, so a
    // number is refused rather than coerced (13.724's final arm).
    reopenedAt: mapOptionalInstant(record['reopenedAt'], `${path}.reopenedAt`),
    // The FOURTH member to fall through this hand-enumerated list, and the
    // second time `mapClosed` has been the exact helper for it (soft delete,
    // 2026-09-20). `TicketState.deleted` is `{ actorId, at } | null` — the
    // IDENTICAL shape to `closed` — and `rowToTicketState` writes it
    // UNCONDITIONALLY (`apps/server/src/projections/tickets.ts`), so the single
    // read's `ticketState` body always carries the key and a mapper that does
    // not read it silently drops a domain member.
    //
    // **Strict, not tolerant, and that is 13.603's lesson rather than a
    // preference.** Every reader of this field spells `state.deleted ?? null`,
    // so a DROPPED key and a `null` are indistinguishable — which is exactly
    // how `closed` stayed dead across four surfaces in production while each
    // surface's own tests stayed green (they seed a fake `DataSource` or a
    // `ticketStateSeed` and never cross this mapper). `mapClosed` throws on an
    // absent key; that throw is the tripwire, not a nuisance.
    //
    // The domain type carries `deleted?` OPTIONAL, on `closed?`'s exact rule —
    // "for the literals' sake", not because the wire may omit it. The wire
    // REQUIRES it here for `closed`'s own reason: `rowToTicketState` reads the
    // columns unconditionally, so an absent key means the server stopped
    // sending a domain member. `mapRank`'s docblock draws the same line for
    // `rank`, and `reopenedAt` is the ONE member that takes the tolerant road
    // with its reason stated (no comparator exists between this mapper's output
    // and a folded replica state, so the tripwire would guard nothing). That
    // reason does NOT apply here: this file's own `deleted` cannot be checked
    // against the replica either, but `closed` — the field it is a flag beside
    // — is strict, and the two are read by the same surfaces.
    deleted: mapClosed(record['deleted'], `${path}.deleted`),
  };
}

/**
 * The wire's `parent` → the client's `ParentRef`.
 *
 * The union is discriminated on both sides and the two arms are read
 * SEPARATELY, never as "read the title if it happens to be there": the
 * restricted arm has no `title` on the wire because the server never put one in
 * a variable on that branch (`routes/tickets.ts`), and this mapper's restricted
 * arm has no field to receive one. A `kind` this client does not know throws
 * rather than degrading to `null` — `null` means "this ticket has no parent",
 * which is a statement about the shape of the work and not about a body that
 * could not be read.
 *
 * The server's visible arm also carries `ticket`, a `proj_visibility` row. The
 * client's `ParentRef` has no room for it and reads nothing from it; the server
 * disclosing more than the client consumes is the safe direction, and dropping
 * it here is not a loss of anything `TicketRead` can express.
 */
function mapParentRef(raw: unknown, path: string): ParentRef {
  if (raw === null) return null;
  const record = asRecord(raw, path);
  const kind = asString(record['kind'], `${path}.kind`);
  if (kind === 'restricted') {
    return { kind: 'restricted', id: asString(record['id'], `${path}.id`) };
  }
  if (kind !== 'ticket') {
    throw new MappingError(`${path}.kind`, `one of ticket/restricted (got ${kind})`);
  }
  // P3 — THE KEY, AND THE ABSENT ARM IS NOT THE NULL ARM.
  //
  // `key: string | null` (a composed key, or one that could not be composed)
  // and `key` absent (a ref that carries no key at all — the grandparent, whose
  // crumb is title-only in the prototype) are different facts about different
  // crumbs. ⚠ Collapsing them — `record['key'] ?? null`, or emitting `null`
  // where the producer sent nothing — is the same mistake the TICKET's own
  // `key` mapping above refuses by name, one ref over: "this read could not
  // compose a key" and "this producer does not carry one" would become one
  // value. The property is simply not set when the wire does not set it, and
  // the client's type admits that.
  const key = record['key'];
  return {
    kind: 'ticket',
    id: asString(record['id'], `${path}.id`),
    title: asString(record['title'], `${path}.title`),
    ...(key === undefined ? {} : { key: key === null ? null : asString(key, `${path}.key`) }),
  };
}

/**
 * `GET /v1/workspaces/:ws/tickets/:ticketId` → `TicketRead`. **This mapper used
 * to REFUSE** over `title`, `stateProvenance` and the absent domain
 * `TicketState`; all three are served now (ruling P25 clause 1, this change
 * set), and so is the visible parent's `title`, which the client's `ParentRef`
 * requires and which was not in the recorded absence list at all.
 *
 * ## Two wire keys, and BOTH are read
 *
 * The route kept its original `ticket` — the `proj_visibility` row whose column
 * allow-list is argued column by column in `routes/tickets.ts` — and added the
 * domain state beside it rather than swapping it out. Renaming a key is exactly
 * what this module is for, and it is not a serving gap.
 *
 * **⚠ CORRECTED 2026-09-20.** This paragraph ended *"...and it is not a serving
 * gap; the visibility row is read by nothing here."* The second clause was true
 * when written and is false now: the row's two MODE columns reach the sheet as
 * `TicketRead.visibility` (`mapTicketVisibility` below).
 *
 * ## Two rosters, and only one of them is cut — an earlier draft of this
 * ## paragraph conflated them, so the distinction is written down here
 *
 * `proj_visibility`'s `own_user_ids` / `resolved_user_ids` are **derived
 * projection state**, and `toTicketView` cuts them at every call site
 * (`routes/tickets.ts`: *"an explicit audience ROSTER, a disclosure no
 * plan authorized"*). That is why `TicketVisibility` has no roster member: the
 * absence is in the shape rather than papered over.
 *
 * ⚠ **But the roster as a CLAIM does leave the server, by design, and an earlier
 * draft of this paragraph said it "never leaves the server at all" — that was
 * false.** `visibility.set` carries `userIds` in its own payload
 * (`packages/domain/src/events/visibility.ts:36`), and the history read serves
 * payloads verbatim: `toHistoryEvent` maps `payload: row.payload` with no
 * redaction (`routes/ticket-history.ts:176-194`), and `/events` does the same
 * (`routes/tickets.ts:519-527`). **This is not a leak to close.** The route's own
 * allow-list docblock draws the line and says which way to cut it — *"Those are
 * PROVENANCE — an attributed claim somebody made ... Cut derived state; never cut
 * a claim."* What is cut is the resolved COLUMN; what is served is the event that
 * set it. Conflating those two is the one mistake this endpoint's docblock was
 * written to prevent.
 *
 * ## The rule these titles are served under, named
 *
 * `canSee` (`apps/server/src/visibility/can-see.ts:227`, the async wrapper over
 * Plan 4's one decision function `canSeeResolved` at `:94`), applied at the
 * guard the route already had. The ticket's own title travels only after that
 * guard said yes about THIS ticket; the parent's travels only inside the branch
 * where it said yes about the PARENT. No new rule was authored to serve either.
 */
/** The three `proj_visibility` can resolve to; `inherit` is not one of them. */
const RESOLVED_VISIBILITY_MODES: readonly string[] = VISIBILITY_MODES.filter(
  (mode) => mode !== 'inherit',
);

function asVisibilityMode(value: unknown, path: string): VisibilityMode {
  const text = asString(value, path);
  if (!(VISIBILITY_MODES as readonly string[]).includes(text)) {
    throw new MappingError(path, `one of ${VISIBILITY_MODES.join('/')}`);
  }
  return text as VisibilityMode;
}

function asResolvedVisibilityMode(value: unknown, path: string): ResolvedVisibilityMode {
  const mode = asVisibilityMode(value, path);
  if (mode === 'inherit') {
    throw new MappingError(path, `one of ${RESOLVED_VISIBILITY_MODES.join('/')}`);
  }
  return mode;
}

/**
 * The `proj_visibility` row's two MODE columns, and only those.
 *
 * The route's own key for this row is `ticket` — the name the domain state used
 * to hold alone before `ticketState` was added beside it — so a refusal here
 * reads `ticket.own_mode`, the wire's spelling rather than this client's. That
 * is what `MappingError` paths are for.
 *
 * ## Strict, on the same rule `assignedProvenance` is mapped under
 *
 * The route emits this row on EVERY answer of this endpoint, so a body without
 * it is not a narrower server — it is a body this client cannot read. Tolerating
 * it would fold "the field was missing" into the one thing `TicketRead.
 * visibility`'s `null` is reserved for, *"this read carried no visibility row"*,
 * which is the replica's honest answer and must not be reachable from a garbled
 * response. Both columns are therefore REQUIRED.
 *
 * `resolved_mode` is refused when it says `inherit`: `proj_visibility` walks the
 * inherit chain at write time and cannot produce one, so a wire that says it is
 * not describing this product's projection. `own_mode` may say it — that is what
 * a ticket is born with.
 */
function mapTicketVisibility(raw: unknown, path: string): TicketVisibility {
  const row = asRecord(raw, path);
  return {
    ownMode: asVisibilityMode(row['own_mode'], `${path}.own_mode`),
    resolvedMode: asResolvedVisibilityMode(row['resolved_mode'], `${path}.resolved_mode`),
  };
}

export function mapTicketRead(raw: unknown, roster: ReadonlyMap<string, string> = new Map()): TicketRead {
  const record = asRecord(raw, 'ticket');
  return {
    ticket: mapTicketState(record['ticketState'], 'ticket.ticketState'),
    title: asString(record['title'], 'ticket.title'),
    stateProvenance: mapProvenance(record['stateProvenance'], 'ticket.stateProvenance', roster),
    // Mapped exactly as the list's card maps it, including the `=== null` arm:
    // the route throws rather than serving an assigned ticket without a claim, so
    // a null here cannot mean "assigned by somebody unknown" — it means nobody is
    // assigned (see `TicketRead.assignedProvenance`).
    assignedProvenance:
      record['assignedProvenance'] === null
        ? null
        : mapProvenance(record['assignedProvenance'], 'ticket.assignedProvenance', roster),
    // The audience MODE, finally read. `record['ticket']` has been on this wire
    // since the endpoint existed and nothing on this side looked at it; the
    // sheet's "Who can see this" section was the surface that needed it.
    visibility: mapTicketVisibility(record['ticket'], 'ticket'),
    parent: mapParentRef(record['parent'], 'ticket.parent'),
    rollup: mapRollup(record['rollup'], 'ticket.rollup'),
    // The key, and the `=== null` arm is the DISCRIMINATOR rather than a
    // convenience: the route answers `null` for a ticket whose number falls
    // outside the snapshot the number is derived from, and `asString` throws on
    // `undefined` — so a server that simply stopped sending the field refuses
    // here instead of arriving as the one absence that has a meaning.
    //
    // ⚠ Do NOT relax this to `record['key'] === undefined ? null : ...`. That
    // reads the same on every fixture and reverses the rule: "this read could
    // not compose a key" and "this producer forgot to send one" would become
    // one value, which is precisely the collapse `TicketRead.visibility` above
    // argues against.
    key: record['key'] === null ? null : asString(record['key'], 'ticket.key'),
    // The grandparent — `mapParentRef` UNCHANGED, because the route serves the
    // same three answers the parent does and drops only the `proj_visibility`
    // row that mapper never read anyway.
    epic: mapParentRef(record['epic'], 'ticket.epic'),
  };
}

/**
 * `GET /v1/search` → `SearchHit[]`. **THIS MAPPER USED TO REFUSE, and the
 * refusal is closed by the owner's ruling of 2026-09-19 — _change the query so
 * `matchedIn` is derivable_ — not by this client deciding to guess.**
 *
 * ## What it refused over, kept because the reasoning is still the rule
 *
 * The old text, verbatim: *"`ticketId`, `projectId` and `title` are all on
 * `hit.card` and are adaptable; the wrapper is adaptable. `matchedIn` is the
 * whole of it — and a hit that claimed `matchedIn: 'title'` because that is the
 * commonest case would be this client inventing the answer to the one question
 * the field asks."*
 *
 * **That reasoning has not been repealed, it has been SATISFIED.** The route now
 * derives `matchedIn` from three per-column match predicates
 * (`routes/search.ts`), so the value arrives from the server that knows rather
 * than from a default chosen here — and this mapper still REFUSES anything that
 * is not one of the three words, because a fourth spelling would be a wire
 * change this client has not agreed to read.
 *
 * ## The absence that used to be listed here
 *
 * `MAP_SEARCH_HITS_ABSENCES` recorded `SearchHit.matchedIn` as unavailable, and
 * named its cause precisely: *"proj_search stores title, description and
 * comments as three independently weighted columns and routes/search.ts
 * concatenates them before one ts_headline, so which one matched is destroyed in
 * the query rather than absent from the store."* **That was a QUERY defect, not
 * a missing capability — the distinction has been in the data all along — and it
 * is fixed in the query, which is why the entry is gone rather than emptied.**
 */
export function mapSearchHits(raw: unknown): SearchHit[] {
  const record = asRecord(raw, 'search');
  return asArray(record['hits'], 'search.hits').map((hit, index) => {
    const path = `search.hits[${index}]`;
    const entry = asRecord(hit, path);
    const card = asRecord(entry['card'], `${path}.card`);
    return {
      ticketId: asString(card['ticketId'], `${path}.card.ticketId`),
      projectId: asString(card['projectId'], `${path}.card.projectId`),
      title: asString(card['title'], `${path}.card.title`),
      snippet: asString(entry['snippet'], `${path}.snippet`),
      matchedIn: matchedInOf(entry['matchedIn'], `${path}.matchedIn`),
      key: card['key'] === null ? null : asString(card['key'], `${path}.card.key`),
    };
  });
}

/**
 * The note half of a search answer (notes series, Plan 3 of 6, spec §7.7).
 *
 * ## `mode` is a PARAMETER, and it is what adds `source`
 *
 * The server sends no `source` on a note hit: the mode is the request's own
 * parameter, so a per-row copy would be the caller's word echoed back. This
 * mapper is given the mode it asked for and stamps it on every row, which is
 * what lets the merged list (spec §7.8) label a result "spelling" or "meaning"
 * without asking which call it came out of.
 *
 * ## `corrected` is MODE-DEPENDENT, and that is the server's rule
 *
 * Correction is a lexical idea: `mode=meaning` never sends the field, and this
 * mapper returns `undefined` for it rather than `[]` — because the two are
 * different facts ("nothing was corrected" against "correction does not apply
 * here"), and the hook that drives the screen is a lexical call by then anyway.
 *
 * ## A row missing `noteId` REFUSES
 *
 * The same standard `mapNoteSummaries` holds: `noteId` is the hit's identity and
 * the key the merge rule de-duplicates on, so defaulting it to `''` would merge
 * every malformed row into one.
 */
export function mapNoteSearchHits(
  raw: unknown,
  mode: 'lexical' | 'meaning',
): { notes: NoteSearchHit[]; corrected?: string[] } {
  const record = asRecord(raw, 'search');
  const notes = asArray(record['notes'], 'search.notes').map((hit, index) => {
    const path = `search.notes[${index}]`;
    const entry = asRecord(hit, path);
    const scopeMode = asString(entry['scopeMode'], `${path}.scopeMode`);
    if (!(NOTE_SCOPE_MODES as readonly string[]).includes(scopeMode)) {
      throw new MappingError(`${path}.scopeMode`, `one of ${NOTE_SCOPE_MODES.join(', ')}`);
    }
    return {
      noteId: asString(entry['noteId'], `${path}.noteId`),
      title: asString(entry['title'], `${path}.title`),
      snippet: asString(entry['snippet'], `${path}.snippet`),
      homeProjectId: asString(entry['homeProjectId'], `${path}.homeProjectId`),
      scopeMode: scopeMode as NoteScopeMode,
      attachedTicketKeys: asArray(entry['attachedTicketKeys'], `${path}.attachedTicketKeys`).map((key, keyIndex) =>
        asString(key, `${path}.attachedTicketKeys[${keyIndex}]`),
      ),
      authorId: asString(entry['authorId'], `${path}.authorId`),
      updatedAt: asString(entry['updatedAt'], `${path}.updatedAt`),
      source: mode,
    };
  });

  const correctedRaw = record['corrected'];
  if (correctedRaw === undefined) return { notes };
  const corrected = asArray(correctedRaw, 'search.corrected').map((word, index) =>
    asString(word, `search.corrected[${index}]`),
  );
  return { notes, corrected };
}

/** The three columns `matchedIn` may name, in the PRECEDENCE the route applies. */
const MATCHED_IN_VALUES = ['title', 'description', 'comment'] as const;

/**
 * `matchedIn`, refused if it is not one of the three.
 *
 * **A closed union is refused rather than coerced**: a server that sent a
 * fourth word would be answering a question this client did not ask, and
 * narrowing it to the nearest known value here is the invention the whole
 * refusal above exists to prevent. The parameter is `unknown` and NOT
 * `string | undefined`, so an absent key is `undefined` and refuses too.
 */
function matchedInOf(value: unknown, path: string): SearchHit['matchedIn'] {
  const text = asString(value, path);
  const found = MATCHED_IN_VALUES.find((candidate) => candidate === text);
  if (found === undefined) {
    throw new MappingError(path, `one of ${MATCHED_IN_VALUES.map((v) => `'${v}'`).join(' | ')}`);
  }
  return found;
}

/**
 * `GET /v1/me/work?workspaceId=` → `MyWorkView`. **This mapper used to REFUSE,
 * and all three facts it refused over are served now** (rulings P39 and P40,
 * this change set).
 *
 * The absence list is DELETED rather than emptied, for the reason this module
 * gives at `SERVING_GAPS`: an `Absence[]` with no entries is a refusal nobody
 * can read, and `client-contract.test.ts` throws on a list it cannot parse
 * precisely so that closing a gap forces the record to be removed instead of
 * hollowed out.
 *
 * ## What each of the three was, and what closed it
 *
 * - **`WorkItem.stateName`** said "cards carry `stateId` only, and the card
 *   names no workflow version to read the name from". True of the CARD and
 *   false of the ROUTE: `readMyWork` has selected `t.workflow_id,
 *   t.workflow_version` through `PROJ_TICKET_COLUMNS` all along, so only the
 *   by-version definition read was missing. It arrives as `stateNames`, a map
 *   beside the groups, keyed by `ticketId` because a state id is unique only
 *   within one workflow AND one version.
 * - **`ContestedClaim.title`** was on no contest row and derivable from no
 *   other route for a bare ticket id. `GET /v1/me/work` now joins it (ruling
 *   P40) and `GET /v1/contests` serves it too, both from `proj_tickets` and
 *   both gated by `canSee`.
 * - **`ContestedClaim.claim.serverTime`** did not exist and still does not.
 *   Ruling P39 did not find it — it removed the field: `ContestedClaim.claim`
 *   is a `ContestedClaimProvenance`, not a `ClaimProvenance`, and carries no
 *   `serverTime` member at all, because a refused claim never took effect.
 *
 * ## `inTransit` is `[]`, and it was never one of the absences
 *
 * `inTransit` is the replica's outbox. The web client is online-only (spec §5,
 * line 104), so it HAS no outbox and `[]` is the true answer — a structural
 * emptiness, not a degradation. `contested` was the opposite while it refused:
 * the rows exist in `proj_contested`, so `[]` there would have been a claim
 * about the world rather than a fact about this client. That distinction is why
 * the two were treated differently, and it is written here rather than left to
 * be inferred from an absence list that no longer exists.
 *
 * ## The GROUPS are flattened, and no information is lost
 *
 * The server groups by state CATEGORY (`{open, active, terminal}`) and
 * `MyWorkView` groups by claim STATUS (`assigned` / `inTransit` / `contested`).
 * All three server groups are this viewer's assigned work, so they concatenate
 * into `assigned` in the order the server emitted them, cards in `ticket_id`
 * order within each. Every card the server sent becomes exactly one item; the
 * category survives on `WorkItem.stateCategory`, so a client that wants the
 * server's buckets back can rebuild them without a second read.
 */
export function mapMyWork(raw: unknown, roster: ReadonlyMap<string, string>): MyWorkView {
  const record = asRecord(raw, 'myWork');
  const groups = asRecord(record['groups'], 'myWork.groups');
  const projectNames = asRecord(record['projectNames'], 'myWork.projectNames');
  const stateNames = asRecord(record['stateNames'], 'myWork.stateNames');

  const assigned: WorkItem[] = [];
  for (const key of ['open', 'active', 'terminal'] as const) {
    const cards = asArray(groups[key], `myWork.groups.${key}`);
    cards.forEach((card, index) => {
      assigned.push(
        mapWorkItem(card, `myWork.groups.${key}[${index}]`, roster, projectNames, stateNames),
      );
    });
  }

  const contested = asArray(record['contested'], 'myWork.contested').map((row, index) =>
    mapContestedClaim(row, `myWork.contested[${index}]`),
  );

  // Read off the wire and mapped through the SAME `mapWorkItem` as the groups —
  // a shared card is a `TicketCard` like any other, so it gets the same
  // `projectNames` miss-is-the-rule and `stateNames` miss-is-malformed
  // treatment. Sharing the mapper is what makes a guest's withheld project name
  // render id-only here for the same reason it does there, rather than by a
  // second rule that could drift from the first.
  const shared = asArray(record['shared'], 'myWork.shared').map((card, index) =>
    mapWorkItem(card, `myWork.shared[${index}]`, roster, projectNames, stateNames),
  );

  // `inTransit` is NOT read off the wire. An online-only shell has no outbox,
  // and a `pending` or an `inTransit` on the body would be the server asserting
  // something only the client can know. `shared` is the opposite case and that
  // is why it IS read: an audience is a server fact.
  return { assigned, inTransit: [], contested, shared };
}

/**
 * One card of `MyWorkResponse.groups` → `WorkItem`.
 *
 * The two sibling MAPS are looked up here rather than merged into the card by
 * the caller, so the absence of an entry keeps its own meaning at the point it
 * is read:
 *
 * - **`projectNames`** — a MISS is the rule applying (rulings P32/P38: this
 *   viewer may not be told that project's name), so it becomes `null` and the
 *   item renders id-only. That is why `WorkItem.projectName` is nullable.
 * - **`stateNames`** — a miss is NOT a rule. The route documents the map as
 *   TOTAL over the cards in `groups` and throws rather than omitting an entry,
 *   and `WorkItem.stateName` is required, so a missing key here is a malformed
 *   body and `asString` refuses it. Falling back to the `stateId` would put a
 *   slug where a name goes, which is the exact substitution `assembleListCards`
 *   throws to avoid one layer down.
 */
function mapWorkItem(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string>,
  projectNames: Record<string, unknown>,
  stateNames: Record<string, unknown>,
): WorkItem {
  const record = asRecord(raw, path);
  const ticketId = asString(record['ticketId'], `${path}.ticketId`);
  const projectId = asString(record['projectId'], `${path}.projectId`);
  const name = projectNames[projectId];
  return {
    ticketId,
    workspaceId: asString(record['workspaceId'], `${path}.workspaceId`),
    projectId,
    projectName: name === undefined ? null : asString(name, `myWork.projectNames.${projectId}`),
    title: asString(record['title'], `${path}.title`),
    stateId: asString(record['stateId'], `${path}.stateId`),
    stateName: asString(stateNames[ticketId], `myWork.stateNames.${ticketId}`),
    stateCategory: asStateCategory(record['stateCategory'], `${path}.stateCategory`),
    stateProvenance: mapProvenance(record['stateProvenance'], `${path}.stateProvenance`, roster),
    dueDate: mapDueDate(record['dueDate'], `${path}.dueDate`, roster),
  };
}

/**
 * One row of `MyWorkResponse.contested` → `ContestedClaim`.
 *
 * **No roster, and no `actorName`.** `ContestedClaimProvenance` is not a
 * `ClaimProvenance` (ruling P39): nothing resolves a refused claim's actor
 * through the member roster, and the type carries no `actorName` member to fill.
 *
 * **No `serverTime`, and there is nothing to look for.** The claim was refused
 * at the door, so it was never committed and never stamped. `contestedAt` is the
 * CONTEST event's own instant, read from the key of that name and served under
 * it — copying it into a `serverTime` would attribute one event's instant to
 * another, which is the move ruling P36 refused as its option 3.
 *
 * `title` is `string | null` on both sides and the null is passed through
 * unchanged: it means "this viewer may no longer see the ticket" (P40's
 * constraint b), and an absent key means a malformed body, which `asString`
 * refuses.
 */
function mapContestedClaim(raw: unknown, path: string): ContestedClaim {
  const record = asRecord(raw, path);
  const claim = asRecord(record['claim'], `${path}.claim`);
  return {
    ticketId: asString(record['ticketId'], `${path}.ticketId`),
    title: record['title'] === null ? null : asString(record['title'], `${path}.title`),
    rule: asString(record['rule'], `${path}.rule`),
    reason: asString(record['reason'], `${path}.reason`),
    claim: {
      actorId: asString(claim['actorId'], `${path}.claim.actorId`),
      clientTime: asString(claim['clientTime'], `${path}.claim.clientTime`),
      contestedAt: asString(claim['contestedAt'], `${path}.claim.contestedAt`),
    },
  };
}

/**
 * `GET /v1/workspaces/:ws/attention` + `GET /v1/contests` → `AttentionItem[]`.
 * **This mapper used to REFUSE over one field and that field is served now.**
 *
 * ## What it refused over, and why the answer was a JOIN rather than a route
 *
 * `AttentionKind` includes `'contested'`, the strip's contract is "what needs
 * attention now", and a strip that silently cannot contain a contested claim is
 * worse than no strip because the user reads its emptiness as an answer. The
 * three shipped kinds always mapped cleanly; the fourth stopped at
 * `AttentionItem.title`, which is required and was on no contest row.
 *
 * `GET /v1/contests` now serves both the ticket's `title` and its `projectId`
 * from one tenancy-scoped join, so the fourth kind is a client-side join — the
 * same move `getBoard` makes for the roster — and the attention ROUTE still owes
 * nothing.
 *
 * ## The two reads answer the SAME SET, which is what makes the join sound
 *
 * This was the caveat that used to make `projectId` "a second join with a
 * caveat": `GET /v1/workspaces/:ws/tickets` resolves its set through
 * `listVisibleTickets` while `/v1/contests` filters through `canSee`, and
 * nothing asserted the two answer the same set. That second route is no longer
 * involved — `projectId` comes off the contest row itself — so the only set
 * question left is whether the contests belong on THIS strip.
 *
 * They do, measured rather than assumed. `routes/attention.ts` scopes its sweep
 * by `visibleTicketsWhere` and NOTHING else — never by assignment — so the strip
 * is "everything in this workspace this viewer can see that needs attention".
 * `/v1/contests?workspaceId=&open=true` is `canSee`-gated per row and answers
 * exactly that population. **This is the one place the strip and My Work
 * deliberately differ**: `MyWorkView.contested` is the viewer's OWN claims and
 * is served by `/v1/me/work` (ruling P40) because only the server knows who the
 * viewer is; the strip's contested items are every visible contest, because
 * that is what the other three kinds already are.
 *
 * ## `claim` is `null` for the fourth kind, and that is the type working
 *
 * `AttentionItem.claim` is `ClaimProvenance | null`. A contested claim has no
 * `ClaimProvenance` — no server instant was ever recorded for it (ruling P39) —
 * so the item carries `null` and loses its provenance line rather than becoming
 * unformable. That is exactly the difference from `ContestedClaim.claim`, which
 * is non-nullable and therefore needed a type of its own.
 */
export function mapAttention(
  raw: unknown,
  contests: unknown,
  roster: ReadonlyMap<string, string>,
): AttentionItem[] {
  const record = asRecord(raw, 'attention');
  const items = asArray(record['items'], 'attention.items').map((item, index) =>
    mapAttentionItem(item, `attention.items[${index}]`, roster),
  );

  const rows = asArray(asRecord(contests, 'contests')['contests'], 'contests.contests');
  rows.forEach((row, index) => {
    const path = `contests.contests[${index}]`;
    const contest = asRecord(row, path);
    items.push({
      kind: 'contested',
      ticketId: asString(contest['ticketId'], `${path}.ticketId`),
      projectId: asString(contest['projectId'], `${path}.projectId`),
      title: asString(contest['title'], `${path}.title`),
      // The rule that refused it and why, which is what the strip is for. The
      // contest row's own `reason`, never a sentence composed here: the server
      // writes the reason and this client does not paraphrase it.
      reason: asString(contest['reason'], `${path}.reason`),
      claim: null,
    });
  });
  return items;
}

/**
 * The attention response's `settings` sibling → the client's `WorkspaceSettings`.
 *
 * ## Why this mapper exists, and why it is not `mapAttention`'s business
 *
 * `AttentionResponse` has carried `settings: WorkspaceSettings` on the wire since
 * Plan 5, and `mapAttention` reads `items` and drops it — correctly, because the
 * strip renders reasons the SERVER already composed from those thresholds and the
 * client has no use for the numbers. The `/settings` Workspace tab (second wave,
 * Task 6) does need them, and there was no second reader.
 *
 * **This is the mapper the task plan named and the tree did not have.** The plan
 * said to extend an existing `mapWorkspaceSettings`; there was none anywhere
 * (`/usr/bin/git log -S'mapWorkspaceSettings' --all` finds only the plan commit
 * that wrote the sentence). Recorded as a deviation, not smoothed over — see
 * `EXEC-2026-09-18-t6-settings-read.md`.
 *
 * ## `autoCloseAfterDays` is nullable, and that is asserted rather than assumed
 *
 * `null` is a legal VALUE here — "auto-close is off" — and the one thing this
 * mapper must not do is normalise it into `undefined` or drop the key, because
 * every consumer downstream distinguishes "off" from "this build does not know
 * the field". Both arms are checked explicitly: a `null` passes through, and
 * anything that is neither `null` nor a number (a string from a sloppy
 * serializer, an object, a boolean) is refused rather than coerced.
 *
 * The other two knobs are plain required numbers, so a missing one is a body
 * this client does not understand. Substituting a default is exactly the mistake
 * this screen exists to avoid: `/settings` shows what was CHOSEN, and a mapper
 * that answered 7 for an absent `staleDays` would render a threshold with nobody
 * behind it.
 */
export function mapWorkspaceSettings(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string> = new Map(),
): WorkspaceSettings {
  const record = asRecord(raw, path);
  const autoClose = record['autoCloseAfterDays'];
  if (autoClose !== null && typeof autoClose !== 'number') {
    throw new MappingError(`${path}.autoCloseAfterDays`, 'a number or null');
  }
  return {
    staleDays: asNumber(record['staleDays'], `${path}.staleDays`),
    dueSoonDays: asNumber(record['dueSoonDays'], `${path}.dueSoonDays`),
    autoCloseAfterDays: autoClose,
    // `provenance: null` is the server saying "nobody has ever claimed these"
    // — a fact, not an absence of data — so it is carried through as null
    // rather than replaced with an actor.
    provenance:
      record['provenance'] === null
        ? null
        : mapProvenance(record['provenance'], `${path}.provenance`, roster),
  };
}

/**
 * One of the three SHIPPED attention kinds → `AttentionItem`.
 *
 * Each server arm nests the whole `TicketCard` and adds its own evidence
 * fields; the client item is flat and carries the four facts the strip renders.
 * `reason` is the route's own sentence in every arm — it is composed server-side
 * from the workspace's thresholds (`staleDays`, `dueSoonDays`), which this
 * client does not hold, so re-composing it here would drift the moment a
 * setting changed.
 *
 * `claim` is where the arms differ, and the choice is the CLAIM THE ITEM IS
 * ABOUT rather than whichever provenance is nearest:
 *
 * - `blocked` and `stale` are both about the state the ticket is IN, so the
 *   claim is `card.stateProvenance` — who moved it there and when.
 * - `due-soon` is about the DUE DATE, so the claim is the due claim, not the
 *   state's. Using `stateProvenance` there would attribute a deadline to
 *   whoever last transitioned the ticket.
 *
 * A fourth `kind` on the wire is refused rather than dropped: the client union
 * has four members and the server three, so an unknown arm is a server this
 * client does not understand, and silently skipping it would shorten a strip
 * whose emptiness the user reads as an answer.
 */
function mapAttentionItem(
  raw: unknown,
  path: string,
  roster: ReadonlyMap<string, string>,
): AttentionItem {
  const record = asRecord(raw, path);
  const kind = asString(record['kind'], `${path}.kind`);
  const card = asRecord(record['card'], `${path}.card`);
  const base = {
    ticketId: asString(card['ticketId'], `${path}.card.ticketId`),
    projectId: asString(card['projectId'], `${path}.card.projectId`),
    title: asString(card['title'], `${path}.card.title`),
    reason: asString(record['reason'], `${path}.reason`),
  };
  if (kind === 'blocked' || kind === 'stale') {
    return {
      ...base,
      kind,
      claim: mapProvenance(card['stateProvenance'], `${path}.card.stateProvenance`, roster),
    };
  }
  if (kind === 'due-soon') {
    return {
      ...base,
      kind,
      claim: mapProvenance(record['due'], `${path}.due`, roster),
    };
  }
  throw new MappingError(`${path}.kind`, "one of blocked/stale/due-soon");
}

/**
 * Every refusal in this module, so a caller can enumerate the register.
 *
 * **Four methods have left this register and none was hollowed out.**
 * `getTickets` and `getTicket` went under ruling P25 clause 1; `getMyWorkspaces`
 * went with the HELD pair under P32/P38; `getMyWork` and `getAttention` go in
 * this change set under P39 and P40. Every entry is DELETED rather than mapped
 * to `[]`: an empty absence list is a refusal nobody can read,
 * `client-contract.test.ts` throws on a `const` it cannot parse rather than
 * passing over one it can parse as empty, and `mappers.test.ts`'s register case
 * asserts the exact key set — so hollowing an entry out would leave a method
 * claiming to refuse over nothing.
 *
 * **`search` is the last one, and it is the only DATA gap of the six.** Every
 * other refusal was a field some route could serve once somebody looked; this
 * one is `routes/search.ts` destroying which column matched inside the query, so
 * no join closes it and no ruling can. `SearchHit.matchedIn` is the field.
 */
export const SERVING_GAPS: Readonly<Record<string, readonly Absence[]>> = {
  // EMPTY SINCE 2026-09-19, and the emptiness is the record. `search` was the
  // last entry: `mapSearchHits` refused over `matchedIn`, the owner ruled the
  // QUERY must derive it, and the route now does. **An entry claiming a method
  // refuses ALWAYS is false the moment it maps** — so it is deleted rather than
  // emptied, and the reasoning it carried lives on the mapper's own docblock,
  // where the next reader of that method will meet it.
  //
  // This record being empty is NOT a claim that no read is missing: it means no
  // mapper in this file refuses outright. A refusal that MOVES has its own home
  // (`replica-data-source.ts`), and a view with nothing to render says so where
  // it renders rather than here.
};

/**
 * The note mappers (notes series, Plan 1 of 6, spec §6.4).
 *
 * ## Why `scope` is validated against the domain's constant rather than trusted
 *
 * `NOTE_SCOPE_MODES` is the ONE list of the five modes (`packages/domain/src/note-state.ts`)
 * and it is imported rather than re-spelled. A mapper that accepted any string
 * would put an unknown mode into `NoteScope`, whose union makes the switch arms
 * in every later view total — so the sixth mode a future plan adds would fall
 * out of a view's switch as "not readable" instead of failing to compile. The
 * refusal is `MappingError` at the path, which names the row.
 *
 * ## `body` is passed through as `unknown`, NEVER stringified
 *
 * It is a ProseMirror document the editor owns. `JSON.stringify` here would hand
 * the editor a STRING where it expects a doc, and the failure would show up as
 * an editor rendering nothing rather than as a mapping error — so the shape is
 * left alone and the mutation that stringifies it is killed by case 18.037.
 *
 * ## `attachedTickets` is mapped field by field
 *
 * `ticketId`, `projectId`, `key` and `title` are each read as required strings.
 * A row missing one is a server change this mapper has not caught up with, and
 * defaulting `key` to `''` would render a chip with no key rather than report
 * it. `projectId` was added additively (notes series, Plan 6 of 7) so the
 * byline can build the canonical `ticketSheetPath`.
 */
function noteScopeOf(raw: unknown, path: string): NoteScope {
  const record = asRecord(raw, path);
  const mode = record['mode'];
  if (typeof mode !== 'string' || !(NOTE_SCOPE_MODES as readonly string[]).includes(mode)) {
    throw new MappingError(`${path}.mode`, `one of ${NOTE_SCOPE_MODES.join(', ')}`);
  }
  // `userIds` is read ONLY for `explicit`, and that is the server's own rule
  // (`proj_notes.scope_user_ids` is `'{}'` for every other mode). Reading it
  // unconditionally would produce `{ mode: 'workspace', userIds: [] }`, which is
  // not a member of the `NoteScope` union at all.
  if (mode === 'explicit') {
    const userIds = asArray(record['userIds'], `${path}.userIds`).map((entry, index) =>
      asString(entry, `${path}.userIds[${index}]`),
    );
    return { mode, userIds };
  }
  // `Exclude<…, 'explicit'>` and not a bare `NoteScopeMode`: at this line the
  // mode is known NOT to be `explicit` (that arm returned above), and
  // `{ mode: 'explicit' }` with no `userIds` is not a member of `NoteScope`. The
  // narrower cast is what makes the union's own shape carry the guarantee
  // instead of a comment.
  return { mode: mode as Exclude<NoteScopeMode, 'explicit'> };
}

function noteSummaryOf(row: Record<string, unknown>, path: string): NoteSummary {
  return {
    noteId: asString(row['noteId'], `${path}.noteId`),
    workspaceId: asString(row['workspaceId'], `${path}.workspaceId`),
    homeProjectId: asString(row['homeProjectId'], `${path}.homeProjectId`),
    authorId: asString(row['authorId'], `${path}.authorId`),
    title: asString(row['title'], `${path}.title`),
    scope: noteScopeOf(row['scope'], `${path}.scope`),
    attachedTickets: asArray(row['attachedTickets'], `${path}.attachedTickets`).map((entry, index) => {
      const ticketPath = `${path}.attachedTickets[${index}]`;
      const ticket = asRecord(entry, ticketPath);
      return {
        ticketId: asString(ticket['ticketId'], `${ticketPath}.ticketId`),
        projectId: asString(ticket['projectId'], `${ticketPath}.projectId`),
        key: asString(ticket['key'], `${ticketPath}.key`),
        title: asString(ticket['title'], `${ticketPath}.title`),
      };
    }),
    deleted: row['deleted'] === true,
    createdAt: asString(row['createdAt'], `${path}.createdAt`),
    updatedAt: asString(row['updatedAt'], `${path}.updatedAt`),
  };
}

/** `{ notes: [...] }` — the list reads and the per-ticket read. */
export function mapNoteSummaries(raw: unknown): NoteSummary[] {
  const record = asRecord(raw, 'notes');
  return asArray(record['notes'], 'notes.notes').map((entry, index) => {
    const path = `notes[${index}]`;
    return noteSummaryOf(asRecord(entry, path), path);
  });
}

/**
 * `{ note: {...} }` — one note with its body.
 *
 * `schemaVersion` is read as a NUMBER through `asNumber` rather than coerced,
 * because the editor's migration path keys off it and `Number('2')` would accept
 * a string the server never sends — hiding a wire change behind a coercion.
 */
export function mapNoteDetail(raw: unknown): NoteDetail {
  const record = asRecord(raw, 'note');
  const row = asRecord(record['note'], 'note.note');
  return {
    ...noteSummaryOf(row, 'note.note'),
    // NOT stringified, not parsed, not inspected: see this section's docblock.
    body: row['body'],
    schemaVersion: asNumber(row['schemaVersion'], 'note.note.schemaVersion'),
  };
}

/** `{ comments: [...] }` — a note's thread. No files: Plan 4 of the series adds them. */
export function mapNoteComments(raw: unknown): NoteComment[] {
  const record = asRecord(raw, 'comments');
  return asArray(record['comments'], 'comments.comments').map((entry, index) => {
    const path = `comments.comments[${index}]`;
    const row = asRecord(entry, path);
    return {
      commentId: asString(row['commentId'], `${path}.commentId`),
      authorId: asString(row['authorId'], `${path}.authorId`),
      body: row['body'],
      recordedAt: asString(row['recordedAt'], `${path}.recordedAt`),
    };
  });
}

/** `{ versions: [...] }` — pointers, not snapshots. The body is fetched per version. */
export function mapNoteVersions(raw: unknown): NoteVersion[] {
  const record = asRecord(raw, 'versions');
  return asArray(record['versions'], 'versions.versions').map((entry, index) => {
    const path = `versions.versions[${index}]`;
    const row = asRecord(entry, path);
    return {
      eventId: asString(row['eventId'], `${path}.eventId`),
      authorId: asString(row['authorId'], `${path}.authorId`),
      recordedAt: asString(row['recordedAt'], `${path}.recordedAt`),
      seq: asNumber(row['seq'], `${path}.seq`),
    };
  });
}

/**
 * `{ body }` — one version's document, or `null` when the body IS null.
 *
 * The one mapper here that returns a bare document rather than a view model,
 * because that is what the method's contract says: a version is fetched to be
 * shown read-only, and Plan 1 has no component for it (`data-source.ts`'s note
 * group says the same about `NoteComment`). `asRecord` is applied to the
 * ENVELOPE and never to the body — the body is a ProseMirror document whose
 * shape this file has no business asserting.
 *
 * `?? null` rather than returning the raw value: the server sends `null` for a
 * `note.created` written without a body (the EMPTY document is the reducer's
 * fallback, not something any event recorded), and a mapper that returned
 * `undefined` for it would give the caller two absence values where the
 * signature declares one.
 */
export function mapNoteVersionBody(raw: unknown): unknown {
  const record = asRecord(raw, 'version');
  return record['body'] ?? null;
}

const DELETED_ITEM_KINDS: readonly string[] = ['workspace', 'project', 'ticket', 'note'];

function asDeletedItemKind(value: unknown, path: string): DeletedItem['kind'] {
  const text = asString(value, path);
  if (!DELETED_ITEM_KINDS.includes(text)) throw new MappingError(path, `one of ${DELETED_ITEM_KINDS.join('/')}`);
  return text as DeletedItem['kind'];
}

/**
 * `GET /v1/me/deleted-items` → `DeletedItem[]` (trash series, Plan 1 Task 8;
 * spec §6.3's read). Every field is REQUIRED on the wire, `purgeDueAt`
 * included — a row missing it is a `MappingError` (case 19.070) rather than a
 * default to `null`, the same `WorkspaceRef.archived` discipline: an omitted
 * key is a route that did not answer this question, not a claim about the
 * item. `projectId`/`projectName`/`purgeMarkedAt`/`purgeDueAt` are the
 * exception WITHIN "required" — the key must be present, but `null` is one of
 * the two honest values it may hold (`asStringOrNull`).
 */
export function mapDeletedItems(raw: unknown): DeletedItem[] {
  const record = asRecord(raw, 'deleted-items');
  return asArray(record['items'], 'deleted-items.items').map((entry, index) => {
    const path = `deleted-items.items[${index}]`;
    const item = asRecord(entry, path);
    return {
      kind: asDeletedItemKind(item['kind'], `${path}.kind`),
      id: asString(item['id'], `${path}.id`),
      workspaceId: asString(item['workspaceId'], `${path}.workspaceId`),
      workspaceName: asString(item['workspaceName'], `${path}.workspaceName`),
      projectId: asStringOrNull(item, 'projectId', `${path}.projectId`),
      projectName: asStringOrNull(item, 'projectName', `${path}.projectName`),
      label: asString(item['label'], `${path}.label`),
      deletedBy: asString(item['deletedBy'], `${path}.deletedBy`),
      deletedAt: asString(item['deletedAt'], `${path}.deletedAt`),
      purgeMarkedAt: asStringOrNull(item, 'purgeMarkedAt', `${path}.purgeMarkedAt`),
      purgeDueAt: asStringOrNull(item, 'purgeDueAt', `${path}.purgeDueAt`),
      containedCount: asNumber(item['containedCount'], `${path}.containedCount`),
    };
  });
}
