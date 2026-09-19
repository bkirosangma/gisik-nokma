import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, serverStreamFrameSchema, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { createStreamHub } from '../../src/stream/hub.js';
import { buildTestApp } from '../helpers/app.js';
// THE ONLY IMPORT IN THIS FILE THAT EXECUTES CLIENT CODE. Everything else here
// reads `mappers.ts` as text or asserts key sets on a body, which is how a
// client/server disagreement about a key's NAME survived every suite. The
// `@gisik-nokma/app-core` devDependency this needs landed with #126.
// The `./online` SUBPATH, not the package root. That subpath exists because
// `no-http-in-views.test.ts` enforces a seam between views and HTTP code, and
// the mappers live behind it — so this import uses the door the package already
// provides instead of widening its root surface for a test.
import { mapListPage, mapTicketRead } from '@gisik-nokma/app-core/online';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { fakeSocket } from '../helpers/stream-socket.js';

/**
 * Step 10, Task B — **the divergences between the shipped `/v1` surface and
 * Plan 6's client `DataSource`, pinned so a later reconciliation cannot be
 * silent.**
 *
 * ## This file does not try to make the client type satisfied
 *
 * The shapes disagree, and a suite that asserted the CLIENT's shape would
 * simply be red — it would report Plan 6's unwritten adapter as a server
 * defect, every run, until someone deleted it. So each case below asserts the
 * REAL body verbatim and then pins the disagreement as a named
 * negative-with-positive-control on the specific field:
 *
 *     expect(card).not.toHaveProperty('assignee');   // the client reads card.assignee.name
 *     expect(card).toHaveProperty('assigneeId');     // control, same run: what IS there
 *
 * Green today; RED the day the SERVER moves — every case here reads a real
 * `/v1` body — and red the day the CLIENT moves on the two divergences whose
 * client half is read out of `app-core`'s source (below). That hands the
 * decision to Plan 6 instead of hiding it in a type error nobody compiles.
 *
 * ## Nothing is IMPORTED from `@gisik-nokma/app-core`; two things are READ
 *
 * The refusal to import is deliberate, and not a convenience. A by-package-name
 * import resolves through `./dist`, so this file's failures would depend on
 * build order — a stale `dist` would make a pinned divergence pass or fail for
 * reasons that have nothing to do with either side's source.
 *
 * But a client half encoded ONLY as a literal this file types is a pin on
 * nothing: it can change only when somebody edits this file, so a
 * reconciliation landing in `app-core` leaves every such line green. Measured,
 * not argued, and reproduced here: with the two lists typed as literals,
 * applying BOTH reconciliations to `app-core` at once — `scope-revoked` added
 * to `ServerStreamFrame`, `uncategorizedChildren` added to `RollupToViewer` — left
 * this file at 15 passed, 0 failed. The divergences the file exists to pin were
 * gone and the suite did not notice.
 *
 * So the two cases that TURN on the client's shape — `RollupToViewer`'s three
 * fields and `ServerStreamFrame`'s union members — derive that shape from
 * `packages/app-core/src/*.ts` with `readFileSync` on a relative path
 * (`clientTypeFields`, `clientUnionTags`). That reads the checked-in source
 * text, never `./dist`, so the build-order rationale above survives intact while
 * the pin becomes real. Each is asserted with a whole-array `toEqual`, which is
 * simultaneously the positive control and the line that fires when either side
 * moves.
 *
 * ## `ServerStreamFrame`'s two divergences were RECONCILED (Plan 6 Task 8); the case stayed
 *
 * The mechanism above did its job: adding `scope-revoked` to `ServerStreamFrame` turned
 * the stream case red, and the client's event member moved from `EventEnvelope`
 * to `LedgerEvent` in the same change. Both stream cases below were rewritten to
 * pin the RECONCILED state instead of being deleted — a divergence that closed is
 * a divergence that can silently re-open, and the derived-from-source machinery
 * that caught the reconciliation is exactly what catches a regression. What each
 * asserts is now AGREEMENT between the two unions rather than disagreement, and
 * each still carries its positive control.
 *
 * **`error.code` is the one stream divergence still open**: the client types it
 * `string` where `ServerStreamFrame` types it `StreamErrorCode`, so a misspelled
 * code is a runtime surprise on the client rather than a compile error. It is not
 * pinned here — no case in this file ever asserted it — and it is named rather
 * than silently carried.
 *
 * The REMAINING client expectations are quoted in comments naming the line they
 * came from (`packages/app-core/src/view-types.ts`, `.../data-source.ts`).
 * Those quotations are documentation, not pins: what runs beneath each of them
 * is an assertion on the real server body, which is the half those cases are
 * about.
 *
 * ## The world is built through the shipped doors
 *
 * Same reason as `real-door-round-trip.test.ts`: a divergence measured against
 * a hand-seeded body is a claim about the seeder. Everything here arrived
 * through `signInWithPhone`, `POST /v1/workspaces` and `POST /v1/events`.
 *
 * ## The taxonomy the cases are sorted by
 *
 * Three kinds of gap, and they have different owners:
 *
 * - **Signature gap** — the client method cannot even FORM the request. All
 *   three of them (`getMyWork`, `getPreferences`, `putPreferences`) are now
 *   RECONCILED (Plan 6 Task 7, ruling P25 clause 2): the client's signatures
 *   grew the `workspaceId` its routes read before the door, and the first
 *   describe below pins the agreement — the parameter list read out of
 *   `data-source.ts`, beside the 400/200 pair that is the reason it had to move.
 * - **Serving gap** — the server HOLDS the fact and does not put it on the
 *   wire. Fixed by one route change. `workflowVersion` was the worked example
 *   and is RECONCILED (Plan 6 Task 11); the others — `ListRow`'s five,
 *   `TicketRead`'s three, `WorkspaceRef.projects`, `WorkItem.projectName` and
 *   `stateName` — are HELD, three of them because serving the fact is a
 *   VISIBILITY decision under Plan 4 rather than a field addition.
 * - **Data gap** — the server does not have the fact at all
 *   (`SearchHit.matchedIn`: `routes/search.ts` destroys which column matched
 *   inside the query; `BoardCard.assignee.name`, which is why Task 7 joins the
 *   members route client-side instead).
 *
 * Sorting them is the difference between a morning's work and a design round.
 *
 * ## The refusals are cross-checked HERE, and that is new (Plan 6 Task 7)
 *
 * **⚠ CORRECTED 2026-09-20: this section opened *"The online `DataSource` refuses
 * six `DataSourceQuery` methods rather than returning a view built from facts the
 * server did not send"*, and the count is now ZERO.** It fell 6 → 4 (ruling P25
 * clause 1, `c86c4b5c`, 2026-09-06) → 3 (P32/P38) → 1 (P39/P40) → 0 when `search`
 * was served on 2026-09-19, so `SERVING_GAPS` is empty and every absence list this
 * mechanism read has been deleted — `expectStillUnserved` below now has NO
 * callers. It is kept, definition and all, because it is the instrument that made
 * each closure go red rather than outlive the thing it described: while a refusal
 * existed it ENUMERATED its absences as data in
 * `packages/app-core/src/online/mappers.ts`, and every `wireKey` a refusal named
 * was checked against the real `/v1` body in the same run. 7.209 below is the
 * surviving half and asserts the same end from the other side.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let ingest: IngestService;
/** The `claim.contested` row 7.208 reads back out of `GET /v1/contests`. */
let contestedOriginalId = '';

let owner: { userId: string; headers: { authorization: string } };
let workspaceId: string;
let projectId: string;
let ticketId: string;
/** A child of `ticketId`, so the parent's rollup is non-NULL and its fourth field is reachable. */
let childTicketId: string;
/** Granted then revoked, so the stream really has a `scope-revoked` to emit. */
let exMember: { userId: string; headers: { authorization: string } };

/**
 * The EXCLUSION fixture for 7.212: a member who may see a child and NOT its
 * parent. Its own pair of tickets rather than the world's, so that making a
 * parent unreachable cannot quietly change what every other case in this file
 * is measuring — and seeded in `beforeAll` with everything else, so no case
 * appends to the ledger while a later one is reading it.
 */
let restricted: { userId: string; headers: { authorization: string } };
let restrictedParentId = '';
let restrictedChildId = '';

let phoneCounter = 0;

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190008${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

async function post(
  headers: { authorization: string },
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
): Promise<void> {
  const submitted: SubmittedEvent = {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date().toISOString(),
    ...event,
  };
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers,
    payload: { events: [submitted] },
  });
  const body = res.json() as { results?: Array<{ status?: string; reason?: string }> };
  expect(body.results?.[0]?.status, JSON.stringify(body.results?.[0])).toBe('committed');
}

/**
 * `packages/app-core/src`, reached as a RELATIVE PATH and read as text.
 *
 * Not the package import the docblock refuses, and the distinction is the whole
 * reason this works: `readFileSync` opens the checked-in `.ts`, so no `dist` —
 * fresh or stale — can decide what the two derived pins below see. Nothing
 * under `apps/server/src` imports `app-core` either, so there is no other route
 * by which a build artefact could reach this file.
 */
const APP_CORE_SRC = fileURLToPath(new URL('../../../../packages/app-core/src/', import.meta.url));
const DOMAIN_SRC = fileURLToPath(new URL('../../../../packages/domain/src/', import.meta.url));

/**
 * One client module's source text — or, since closure 3, the DOMAIN module that
 * now holds the stream frame union. `data-source.ts` used to declare its own
 * `StreamItem` beside the domain's `ServerStreamFrame`, and keeping the two in
 * step is exactly what this file existed to police; closure 3 deleted the
 * duplicate, so the union is read where it now lives.
 */
function clientSource(file: 'view-types.ts' | 'data-source.ts' | 'stream-frames.ts'): string {
  const root = file === 'stream-frames.ts' ? DOMAIN_SRC : APP_CORE_SRC;
  const text = readFileSync(`${root}${file}`, 'utf8');
  // The read found the real module and not an empty or moved file. Every claim
  // derived below is a claim about THIS text, so the text has to be here.
  expect(text, file).toContain('export type');
  return text;
}

/**
 * The field names of `export type <name> = { ... }` in a client module, in
 * source order.
 *
 * Throws rather than returning `[]` when the block is not found: an empty list
 * satisfies every `not.toContain` in this file, which is the one way a derived
 * pin could pass by being broken.
 */
function clientTypeFields(file: 'view-types.ts' | 'data-source.ts' | 'stream-frames.ts', name: string): string[] {
  const block = new RegExp(`export type ${name} = \\{([^{}]*)\\}`).exec(clientSource(file));
  if (block === null) throw new Error(`${file}: no \`export type ${name} = { ... }\` block`);
  return [...(block[1] ?? '').matchAll(/^\s*(\w+)\??:/gm)].map(([, field]) => field ?? '');
}

/**
 * The `type: '...'` discriminants of a union `export type <name> = | ... ;` in
 * a client module. Same fail-loud contract as `clientTypeFields`.
 */
function clientUnionTags(file: 'view-types.ts' | 'data-source.ts' | 'stream-frames.ts', name: string): string[] {
  const decl = new RegExp(`export type ${name} =([\\s\\S]*?);\\s*$`, 'm').exec(clientSource(file));
  if (decl === null) throw new Error(`${file}: no \`export type ${name} = ... ;\` declaration`);
  return [...(decl[1] ?? '').matchAll(/type: '([^']+)'/g)].map(([, tag]) => tag ?? '');
}

/**
 * The type name a union member's field is declared with, e.g. `LedgerEvent` for
 * `ServerStreamFrame`'s `{ type: 'event'; envelope: LedgerEvent }`. Same fail-loud
 * contract as the two above: a rename that this regex cannot find throws, rather
 * than returning something a `not.toBe` would happily accept.
 */
function clientUnionMemberFieldType(
  file: 'view-types.ts' | 'data-source.ts' | 'stream-frames.ts',
  name: string,
  tag: string,
  field: string,
): string {
  const decl = new RegExp(`export type ${name} =([\\s\\S]*?);\\s*$`, 'm').exec(clientSource(file));
  if (decl === null) throw new Error(`${file}: no \`export type ${name} = ... ;\` declaration`);
  const member = new RegExp(`type: '${tag}';[^}]*?\\b${field}: (\\w+)`).exec(decl[1] ?? '');
  if (member === null) throw new Error(`${file}: ${name}'s '${tag}' member declares no \`${field}\``);
  return member[1] ?? '';
}

/**
 * The PARAMETER NAMES a `DataSourceQuery` method declares, in source order.
 *
 * Same fail-loud contract as the three helpers above, and the same reason for
 * existing: ruling P25 clause 2 moved three signatures, and a literal typed in
 * this file would have stayed green through the move it describes.
 */
function clientMethodParameters(
  file: 'view-types.ts' | 'data-source.ts',
  name: string,
  method: string,
): string[] {
  const block = new RegExp(`export type ${name} = \\{([^{}]*)\\}`).exec(clientSource(file));
  if (block === null) throw new Error(`${file}: no \`export type ${name} = { ... }\` block`);
  const signature = new RegExp(`\\b${method}\\(([^)]*)\\)`).exec(block[1] ?? '');
  if (signature === null) throw new Error(`${file}: ${name} declares no \`${method}(...)\``);
  return (signature[1] ?? '')
    .split(',')
    .map((parameter) => (parameter.split(':')[0] ?? '').trim())
    .filter((parameter) => parameter.length > 0);
}

/**
 * `packages/app-core/src/online/mappers.ts`, read as TEXT, exactly as the two
 * pins above read `view-types.ts` and `data-source.ts`.
 *
 * ## What this is for, and why it is the only place it can live
 *
 * Six `DataSourceQuery` methods cannot be answered over the shipped routes, and
 * the online source REFUSES them rather than returning a plausible-looking view
 * (Plan 6 Task 7). Each refusal enumerates the facts that are absent, as data:
 * `{ field, wireKey, because, owner }`. A test in `app-core` can assert that the
 * refusal fires and names what it names — but it can only go red when somebody
 * edits `mappers.ts`, because nothing in that package has ever seen a server.
 *
 * THIS file has the real bodies. So the enumeration is checked here against
 * them: every `wireKey` a refusal still names must be genuinely absent from the
 * live `/v1` answer. The day a route starts serving one, the case reddens and
 * somebody has to delete a refusal that is no longer true — which is exactly the
 * outcome "recorded with a named owner" is supposed to produce and usually does
 * not.
 *
 * It throws rather than returning `[]` for the same reason `clientTypeFields`
 * does: an empty list satisfies every absence assertion below, which is the one
 * way this pin could pass by being broken.
 */
const APP_CORE_MAPPERS = fileURLToPath(
  new URL('../../../../packages/app-core/src/online/mappers.ts', import.meta.url),
);

type MapperAbsence = { field: string; wireKey: string | null; wireRoute: string | null };

/**
 * `wireRoute` is parsed as a THIRD aligned column, not as an optional extra.
 *
 * It was added because an absence is not always missing from the route the
 * client method calls: `MyWorkView.contested` is closed by `GET /v1/contests`,
 * which shipped, and a cross-check that looked for `title` in the `/v1/me/work`
 * body would have found it (on a `TicketCard`) and reddened for a reason that
 * has nothing to do with contests. Every entry therefore states which body its
 * `wireKey` is a claim about, and the three-way count check below is what stops
 * a half-edited list from silently pairing one entry's field with another's
 * route.
 */
function mapperAbsences(constName: string): MapperAbsence[] {
  const source = readFileSync(APP_CORE_MAPPERS, 'utf8');
  expect(source, 'online/mappers.ts').toContain('export class ServingGapError');
  const block = new RegExp(
    `const ${constName}: readonly Absence\\[\\] = \\[([\\s\\S]*?)\\n\\];`,
  ).exec(source);
  if (block === null) {
    throw new Error(
      `online/mappers.ts: no \`const ${constName}: readonly Absence[] = [ ... ];\` block`,
    );
  }
  const body = block[1] ?? '';
  const fields = [...body.matchAll(/\n {4}field: (['"])([\s\S]*?)\1,/g)].map(([, , field]) => field ?? '');
  const wireKeys = [...body.matchAll(/\n {4}wireKey: (?:(['"])([\s\S]*?)\1|null),/g)].map(
    ([, , key]) => key ?? null,
  );
  const wireRoutes = [...body.matchAll(/\n {4}wireRoute: (?:(['"])([\s\S]*?)\1|null),/g)].map(
    ([, , route]) => route ?? null,
  );
  if (fields.length === 0) throw new Error(`${constName}: parsed no \`field:\` entries`);
  if (fields.length !== wireKeys.length || fields.length !== wireRoutes.length) {
    throw new Error(
      `${constName}: ${fields.length} field entries against ${wireKeys.length} wireKey and ${wireRoutes.length} wireRoute entries`,
    );
  }
  return fields.map((field, index) => ({
    field,
    wireKey: wireKeys[index] ?? null,
    wireRoute: wireRoutes[index] ?? null,
  }));
}

/**
 * The assertion every refusal cross-check makes: each `wireKey` the refusal
 * still names is absent from this real body, at every depth — and the walker
 * could have found keys on it, which is what keeps "absent" from meaning
 * "nothing was looked at".
 *
 * `route` selects the absences this body can speak to, and the SELECTION is
 * itself asserted: a call that matches nothing throws rather than passing
 * vacuously. Without that, pointing a `wireRoute` at a route no case exercises
 * would silently retire the pin — the check would keep passing over an empty
 * list, which is the exact "cannot fail" shape this file exists to avoid. The
 * complementary guard is the route-coverage case below, which asserts every
 * `wireRoute` in `mappers.ts` is a route some case here really fetches.
 */
function expectStillUnserved(
  constName: string,
  body: unknown,
  presentControl: string,
  route: string,
): void {
  const all = mapperAbsences(constName);
  const absences = all.filter((absence) => absence.wireRoute === route);
  expect(
    absences.length,
    `${constName}: no absence names ${route} — either this call names the wrong route or the list moved`,
  ).toBeGreaterThan(0);
  const keys = allKeys(body);
  expect(keys.length, `${constName}: the body has keys to search`).toBeGreaterThan(0);
  expect(keys, `${constName}: positive control`).toContain(presentControl);
  for (const { field, wireKey } of absences) {
    if (wireKey === null) continue;
    const served = keys.filter((key) => key === wireKey || key.endsWith(`.${wireKey}`));
    expect(
      served,
      `${field}: the online DataSource still refuses because \`${wireKey}\` is unserved on ${route}, and this body now carries it — delete the refusal in packages/app-core/src/online/mappers.ts`,
    ).toEqual([]);
  }
}

/** Every key anywhere in a body, dotted. What an "absent everywhere" claim is made over. */
function allKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => allKeys(item, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => {
    const here = path === '' ? key : `${path}.${key}`;
    return [here, ...allKeys(inner, here)];
  });
}

/**
 * A `/v1` path reduced to the identity the assertion is made over: its SHAPE.
 *
 * Both sides of 7.209 go through this, and both need it. On this file's side,
 * `${childTicketId}`, `${restrictedChildId}` and `${ticketId}` are the SAME
 * Fastify route reached with three different local variable names, so a naive
 * reading makes one route into four — and this is the SUPERSET side, so inflating
 * it is the direction that covers a gap rather than opening one. On `mappers.ts`'
 * side a `wireRoute` is written with a placeholder name too, and the property
 * 7.209 asserts is about the path, not the spelling of a parameter that no
 * request carries.
 */
function routeShape(path: string): string {
  return (path.split('?')[0] ?? '')
    .replace(/\$\{\w+\}/g, ':param')
    .replace(/:[A-Za-z_]\w*/g, ':param');
}

/**
 * Every `/v1` route THIS FILE really fetches, derived from this file's own
 * source text rather than written down here.
 *
 * It is derived because the hand-written version of this list is what 7.209's
 * failure was made of. It read six routes, then four, then three, then one,
 * then `[]` — and every entry that left did so in the SAME commit that deleted
 * the absence list naming it, because the list was being kept in step with
 * `named` by hand. A list derived from the file cannot be kept in step with
 * anything: it is a measurement, and it is what `named` gets compared against.
 *
 * Throws rather than returning `[]`, on `clientTypeFields`' contract: an empty
 * list makes 7.209's containment assertion true for every input, which is the
 * one way this derivation could pass by being broken.
 *
 * Three limits, all stated rather than left to be discovered:
 *   - comments are stripped BEFORE scanning. This list is the SUPERSET side of
 *     the assertion, so a route written inside prose would cover a gap rather
 *     than open one — the direction that HIDES a real defect. The control in
 *     the helper asserts the stripped text is still this file, which is also
 *     what catches a stripper that over-reached.
 *   - a request whose `url:` is not a `/v1` literal at all — `${base}?…` — is
 *     skipped, and every OTHER unrecognised form THROWS. A skip is a request
 *     this scan cannot read, and a route counted as fetched without having been
 *     read is a route that covers a gap.
 *   - ⚠ WHAT THIS CANNOT SEE, stated because it is the residual. The assertion
 *     it feeds is CONTAINMENT, which is silent about this set's coverage: with
 *     `named` legitimately empty, one route rewritten into a spelling this scan
 *     does not match would leave the set without reddening anything. Total
 *     failure is loud (`routes.size === 0` throws); partial is not. Closing
 *     that needs a route this file is asserted to fetch, which would be a
 *     ratchet on the file's coverage rather than a check on the refusals — the
 *     trade this case deliberately does not make.
 */
const CONTRACT_TEST_SRC = fileURLToPath(new URL(import.meta.url));

function routesThisFileFetches(): string[] {
  const source = readFileSync(CONTRACT_TEST_SRC, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  // The read found THIS file, and the comment-stripper did not eat it: 7.209
  // sits near the bottom, so a control that survives is a control on the whole
  // text above it. Every claim below is a claim about this string.
  expect(source, 'client-contract.test.ts').toContain("it('7.209");
  const routes = new Set<string>();
  for (const [, single, template] of source.matchAll(/url:\s*(?:'([^']*)'|`([^`]*)`)/g)) {
    const value = single ?? template ?? '';
    if (!value.startsWith('/v1')) {
      // An absolute path that is not `/v1` is a request this scan cannot count,
      // and it TALKS rather than skipping: the set it feeds is the superset side
      // of the assertion, so a route dropped here is a real route the check
      // pretends the file does not fetch.
      if (value.startsWith('/')) {
        throw new Error(
          `client-contract.test.ts: a url of ${value} is an absolute path and not /v1 — this scan cannot count it as fetched`,
        );
      }
      // Everything else is skipped ON PURPOSE and that is the whole skip list:
      // a bare identifier, and a template rooted in an interpolation. Both
      // resolve at runtime to a route one of the `/v1` literals below already
      // names, and the cases that build them fetch both.
      //
      // ⚠ This branch also catches the scan's OWN text, measured 2026-09-20: an
      // earlier version of the throw above read `` `url: \`${value}\`` `` in a
      // template literal, and the backtick-quoted `url:` inside that message
      // parsed as one more `url` with an empty value. It is why the branch is a
      // named skip list rather than a `throw` on everything unrecognised — the
      // accidental firing proved the control works and proved, at the same time,
      // that a scan over a file containing its own scanner reads the scanner.
      continue;
    }
    // `?groupBy=flat` and the paging cursor are query, not path.
    routes.add(routeShape(value));
  }
  if (routes.size === 0) {
    throw new Error(
      'client-contract.test.ts: parsed no `/v1` route out of any `url:` — the scan broke, it did not find a file that fetches nothing',
    );
  }
  return [...routes].sort();
}

/**
 * The names of every `Absence[]` register `mappers.ts` still declares.
 *
 * 7.209's wireKey/wireRoute invariant ranged over six of these by name, and the
 * last (`MAP_SEARCH_HITS_ABSENCES`) was deleted on 2026-09-19 — leaving a loop
 * over nothing that could not say so. Reading the names means the invariant
 * covers a register again the moment one exists, without anyone having to
 * remember to re-add a string. The residual hole is a register named outside
 * this pattern, which is why the three deleted names are pinned separately: by
 * `mapperAbsences` throwing on them.
 */
function absenceListNames(source: string): string[] {
  return [...source.matchAll(/^const ([A-Z][A-Z0-9_]*_ABSENCES)\b/gm)].map(([, name]) => name ?? '');
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  ingest = built.ingest;
  await app.ready();

  owner = await signedIn();
  exMember = await signedIn();

  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: owner.headers,
    payload: { name: 'Contract Corner' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  projectId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'Front counter' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: owner.userId, projectAdmin: true },
    actorId: owner.userId,
  });

  ticketId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'Sweep the aisle' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.assigned',
    payload: { assigneeId: owner.userId },
    actorId: owner.userId,
  });

  // A child, so the parent carries a real four-field rollup. Without one every
  // rollup in this world is `null` and the case that pins the fourth field
  // would be asserting a shape that never appears — a check that cannot fail.
  // It is deliberately UNASSIGNED (so the My Work case still sees exactly one
  // card) and its title shares no word with the parent's (so the search case
  // still gets exactly one hit).
  childTicketId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: childTicketId },
    type: 'ticket.created',
    payload: { typeId: 'sub-task', projectId, parentId: ticketId, title: 'Wipe the shelf' },
    actorId: owner.userId,
  });

  // A membership that is granted and then taken away. The revocation is what
  // makes `visibleEventsFor` yield a `scope-revoked` instruction — and it is a
  // real one, appended through the gated door by the workspace's owner, rather
  // than a scripted generator standing in for the visibility pass.
  const membershipEntity = { kind: 'membership' as const, id: `${workspaceId}:${exMember.userId}` };
  await post(owner.headers, {
    workspaceId,
    entity: membershipEntity,
    type: 'membership.granted',
    payload: { userId: exMember.userId, role: 'member' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: membershipEntity,
    type: 'membership.revoked',
    payload: { userId: exMember.userId },
    actorId: owner.userId,
  });

  // 7.212's exclusion fixture, seeded here with everything else. Two tickets of
  // its own in the same project, each with an EXPLICIT audience naming different
  // people, so `canSee` says yes to the child and no to the parent for the same
  // viewer. Both are unassigned and their titles share no word with any other
  // ticket here, for the reason the child above states: the My Work case counts
  // cards and the search case counts hits.
  restricted = await signedIn();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'membership', id: `${workspaceId}:${restricted.userId}` },
    type: 'membership.granted',
    payload: { userId: restricted.userId, role: 'member' },
    actorId: owner.userId,
  });
  restrictedParentId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: restrictedParentId },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'Quarterly rent negotiation' },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: restrictedParentId },
    type: 'visibility.set',
    payload: { ticketId: restrictedParentId, mode: 'explicit', userIds: [owner.userId] },
    actorId: owner.userId,
  });
  restrictedChildId = newUlid();
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: restrictedChildId },
    type: 'ticket.created',
    payload: {
      typeId: 'sub-task',
      projectId,
      parentId: restrictedParentId,
      title: 'Photocopy the meter reading',
    },
    actorId: owner.userId,
  });
  await post(owner.headers, {
    workspaceId,
    entity: { kind: 'ticket', id: restrictedChildId },
    type: 'visibility.set',
    payload: {
      ticketId: restrictedChildId,
      mode: 'explicit',
      userIds: [owner.userId, restricted.userId],
    },
    actorId: owner.userId,
  });

  // A REAL contested claim, so 7.208's "these keys are absent" is a statement
  // about a populated row rather than about `{contests: []}` — an empty array
  // satisfies every absence assertion ever written, which is the one way that
  // case could pass by being broken. Built by the server-side constructor and
  // appended through the INTERNAL door, because the client door refuses
  // server-origin events (the envelope-origin gate) and `claim.contested` is
  // one: the server files contests, never a client.
  const refusedClaim: SubmittedEvent = {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: owner.userId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  contestedOriginalId = refusedClaim.id;
  const [contested] = await ingest.ingestBatch([
    buildContestedClaim({
      originalEvent: refusedClaim,
      rule: 'require-field',
      reason: 'A due date is required before this move.',
      actorId: owner.userId,
    }),
  ]);
  expect(contested).toMatchObject({ status: 'committed' });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('SIGNATURE GAP RECONCILED — the three client methods now name their workspace', () => {
  /**
   * **RECONCILED 2026-09-02 (Plan 6 Task 7, ruling P25 clause 2). The cases
   * stayed and their claim inverted** — the same treatment 7.189 and the two
   * stream cases got, for the same reason: a divergence that closed can
   * silently re-open, and nothing else in this file would notice.
   *
   * What they used to say: `data-source.ts` declared `getMyWork()`,
   * `getPreferences()` and `putPreferences(preferences)` — **no `workspaceId`
   * on any of the three** — while every one of those routes reads
   * `?workspaceId=` before the door and refuses without it. The 400 was the
   * sharpest possible pin, because it says the request an adapter written to the
   * client's signature would SEND is refused whole, before membership is even
   * resolved: a fact about the method signature, not about the view model, and
   * therefore not something `online/mappers.ts` could adapt.
   *
   * The signatures moved. The 400/200 pair is KEPT below, because it is the
   * reason they had to — it is what makes "the client must name a workspace" a
   * measurement rather than a preference — and the client half is read OUT OF
   * SOURCE, so this file notices if the parameters are ever taken back off.
   */
  const NO_WORKSPACE = [
    { method: 'GET' as const, url: '/v1/me/work', client: 'getMyWork', parameters: ['workspaceId'] },
    {
      method: 'GET' as const,
      url: '/v1/me/preferences',
      client: 'getPreferences',
      parameters: ['workspaceId'],
    },
    {
      method: 'PUT' as const,
      url: '/v1/me/preferences',
      client: 'putPreferences',
      parameters: ['workspaceId', 'preferences'],
    },
  ];

  it('7.201 all three client signatures now declare a workspaceId, and it comes FIRST', () => {
    for (const { client, parameters } of NO_WORKSPACE) {
      // Whole-array `toEqual`, which is simultaneously the pin and its own
      // positive control: these parameters, in this order, and no others. A
      // `toContain` would stay green if `workspaceId` were added as a trailing
      // optional nobody passed.
      expect(clientMethodParameters('data-source.ts', 'DataSourceQuery', client)).toEqual(
        parameters,
      );
    }
    // Control on the extractor itself, same run: a method that never had the
    // problem still reads the way it reads, so an extractor returning
    // `['workspaceId']` for everything would be caught here.
    expect(clientMethodParameters('data-source.ts', 'DataSourceQuery', 'getTicket')).toEqual([
      'workspaceId',
      'ticketId',
    ]);
    expect(clientMethodParameters('data-source.ts', 'DataSourceQuery', 'getBoard')).toEqual([
      'projectId',
    ]);
  });

  for (const { method, url } of NO_WORKSPACE) {
    /**
     * 7.184 — SIGNATURE GAP: `getMyWork()` takes no `workspaceId`, and `GET /v1/me/work` without one is 400 `invalid_query`.
     * 7.185 — the same for `getPreferences()` on `GET /v1/me/preferences`.
     * 7.186 — and for `putPreferences(preferences)` on `PUT /v1/me/preferences`. One parametrised case proves all three, which is why they are stacked here.
     */
    it(`${method} ${url} with no workspaceId — the request the OLD signature could build — is 400 invalid_query`, async () => {
      const refused = await app.inject({
        method,
        url,
        headers: owner.headers,
        ...(method === 'PUT'
          ? { payload: { savedFilters: [], listColumns: {}, grouping: {} } }
          : {}),
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toEqual({ error: 'invalid_query' });

      // POSITIVE CONTROL, same run, one query parameter apart: the identical
      // request from the identical session, naming the workspace, is answered.
      // Without it "this route refuses everything" passes. It is also the
      // request the NEW client signature builds.
      const answered = await app.inject({
        method,
        url: `${url}?workspaceId=${workspaceId}`,
        headers: owner.headers,
        ...(method === 'PUT'
          ? { payload: { savedFilters: [], listColumns: {}, grouping: {} } }
          : {}),
      });
      expect(answered.statusCode).toBe(200);
    });
  }
});

describe('GET /v1/projects/:projectId/board vs BoardView', () => {
  let body: Record<string, unknown>;
  let column: Record<string, unknown>;
  let card: Record<string, unknown>;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    body = res.json() as Record<string, unknown>;
    const columns = body['columns'] as Array<Record<string, unknown>>;
    // Selected BY TICKET ID and never by position: both tickets sit in `todo`,
    // and which of two ULIDs minted in one millisecond sorts first is not a
    // fact this file may lean on.
    const occupied = columns.find((c) =>
      (c['cards'] as Array<Record<string, unknown>>).some((k) => k['ticketId'] === ticketId),
    );
    expect(occupied).toBeDefined();
    column = occupied as Record<string, unknown>;
    card = (column['cards'] as Array<Record<string, unknown>>).find(
      (k) => k['ticketId'] === ticketId,
    ) as Record<string, unknown>;
    expect(card).toBeDefined();
  });

  /**
   * 7.187 — DATA GAP: `BoardCard.assignee` is an `Actor`, dereferenced by the view, while the server sends a bare `assigneeId` and resolves no name.
   */
  it('DATA GAP — `BoardCard.assignee` is an `Actor`; the server sends a bare `assigneeId` and resolves no name', () => {
    // `view-types.ts:38` — `assignee: Actor | null`, and `Actor = {id, name}`.
    // `views/board.tsx:94` calls `actorLabel(card.assignee.id, card.assignee.name)`,
    // so this is not a rename an adapter can perform: the NAME is not in the
    // response and is not in `proj_tickets` either. It is a data gap, and the
    // one real view component on `main` dereferences it.
    expect(card).not.toHaveProperty('assignee');
    // Control, same object, same run — the field that IS there, populated.
    expect(card).toHaveProperty('assigneeId');
    expect(card['assigneeId']).toBe(owner.userId);
  });

  /**
   * 7.188 — the board body is `columns` FLAT, where `BoardView` is `groups` of `BoardGroup`, each holding its own `columns`.
   */
  it('the response is `columns` flat; the client reads `groups` of `BoardGroup`, each holding its own `columns`', () => {
    // `view-types.ts:67` — `BoardView = {projectId, groups: BoardGroup[]}`, and
    // `BoardGroup = {workflowId, workflowVersion, workflowName, columns}`. The
    // server flattens that one level: every column carries `workflowId` and
    // `workflowName` itself. An adapter CAN regroup by `workflowId` — so this
    // is a shape gap and not a data gap — but it must know to, and today
    // nothing says so anywhere.
    expect(body).not.toHaveProperty('groups');
    expect(body).toHaveProperty('columns'); // control, same body
    expect(column).toHaveProperty('workflowId');
    expect(column).toHaveProperty('workflowName');
    // And the server carries a `workspaceId` the client's `BoardView` does not.
    expect(body['workspaceId']).toBe(workspaceId);
  });

  it('SERVING GAP CLOSED — every board column carries `workflowVersion`, and it is the DEFINITION’s version', async () => {
    // **RECONCILED 2026-09-02 (Plan 6 Task 11, P25 clause 1). The case stayed
    // and its claim inverted.** It formerly read: `workflowVersion` appears at
    // no depth of the board body while `proj_tickets` holds it — a serving gap
    // owned by one route change. That route change landed
    // (`routes/board.ts` populates it at both `columns.push` sites), and the
    // case was rewritten rather than deleted for the same reason the two stream
    // cases were: a divergence that closed can silently re-open, and nothing
    // else in this file would notice.
    //
    // The CLIENT half is read out of source, not transcribed — the mechanism
    // this file's docblock exists to explain. A literal list typed here could
    // change only when somebody edits this file, so it would pin nothing on
    // `app-core`: the day `BoardGroup` dropped or renamed the field, a
    // transcribed pin would have stayed green.
    const CLIENT_GROUP_FIELDS = clientTypeFields('view-types.ts', 'BoardGroup');
    expect(CLIENT_GROUP_FIELDS).toEqual([
      'workflowId',
      'workflowVersion',
      'workflowName',
      'columns',
    ]);

    // The SERVER half, over the whole body at every depth — the same scope the
    // negative used to be taken over, so the two claims are commensurable.
    const versionKeys = allKeys(body).filter((key) => key.endsWith('.workflowVersion'));
    const columns = body['columns'] as Array<Record<string, unknown>>;
    // EVERY column, not merely some: a route that populated one push site and
    // forgot the other would satisfy a `toContain`.
    expect(versionKeys).toHaveLength(columns.length);
    expect(columns.length).toBeGreaterThan(0); // control: there are columns to have missed

    // AGREEMENT, which is the thing the field means. `workflowVersion` names the
    // published definition this column's `name`/`category`/`blocked` were read
    // out of, so it is asserted against `proj_workflows` — the table the route
    // resolved the definition from — rather than against a literal `1`.
    const { rows: published } = await db.pool.query<{ version: number }>(
      'SELECT version FROM proj_workflows WHERE workspace_id = $1 AND workflow_id = $2 ORDER BY version DESC',
      [workspaceId, column['workflowId']],
    );
    // `ORDER BY version DESC` is what makes `[0]` the LATEST, and that is the
    // whole requirement. Deliberately NOT `toHaveLength(1)`: that would encode
    // "this workflow has exactly one version ever" as a contract of this test,
    // and the day somebody publishes a v2 into this world — the same fixture
    // change `routes/board.test.ts` already makes, for falsifiability — this
    // case would redden for a reason unrelated to the property it names.
    expect(published.length).toBeGreaterThan(0);
    const latestVersion = published[0]?.version;
    expect(typeof latestVersion).toBe('number');
    for (const c of columns) {
      expect(c['workflowVersion']).toBe(latestVersion);
    }

    // The ticket row's own `workflow_version` still exists and still agrees —
    // it was the old case's positive control and it is kept, because it is what
    // says the number served is not merely internally consistent. The two are
    // DIFFERENT facts (the ticket's folded-under version, the column's
    // definition version) that this world happens to hold equal, and saying so
    // is what stops a later reader treating the equality as a contract.
    const { rows } = await db.pool.query<{ workflow_version: number }>(
      'SELECT workflow_version FROM proj_tickets WHERE ticket_id = $1',
      [ticketId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workflow_version).toBe(latestVersion);

    // The walker control, unchanged: it CAN find a key on this body, so what it
    // reports about `.workflowVersion` is a fact about the key.
    expect(allKeys(body)).toContain('columns');

    // NOT PINNED, and named rather than left to look covered: the STRAGGLER
    // column's `workflowVersion: 0`. `appendStragglerColumns`' own docblock
    // records that no seed at any layer can reach that pass — the reducer throws
    // on both roads into it — so a case here would be a check that cannot fail.
  });

  /**
   * 7.190 — the server’s `TicketRollup` carries `uncategorizedChildren`, a FOURTH field `RollupToViewer` has no room for.
   */
  it('the rollup carries a FOURTH field `RollupToViewer` has no room for', () => {
    // `RollupToViewer` (`view-types.ts:28-32`). READ OUT OF THE CLIENT SOURCE,
    // not transcribed: a literal typed here changes only when somebody edits
    // this file, so it would pin nothing on the client side at all — the day
    // the fourth field arrived in `app-core` this case would have stayed green.
    const CLIENT_ROLLUP_FIELDS = clientTypeFields('view-types.ts', 'RollupToViewer');
    // The pin and its own positive control in one line: the client type is
    // these three fields, in this order, and no others. It is what turns
    // "exactly three" from a transcription into a measurement, and it is what
    // goes red the day anybody adds a fourth to `RollupToViewer`.
    expect(CLIENT_ROLLUP_FIELDS).toEqual(['totalChildren', 'terminalChildren', 'restrictedCount']);

    // The PARENT's rollup, non-null because a real `ticket.created` naming it
    // as parent went through the gate. Asserting this against a leaf's `null`
    // would be a check that cannot fail: the fourth field would never appear.
    const rollup = card['rollup'] as Record<string, number>;
    expect(rollup).not.toBeNull();
    expect(Object.keys(rollup).sort()).toEqual([
      'restrictedCount',
      'terminalChildren',
      'totalChildren',
      'uncategorizedChildren',
    ]);
    expect(rollup['totalChildren']).toBe(1);

    // The divergence itself: one server key the client type cannot hold.
    expect(CLIENT_ROLLUP_FIELDS).not.toContain('uncategorizedChildren');
    // Positive control, same two lists, same run — the other three DO line up,
    // so "the client is missing a key" is not "the two types share nothing".
    for (const field of CLIENT_ROLLUP_FIELDS) {
      expect(rollup).toHaveProperty(field);
    }

    // `read-models.ts` documents `uncategorizedChildren` as the "one projection
    // is behind" signal, so an adapter that dropped it would render
    // "5 of 8 done" over a number the server said was incomplete. This is a
    // divergence the client must ADOPT, not one it may narrow away.
    expect(rollup['uncategorizedChildren']).toBe(0);

    // And the leaf answer is still distinguishable from a missing key: the
    // child's own rollup is `null` and the key is present.
    const childCard = (column['cards'] as Array<Record<string, unknown>>).find(
      (k) => k['ticketId'] === childTicketId,
    ) as Record<string, unknown>;
    expect(childCard).toHaveProperty('rollup');
    expect(childCard['rollup']).toBeNull();
  });
});

describe('GET /v1/search vs SearchHit', () => {
  /**
   * 7.191 — DATA GAP: `SearchHit.matchedIn` is on no hit and at no depth; the server cannot compute it.
   */
  it('`matchedIn` IS on every hit now — the DATA GAP this case named is CLOSED, and the claim is INVERTED', async () => {
    // **THIS CASE STOOD THE OTHER WAY UP AND ITS ID IS KEPT** (7.189's
    // precedent, which this file applies elsewhere): it read *"DATA GAP —
    // `matchedIn` is on no hit, and the server cannot compute it."* That was
    // true and its reasoning is worth keeping: the server's `SearchHit` was
    // `{card, snippet}`, and `ts_headline` was given
    // `title || ' — ' || description || ' — ' || comments` as ONE string
    // (`routes/search.ts`), so the server never learned which of the three
    // matched. **The owner ruled the QUERY must derive it (2026-09-19), and the
    // route now asks one `@@` per column.**
    //
    // A divergence that closes can silently RE-OPEN, so the case is inverted
    // rather than deleted — and the arity control (`not.toHaveProperty`) is kept
    // below, because it is what the next reader of this diff needs.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=aisle`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { hits: Array<Record<string, unknown>> };
    expect(body.hits).toHaveLength(1);
    const hit = body.hits[0] as Record<string, unknown>;

    // THE FACT THAT WAS ABSENT IS NOW SERVED, on the hit itself.
    expect(hit).toHaveProperty('matchedIn');
    expect(['title', 'description', 'comment']).toContain(hit['matchedIn']);
    // ...and it is the RIGHT one: both needled words are in the card's TITLE
    // (the fixture's ticket), so the derivation must say `title` — a constant
    // would pass a membership check, and this is what a constant fails.
    expect(hit['matchedIn']).toBe('title');

    // The two facts that were always adaptable are STILL on the card and NOT
    // hoisted onto the hit — the contract `7.204` rested on, unchanged by the
    // field joining it.
    expect(hit).not.toHaveProperty('ticketId');
    expect(hit).not.toHaveProperty('title');
    expect(hit).toHaveProperty('card');
    expect((hit['card'] as Record<string, unknown>)['ticketId']).toBe(ticketId);

    // Controls, same object, same run: the snippet is still populated.
    expect(hit).toHaveProperty('snippet');
    expect(hit['snippet']).toContain('**aisle**');

    // And the response WRAPS the hits, where `search()` returns `SearchHit[]`.
    expect(Object.keys(body).sort()).toEqual(['hits', 'query', 'workspaceId']);
    // `matchedIn` is on the HIT and not on the response — the field answers a
    // question about one row, and hoisting it would be a claim about the query.
    expect(allKeys(body)).not.toContain('matchedIn');
  });
});

describe('GET /v1/me/work vs MyWorkView', () => {
  /**
   * 7.192 — the My Work grouping MODEL differs: `{open, active, terminal}` against `MyWorkView`’s `{assigned, inTransit, contested}`.
   */
  it('the grouping MODEL differs — `{open,active,terminal}` against `{assigned,inTransit,contested}`', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${workspaceId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { groups: Record<string, unknown> };

    // `view-types.ts` — `MyWorkView = {assigned, inTransit, contested}`.
    // This is not a rename: the server groups by STATE CATEGORY and the client
    // groups by CLAIM STATUS, so one axis cannot be computed from the other.
    //
    // **The sentence that used to follow was retired by ruling P40** and is
    // restated rather than dropped, because it is the sort a maintainer
    // reasons from: it said `contested` "comes from a DIFFERENT shipped route —
    // `GET /v1/contests`". It comes from THIS one now, as a top-level key
    // beside `groups`, because "my contested claims" is viewer-scoped and only
    // the server knows the viewer. `/v1/contests` still serves the contests a
    // viewer may SEE — a different question, still measured in 7.208.
    //
    // `inTransit` remains on neither: it is the replica's outbox, which a
    // server by definition has not received.
    expect(Object.keys(body.groups).sort()).toEqual(['active', 'open', 'terminal']);
    for (const clientKey of ['assigned', 'inTransit', 'contested']) {
      expect(body.groups).not.toHaveProperty(clientKey);
    }
    // Control, same object, same run: the server's own keys are present AND one
    // of them is populated, so "no client key" is not "no keys". The ticket was
    // never transitioned, so it sits in `todo` — category `open`.
    expect(body.groups).toHaveProperty('open');
    expect((body.groups['open'] as unknown[]).length).toBe(1);

    // The elements are `TicketCard`s, not `WorkItem`s: the client's `WorkItem`
    // (`view-types.ts:136`) carries `projectName` and `stateName`, which are
    // NAMES, and this response carries ids.
    const card = (body.groups['open'] as Array<Record<string, unknown>>)[0] as Record<
      string,
      unknown
    >;
    expect(card).not.toHaveProperty('projectName');
    expect(card).not.toHaveProperty('stateName');
    expect(card).toHaveProperty('projectId'); // control
    expect(card).toHaveProperty('stateId'); // control

    // 7.205 — INVERTED. This asserted `MAP_MY_WORK_ABSENCES` was still unserved
    // against this body. `getMyWork` refuses over nothing now (rulings P39 and
    // P40), so the cross-check has no absence list to measure and the case
    // pins what replaced it — the same duty pointed at the serving.
    //
    // The two NAMES the client needs are here, in sibling maps rather than on
    // the card: `TicketCard` is shared by the board, search and the attention
    // strip, and putting a name on it would move a visibility decision onto
    // three routes that never asked the question. That is why the assertions
    // above — no `projectName`, no `stateName` ON THE CARD — are still correct
    // and are NOT a refusal any more.
    const full = res.json() as Record<string, unknown>;
    expect(Object.keys(full).sort()).toEqual([
      'contested',
      'groups',
      'projectNames',
      // `shared` (case 13.176) — the tickets whose RESOLVED audience names this
      // viewer, a top-level key beside `groups` for the same reason `contested`
      // is one: `groups` is *assigned to me*, and a ticket can be handed to
      // somebody who is not its assignee, so a shared errand is in none of the
      // three. It is in this EXACT key list deliberately — the list is what
      // noticed the key arriving, which is the whole point of asserting a real
      // door's shape by enumeration rather than by presence checks.
      'shared',
      'stateNames',
      'workspaceId',
    ]);
    // `stateNames` is documented TOTAL over the cards in `groups`, and totality
    // is the property a client depends on — `WorkItem.stateName` is required,
    // so a single missing key is a mapping failure. Asserted by enumeration
    // rather than by a count, and with the value pinned: a map that answered
    // the state ID would satisfy a presence check.
    // `shared` cards are in this walk too, because the route's totality claim
    // now covers them: a shared card with no `stateNames` entry is a body the
    // client cannot map, and the failure would land a layer from its cause.
    const cards = [
      ...Object.values(full['groups'] as Record<string, Array<Record<string, unknown>>>).flat(),
      ...(full['shared'] as Array<Record<string, unknown>>),
    ];
    const stateNames = full['stateNames'] as Record<string, string>;
    expect(cards.length).toBeGreaterThan(0);
    for (const each of cards) {
      expect(stateNames, `no stateNames entry for ${String(each['ticketId'])}`).toHaveProperty(
        String(each['ticketId']),
      );
      expect(stateNames[String(each['ticketId'])]).not.toBe(each['stateId']);
    }
    // And `contested` is a key on this body now, which is the half of ruling
    // P40 this route owns. Its CONTENT — the claimant filter and the canSee
    // gate on the title — is measured in the my-work route's own tests, where
    // a second user and a narrowed audience can be seeded.
    expect(full).toHaveProperty('contested');
    expect(Array.isArray(full['contested'])).toBe(true);
  });
});

describe('GET /v1/me/workspaces vs WorkspaceRef', () => {
  /**
   * 7.193 — DATA GAP: `WorkspaceRef` is `{id, name, projects}`; the row has no `projects`, and the key is `workspaceId` where the client reads `id`.
   */
  it('DATA GAP — no `projects`, and the key is `workspaceId` where the client reads `id`', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { workspaces: Array<Record<string, unknown>> };
    expect(body.workspaces).toHaveLength(1);
    const ref = body.workspaces[0] as Record<string, unknown>;

    // `view-types.ts:5` — `WorkspaceRef = {id, name, projects: ProjectRef[]}`.
    // **THE CLAIM INVERTED and the case stayed** (7.189's precedent). It read:
    // "`projects` is a DATA gap on this surface: no projects-per-workspace read
    // exists anywhere in `/v1`, so an adapter has nothing to call." That was
    // true, and rulings P32/P38 closed it — not by finding a read that existed,
    // but by ruling WHO may be told a project's name, which is what made a read
    // writeable at all (`read/visible-projects.ts`).
    expect(ref).toHaveProperty('projects');
    expect(Array.isArray(ref['projects'])).toBe(true);
    // The `id` vs `workspaceId` rename is still adaptable and still not a gap —
    // kept beside it so a reader does not re-derive which half was the hard one.
    expect(ref).not.toHaveProperty('id');
    // Controls, same object, same run.
    expect(ref).toHaveProperty('workspaceId');
    expect(ref['workspaceId']).toBe(workspaceId);
    // `memberCount` joined at Task 16 and IS read by the client
    // (`WorkspaceRef.memberCount`, `number | null`). It is present here because
    // this caller is the workspace's owner; a GUEST caller would be served this
    // same object with the key ABSENT, which is what `null` on the client means
    // and what case 13.366 pins on the route.
    // `nameRestrictedProjectCount` joined at Task 18 and IS read by the client
    // (`WorkspaceRef.nameRestrictedProjectCount`, a plain `number`). Unlike
    // `memberCount` it is here for EVERY caller, guests included — the owner's
    // 2026-09-09 ruling — so this sorted key set is the same for a guest,
    // minus `memberCount`.
    expect(Object.keys(ref).sort()).toEqual([
      'memberCount',
      'name',
      'nameRestrictedProjectCount',
      'projects',
      'role',
      'workspaceId',
    ]);
    // The client type reads `role` since Task 15 and the counts since Task 16;
    // where the two still differ the server discloses MORE, which is the one
    // direction that is safe.

    // 7.202 — THE REFUSAL IS GONE, and this is the line that said it would be.
    // It read: "the day this route joins `proj_projects`, the case reddens and
    // the refusal has to go." It did, and it has. `MAP_WORKSPACE_REFS_ABSENCES`
    // no longer exists, so `mapperAbsences` throws on it — asserted here rather
    // than deleted, because a removed cross-check leaves nothing to notice a
    // refusal being reinstated without its read.
    expect(() => mapperAbsences('MAP_WORKSPACE_REFS_ABSENCES')).toThrow(/no `const/);
  });
});

/**
 * 7.194 — cited on the block: `TicketRead`’s two disagreements with the served body are worked through the tests here rather than asserted once.
 */
describe('GET /v1/workspaces/:ws/tickets/:id vs TicketRead', () => {
  /**
   * 7.213 — THE ROUND TRIP THIS FILE HAS NEVER DONE, and the hole BOTH of
   * closure 2's Criticals came through.
   *
   * Everything else here reads `mappers.ts` as TEXT (`readFileSync`) or asserts
   * key sets on a body. Nothing has ever EXECUTED a mapper against a real `/v1`
   * response. So the two halves could agree about which keys exist and disagree
   * about what they are called, and every suite stayed green: the single-read
   * route returned `rollupFor`'s `RollupView` spelling (`total`/`terminal`/
   * `uncategorized`) while the client's `mapRollup` reads `TicketRollup`'s, and
   * every ticket WITH CHILDREN came back a `MappingError` while leaves mapped.
   * 1033 of 1033 app-core tests passed with that defect live.
   *
   * A key-set assertion cannot catch it and neither can a text scan. Only
   * running the real mapper over the real bytes can.
   *
   * THE TICKET IS DELIBERATELY THE PARENT. `ticketId` has a child (seeded
   * above, "so the parent's rollup is non-NULL"), so this exercises the rollup
   * branch — the one a `rollup: null` fixture skips, which is exactly how the
   * defect survived its own unit tests.
   */
  it('7.213 the REAL mapper maps the REAL body — a ticket WITH CHILDREN, executed and not scanned', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;

    // The precondition, asserted rather than assumed: a NULL rollup here would
    // make this case skip the very branch it exists for and pass anyway.
    expect(body['rollup'], 'the fixture parent must have a non-null rollup').not.toBeNull();

    // THE ROUND TRIP. No try/catch: a `MappingError` fails the case with the
    // mapper's own message, which names the exact field that disagreed —
    // `ticket.rollup.uncategorizedChildren: expected a number` was what the
    // spelling mismatch produced, and a caught-and-rethrown error would lose it.
    const view = mapTicketRead(body);

    // Enough of the mapped view to show it is the real ticket and not an empty
    // shell the mapper happened to accept.
    expect(view.title).toBe('Sweep the aisle');
    expect(view.ticket.id).toBe(ticketId);
    expect(view.stateProvenance.actorId).toBeTruthy();
    expect(view.rollup).not.toBeNull();
    expect(view.rollup?.totalChildren).toBe(1);

    // AND THE CONTROL, in the same run: the CHILD is a leaf, so its rollup is
    // null and it maps through the OTHER branch. Without it, "the parent maps"
    // would also pass against a mapper that ignored the rollup entirely.
    const childRes = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${childTicketId}`,
      headers: owner.headers,
    });
    expect(childRes.statusCode).toBe(200);
    const childView = mapTicketRead(childRes.json() as Record<string, unknown>);
    expect(childView.rollup).toBeNull();
    expect(childView.title).toBe('Wipe the shelf');
  });

  it('7.203 SERVING GAPS CLOSED — the route now carries the title, the domain state and the provenance beside the visibility row', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${ticketId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ticket: Record<string, unknown>;
      ticketState: Record<string, unknown>;
      title: unknown;
      stateProvenance: Record<string, unknown>;
    };

    // **THE CLAIM OF THIS CASE INVERTED, and the case was kept** (7.189's
    // precedent). It used to read "the route WRAPS a snake_case visibility row —
    // no title, no state, no provenance", and asserted
    // `Object.keys(body).sort()` was `['parent','rollup','ticket']` with both
    // `title` and `stateProvenance` absent, because `view-types.ts:115` declares
    // `TicketRead = {ticket: TicketState, title, stateProvenance, parent,
    // rollup}` and none of the three was on the wire. Ruling P25 clause 1 closed
    // all three. A deleted case would leave nothing to notice the day they
    // regress, so what it pins now is the agreement.
    // **AND IT GAINED A SEVENTH KEY, 2026-09-19 — `assignedProvenance`** — which
    // is what an exact key set is FOR: the sheet's assignee became editable and
    // every sibling row there already says who set it, so the single read had to
    // serve the claim behind `ticketState.assigneeId`. That is a WIDENING by one
    // more call to the reader the list already uses (`read/assigned-provenance.ts`),
    // not a second door. This case caught it, which is the point of pinning the
    // set rather than counting it.
    expect(Object.keys(body).sort()).toEqual([
      'assignedProvenance',
      'parent',
      'rollup',
      'stateProvenance',
      'ticket',
      'ticketState',
      'title',
    ]);
    // The `ticket` key is UNCHANGED — the visibility row's allow-list was argued
    // column by column and no gap required touching it, so the domain state
    // arrived BESIDE it rather than instead of it. Pinned whole, so a column
    // appearing there still reddens this.
    expect(Object.keys(body.ticket).sort()).toEqual([
      'own_mode',
      'parent_id',
      'project_id',
      'resolved_mode',
      'seq',
      'ticket_id',
      'workspace_id',
    ]);
    expect(body.ticket['ticket_id']).toBe(ticketId);

    // The title is the SAME string the board serves for this ticket — the
    // control that used to prove the fact existed in the product now proves the
    // two surfaces agree about it.
    const board = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/board`,
      headers: owner.headers,
    });
    expect(JSON.stringify(board.json())).toContain('Sweep the aisle');
    expect(body.title).toBe('Sweep the aisle');

    // The domain `TicketState`, by the key whose absence the refusal named:
    // `transitions`. Field-shaped rather than presence-shaped — `kind` is the
    // discriminant every `EntityState` narrowing turns on.
    expect(body.ticketState['kind']).toBe('ticket');
    expect(body.ticketState['id']).toBe(ticketId);
    expect(Array.isArray(body.ticketState['transitions'])).toBe(true);
    expect(typeof body.ticketState['workflowVersion']).toBe('number');

    // The provenance, whole: an actor and both clocks, which is what
    // `ClaimProvenance` needs and what the refusal said was missing.
    expect(body.stateProvenance['actorId']).toBe(owner.userId);
    expect(typeof body.stateProvenance['clientTime']).toBe('string');
    expect(typeof body.stateProvenance['serverTime']).toBe('string');
  });

  it('7.212 THE EXCLUSION — a viewer who may not see the parent gets its existence and NOT its title', async () => {
    // The rule-first half of ruling P25 clause 1, measured on a real `/v1` body.
    // The rule is `canSee` (`src/visibility/can-see.ts:227`) at the guard this
    // handler already had; what this case asks is whether the TITLE travels only
    // on the arm where it said yes. A suite built from the permitted case alone
    // cannot tell a correct rule from no rule at all, so the withheld case is
    // measured first and the permitted one is its control.
    //
    // The fixture is seeded in `beforeAll` with everything else — `restricted`
    // is a member the child's explicit audience names and the parent's does not.
    const parentDirect = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${restrictedParentId}`,
      headers: restricted.headers,
    });
    // The parent really is out of reach for this viewer — asserted rather than
    // assumed, so a withheld title is the rule answering and not a route that
    // never carries one.
    expect(parentDirect.statusCode).toBe(404);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${restrictedChildId}`,
      headers: restricted.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { parent: Record<string, unknown>; title: unknown };
    expect(body.parent).toEqual({ kind: 'restricted', id: restrictedParentId });
    // No key at any depth carries the parent's title, and the walker's own
    // controls are in the same run: it found keys, and the CHILD's title IS one
    // of them — so "withheld" is not "nothing was looked at".
    const keys = allKeys(body);
    expect(keys.length).toBeGreaterThan(0);
    expect(body.title).toBe('Photocopy the meter reading');
    expect(JSON.stringify(body)).not.toContain('Quarterly rent negotiation');
    expect(keys.filter((key) => key.startsWith('parent.'))).toEqual(['parent.kind', 'parent.id']);

    // THE OTHER DIRECTION, same row, same run: the owner may see the parent and
    // gets its title on the same field. Without this the case would pass against
    // a route that serves no parent title to anybody.
    const forOwner = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/tickets/${restrictedChildId}`,
      headers: owner.headers,
    });
    expect(forOwner.statusCode).toBe(200);
    expect((forOwner.json() as { parent: Record<string, unknown> }).parent).toMatchObject({
      kind: 'ticket',
      id: restrictedParentId,
      title: 'Quarterly rent negotiation',
    });
  });
});

describe('GET/PUT /v1/me/preferences vs UserPreferences', () => {
  /**
   * 7.195 — the client’s `UserPreferences` document is REFUSED WHOLE: `.strict()` turns three renames into one 400 rather than three partial acceptances.
   */
  it("the client's document is REFUSED whole — `.strict()` turns three renames into one 400", async () => {
    // `view-types.ts:220` — `UserPreferences = {version: 1, projects:
    // Record<id, ProjectViewPrefs>, savedFilters}`, with
    // `SavedFilter = {id, name, filter}`. The server's `preferencesDocSchema`
    // is `.strict()` and its keys are `{savedFilters, listColumns, grouping}`
    // with `SavedFilter.filterSpec`. So this is not an adapter's rename job:
    // the client's document does not reach storage at all.
    //
    // `ProjectViewPrefs` (`view-types.ts:214`) is no longer a plain
    // `{columns, grouping}` pair: ruling P24 says the server's two parallel
    // records can hold a project in `listColumns` and not in `grouping`, and
    // that the missing half must surface as NOT SET rather than as a default
    // wearing the user's authority — so each half is a `Chosen<T>` whose
    // `default` arm carries no value. That is what this payload spells out, and
    // spelling it out is the point of the pin: the shape below is what a client
    // would actually send today, so the 400 is measured against the real type
    // rather than against a shape nothing constructs any more.
    const clientDoc = {
      version: 1,
      projects: {
        [projectId]: {
          columns: { origin: 'stored', value: ['status'] },
          grouping: { origin: 'stored', value: 'epic' },
        },
      },
      savedFilters: [{ id: 'mine', name: 'Mine', filter: {} }],
    };
    const refused = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: clientDoc,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({ error: 'invalid_preferences' });

    // POSITIVE CONTROL, same session, same URL: the SERVER's document is
    // stored and answered back. Without it, "this route refuses every PUT"
    // passes.
    const serverDoc = {
      savedFilters: [{ id: 'mine', name: 'Mine', filterSpec: {} }],
      listColumns: { [projectId]: ['status'] },
      grouping: { [projectId]: 'epic' },
    };
    const stored = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: serverDoc,
    });
    expect(stored.statusCode).toBe(200);
    expect(stored.json()).toEqual(serverDoc);
  });

  /**
   * 7.196 — `FilterSpec` disagrees on PLURALITY: the client’s `assigneeIds` array is refused where the server stores a singular `assigneeId`.
   */
  it("`FilterSpec` disagrees on plurality — the client's `assigneeIds` array is refused where `assigneeId` is stored", async () => {
    // `view-types.ts:70-81` — the client's `FilterSpec` is
    // `{assigneeIds?: string[], collaboratorIds?: string[], typeIds?: string[],
    // stateIds?: string[], stateCategories?: StateCategory[], projectIds?:
    // string[], dueBefore?, dueAfter?, fields?}`. The server's
    // `filterSpecSchema` is SINGULAR throughout — `assigneeId`, `typeId`,
    // `stateId` — plus `blocked` and a `due` object the client has no key for.
    //
    // This is the most consequential divergence in the file that no `.d.ts`
    // would catch, because `FilterSpec` is a PARAMETER of `getTickets` and
    // `search` as well as a stored field: a client filtering by two assignees
    // has no server request that expresses it.
    const plural = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: {
        savedFilters: [{ id: 'f', name: 'F', filterSpec: { assigneeIds: [owner.userId] } }],
        listColumns: {},
        grouping: {},
      },
    });
    expect(plural.statusCode).toBe(400);
    expect(plural.json()).toEqual({ error: 'invalid_preferences' });

    // Control, one letter apart: the singular spelling, same value, same run.
    const singular = await app.inject({
      method: 'PUT',
      url: `/v1/me/preferences?workspaceId=${workspaceId}`,
      headers: owner.headers,
      payload: {
        savedFilters: [{ id: 'f', name: 'F', filterSpec: { assigneeId: owner.userId } }],
        listColumns: {},
        grouping: {},
      },
    });
    expect(singular.statusCode).toBe(200);
  });
});

describe('GET /v1/projects/:projectId/tickets vs TicketListView', () => {
  it('7.206 SERVING GAPS CLOSED — every card carries all five fields `ListRow` needs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets?groupBy=flat`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      groups: Array<{ cards: Array<Record<string, unknown>> }>;
    };

    // The cards have to BE there, or every claim below is a claim about an empty
    // array. Both tickets from `beforeAll` are in this project.
    const cards = body.groups.flatMap((group) => group.cards);
    expect(cards.length).toBeGreaterThan(0);

    // **THE CLAIM OF THIS CASE INVERTED, and the case was kept** (7.189's
    // precedent). It read "five fields `ListRow` needs and no card carries" and
    // called `expectStillUnserved('MAP_LIST_VIEW_ABSENCES', …)`, because
    // `view-types.ts` needs `typeRank`, `epicId`, `stateName`,
    // `hasRestrictedParent` and `assignedProvenance` and the route served plain
    // `TicketCard`s. Ruling P25 clause 1 closed all five, the absence list is
    // deleted (7.209 asserts it is GONE, not emptied), and what this pins now is
    // that every card really carries them.
    //
    // Counted against the CARD COUNT rather than asserted with a `toContain` a
    // one-card fix would satisfy — the same shape 7.189 landed on for
    // `workflowVersion`.
    for (const field of [
      'typeRank',
      'epicId',
      'stateName',
      'hasRestrictedParent',
      'assignedProvenance',
    ]) {
      expect(
        cards.filter((card) => Object.hasOwn(card, field)).length,
        `${field}: on every card, not merely on one`,
      ).toBe(cards.length);
    }
    // …and the two that are not nullable are real values, not nulls sitting
    // where a fact goes. `epicId`, `assignedProvenance` and (for a root)
    // `hasRestrictedParent` all have true absence values, so their presence is
    // what this case can honestly claim; their VALUES are pinned in
    // `test/routes/list.test.ts` at 7.210 and 7.211, against the type ladder,
    // the workflow definition and the ledger.
    for (const card of cards) {
      expect(typeof card['typeRank']).toBe('number');
      expect(typeof card['stateName']).toBe('string');
      expect(typeof card['hasRestrictedParent']).toBe('boolean');
    }

    // Controls, same cards, same run: the fields these five were DERIVED from
    // are still on the wire, so a card that lost `stateId` while gaining
    // `stateName` reddens here rather than passing as an improvement.
    const card = cards[0] as Record<string, unknown>;
    expect(card).toHaveProperty('stateId');
    expect(card).toHaveProperty('typeId');
    expect(card).toHaveProperty('parentId');
    expect(card).toHaveProperty('assigneeId');
  });
});

describe('GET /v1/workspaces/:ws/attention vs AttentionItem', () => {
  it('7.207 the strip emits three kinds where `AttentionKind` has four, and the fourth’s owner is /v1/contests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/workspaces/${workspaceId}/attention`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ kind: string }> };

    // **THIS BODY IS EMPTY, and the assertion that used to stand here could not
    // fail.** It read `body.items.every((item) => item.kind !== 'contested')`,
    // which is vacuously TRUE for `[]` — this fixture seeds nothing blocked,
    // nothing stale and nothing due soon, so the strip has always answered
    // `{items: []}` here and the case has always passed without observing a
    // single item. Found by adding a non-vacuity line to it, which failed.
    //
    // It is REPLACED rather than propped up with a seeded item: the population
    // claim is already made non-vacuously in `test/routes/attention.test.ts`,
    // which asserts the exact id sets for all three kinds against real blocked,
    // stale and due-soon fixtures (its 7.114-7.116 group). Seeding a fourth
    // copy here would be a second fixture for a property that file already
    // owns, and this file's job is the CLIENT CONTRACT — the shape a mapper
    // reads — not the sweep's arithmetic.
    //
    // So what is pinned here is the envelope the mapper destructures, which
    // this body really does carry.
    const shape = res.json() as Record<string, unknown>;
    expect(Object.keys(shape).sort()).toEqual([
      'generatedAt',
      'items',
      'settings',
      'workspaceId',
    ]);
    expect(Array.isArray(shape['items'])).toBe(true);

    // **CORRECTED TWICE, and the second correction is this one.** It first
    // pinned `routes/attention.ts`'s SOURCE — "it never mentions
    // proj_contested" — which aimed at a file that owed nothing. It then pinned
    // `MAP_ATTENTION_ABSENCES`, which ruling P40 DELETED when `/v1/contests`
    // grew the title. So the source-text read is gone and what remains is the
    // fact about THIS route, which has not changed through either correction:
    // the sweep emits three kinds and the fourth is somebody else's to supply.
    //
    // The client joins it now (`mapAttention`), so "three kinds here" is no
    // longer a gap — it is the division of labour, and it is still worth
    // pinning because a strip that silently grew a fourth kind HERE would mean
    // two sources for one item type.
    // Whatever this route ever emits, it is one of the three it sweeps for —
    // stated as a loop so it stays true if the fixture is ever populated, and
    // explicitly NOT relied on while `items` is empty.
    for (const item of body.items) {
      expect(['blocked', 'stale', 'due-soon']).toContain(item.kind);
    }
  });
});

describe('GET /v1/contests vs the two contested refusals', () => {
  /**
   * 7.208 — the SHIPPED contested read, measured against what the client would
   * need to join it.
   *
   * `GET /v1/contests` is what `MyWorkView.contested` and `AttentionItem`'s
   * fourth kind would be built from, so it is the route those refusals name and
   * the only body this claim can be made over. The row here is a REAL
   * `claim.contested`, appended in `beforeAll` through the internal ingest door
   * and out through the whole projection registry — `{contests: []}` would make
   * every "absent" assertion below trivially true.
   *
   * **Both absences this case was built on are gone, and they went different
   * ways** — which is the reason it is inverted rather than deleted:
   *
   * - `title` was a key the route COULD grow, and it grew it. `proj_contested`
   *   stores `ticket_id`, so one join names the ticket; the route now serves
   *   `title` AND `projectId` off that join, closing the My Work banner's copy
   *   and the attention strip's fourth kind at once. This case said "whoever
   *   does that, this goes red so they notice" — it went red, and this is the
   *   noticing.
   * - `serverTime` did NOT arrive and never will. `originalEvent` is a
   *   `SubmittedEvent` — the envelope MINUS `serverTime` and `seq` — because
   *   the claim was refused at the door and never committed. Ruling P39 closed
   *   that absence by deleting the FIELD rather than finding the instant, so
   *   the pin below is kept exactly as it was: the day a body under this route
   *   carries a `serverTime` for a refused claim, somebody has changed what a
   *   contest is, and `ContestedClaimProvenance` has to be re-argued rather
   *   than quietly widened.
   */
  it('7.208 carries the contest whole, now WITH a title, and still with no serverTime on the claim', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${workspaceId}&ticketId=${ticketId}`,
      headers: owner.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { contests: Array<Record<string, unknown>> };
    // The row is THERE. Everything below is a claim about a populated contest.
    expect(body.contests).toHaveLength(1);
    const contest = body.contests[0] as Record<string, unknown>;
    expect(contest['originalEventId']).toBe(contestedOriginalId);

    // Controls, same body, same run: the three `ContestedClaim` fields the join
    // DOES produce, and the ticket the join would be made on.
    expect(contest).toHaveProperty('ticketId');
    expect(contest).toHaveProperty('rule');
    expect(contest).toHaveProperty('reason');
    expect(contest).toHaveProperty('claimantId');
    // And the embedded claim really is there and really does carry the OTHER
    // half of a provenance — so "no serverTime" is not "no original event".
    const original = contest['originalEvent'] as Record<string, unknown>;
    expect(original['actorId']).toBe(owner.userId);
    expect(original['clientTime']).toBe('2026-08-20T09:00:00.000Z');

    // `contestedAt` IS present and is deliberately not spent as the claim's
    // `serverTime`: it is when the server FILED the refusal, not when it
    // received the claim.
    expect(contest['contestedAt']).toEqual(expect.any(String));

    // The two keys the join added, which is what un-blocked both client
    // refusals. Values, not presence: a `title` echoing the ticket id would
    // satisfy `toHaveProperty` and is exactly the shape the absence warned
    // about ("a contest labelled with a title this client made up").
    expect(contest['title']).toBe('Sweep the aisle');
    expect(contest['title']).not.toBe(contest['ticketId']);
    expect(contest['projectId']).toBe(projectId);

    // THE EXCLUSION, same body, same run: no `serverTime` anywhere on or under
    // the claim. This is ruling P39's own stated fixture — the mapper and the
    // route alike must never populate one for a refused claim — and it is
    // asserted on the ORIGINAL EVENT rather than on a client shape, because
    // this is the only place a real wire body exists.
    expect(original).not.toHaveProperty('serverTime');
    expect(original).not.toHaveProperty('seq');
    // `contestedAt` is present (asserted above) and is NOT equal to anything
    // the claim carries, so "the contest has an instant" cannot be mistaken for
    // "the claim has one".
    expect(contest['contestedAt']).not.toBe(original['clientTime']);
  });

  /**
   * 7.209 — the guard on the guard.
   *
   * `expectStillUnserved` SELECTS absences by route, and a selection is a place
   * a pin can be retired without anything going red: point a `wireRoute` at a
   * route no case fetches and its `wireKey` is never measured against anything
   * again. So the set of routes the refusals name is asserted against the set of
   * routes this file actually exercises.
   *
   * ⚠ CORRECTED 2026-09-20: it read *"one list derived from `mappers.ts`, the
   * other written here, and neither able to shrink quietly"* — and the
   * written-here list was never kept apart from the derived one. It was
   * maintained IN STEP with it until both were `[]`, and the assertion between
   * them passed at every step on the way down. **Both sides are now derived,
   * from `mappers.ts` and from this file, so neither can be pruned by hand at
   * all** — the case carries the history and the measurement.
   */
  it('7.209 every route the refusals name is a route this file really fetches', () => {
    // ⚠ CORRECTED 2026-09-20 — THIS CASE COULD NOT FAIL, and its own docblock
    // left the instruction that let it happen. The "written here" list was not a
    // second measurement; it was a hand-maintained copy of `named`, and each
    // entry left it in the very commit that deleted the absence list naming it:
    //
    //   2026-09-02  six routes  — the file's real coverage, and `named` matched
    //   7bb93cc9    four        — `/v1/projects/:projectId/tickets` and
    //                            `/v1/workspaces/:workspaceId/tickets/:ticketId`
    //                            left with ruling P25 clause 1, and the comment
    //                            here said, in the same breath, "This file still
    //                            fetches both"
    //   b4e2f14e    three       — `/v1/me/workspaces` left with P32/P38
    //   aa17046d    one         — `/v1/contests` and `/v1/me/work` left with
    //                            P39/P40
    //   42fb2f2c    NONE        — `/v1/search` left, and the loop's six names
    //                            became a bare `[]`
    //
    // So the assertion was `[] toEqual []`. And `toEqual` had never had content
    // to lose: it compared a list against its own copy, which can only fail when
    // somebody forgets to update the copy — and the history says nobody ever
    // did, because the update rode along with the work that made it needed. **A
    // measurement and its own mirror agree by construction, and they go on
    // agreeing all the way to zero.**
    //
    // ⚠ MEASURED 2026-09-20: this file still fetches ALL SIX of those routes, so
    // the list did not shrink because coverage did. `named` is read out of
    // `mappers.ts` and `EXERCISED` out of this file, and what is asserted
    // between them is the case's own title — every route the refusals name IS a
    // route this file fetches — which is CONTAINMENT. Equality was never the
    // property the title states; it is the relation the mirror made look true,
    // and it is no longer assertable at all now that `named` is legitimately
    // empty while the file fetches ten routes.
    const mapperSource = readFileSync(APP_CORE_MAPPERS, 'utf8');
    expect(mapperSource, 'online/mappers.ts').toContain('export class ServingGapError');
    // A control on the scan below, in the same file and the same run: `wireRoute`
    // is still a KEY of an `Absence` (three entries carry `null`), so a `named`
    // of zero is a fact about the refusals and not the pattern having quietly
    // stopped matching. The register emptied on 2026-09-19 — that is the reading
    // this case now has to make, and it must not be able to make it by accident.
    expect(mapperSource, 'mappers.ts still declares `wireRoute`').toMatch(/wireRoute: /);
    const named = new Set(
      [...mapperSource.matchAll(/\bwireRoute: '([^']+)'/g)].map(([, route]) => routeShape(route ?? '')),
    );

    // The invariant that ranged over six register names, RE-ARMED rather than
    // deleted: a `wireKey` with no `wireRoute` is a key nothing can ever
    // measure. It has no subject while the register is empty, and `named` being
    // zero is a fact rather than a hole for the reason the control above gives.
    for (const constName of absenceListNames(mapperSource)) {
      for (const absence of mapperAbsences(constName)) {
        expect(
          absence.wireKey === null || absence.wireRoute !== null,
          `${absence.field}: names a wireKey with no wireRoute`,
        ).toBe(true);
      }
    }

    const exercised = routesThisFileFetches();
    const unexercised = [...named].filter((route) => !exercised.includes(route)).sort();
    expect(
      unexercised,
      'a refusal names a route no case here fetches — its `wireKey` can never be measured, so a `wireRoute` pointed at one retires the pin in silence',
    ).toEqual([]);

    // The complement, in the same run: **every** deleted list is GONE from the
    // source rather than emptied. `mapperAbsences` throws on a `const` it cannot
    // find and throws again on one that parses to zero entries, so an entry
    // hollowed to `[]` fails this the same way a surviving one does. That is
    // what stops a closed gap from leaving a refusal nobody can read behind it.
    for (const deleted of [
      'MAP_LIST_VIEW_ABSENCES',
      'MAP_TICKET_READ_ABSENCES',
      'MAP_SEARCH_HITS_ABSENCES',
    ]) {
      expect(() => mapperAbsences(deleted), deleted).toThrow(/no `const/);
    }
  });
});

describe('the stream union — RECONCILED: the client now has a member for every frame the server emits', () => {
  /**
   * 7.197 — the STREAM UNION, reconciled: the server emits `scope-revoked`, the published schema accepts it, and the client union now carries it too. The case stayed and its claim inverted.
   */
  it('the server EMITS `scope-revoked`, the published schema accepts it, and the client union now carries it too', async () => {
    // READ OUT OF SOURCE as text, so a `dist` built from different source cannot
    // decide whether this passes and a change in the package cannot pass
    // unnoticed. A transcribed literal would have done only the first.
    //
    // It read `data-source.ts` until closure 3. That file declared a SECOND
    // stream union, `StreamItem`, and this case's job was to catch the two
    // drifting apart — which they had already done once (`code` was a bare
    // `string` on the client side). Closure 3 deleted the duplicate, so the
    // union is read where it now lives, and the drift this case policed is
    // replaced by the stronger check below: there is nothing left to drift.
    const CLIENT_STREAM_TYPES = clientUnionTags('stream-frames.ts', 'ServerStreamFrame');

    // THE ANTI-DIVERGENCE PIN, newly possible and stronger than what it
    // replaces. `data-source.ts` must RE-EXPORT the union, never redeclare one:
    // a second `export type ... = | { type: '...' }` in that file is how the
    // first divergence happened, and it compiled fine for as long as the two
    // spellings happened to agree. This goes red the day somebody writes a
    // client-local copy again, which no type-level check can catch.
    const dataSource = clientSource('data-source.ts');
    expect(dataSource, 'data-source.ts must re-export the domain union').toContain(
      'export type { ServerStreamFrame }',
    );
    expect(
      /export type \w+ =\s*\|?\s*\{\s*type: '/.test(dataSource),
      'data-source.ts declares a second stream-frame union — closure 3 removed exactly this',
    ).toBe(false);
    // The pin and its own positive control: the union is these SIX members and
    // no others. "Exactly six" is measured here rather than asserted in prose,
    // and the day somebody narrows that union back — or lets it drift ahead of
    // the server — this case goes red, which is the whole point of the file.
    // It was `['event', 'purge', 'caught-up', 'error']` until Plan 6 Task 8, and
    // this line going red is what reported the reconciliation.
    //
    // **`reach-granted` was added by closure 5b(d) (ruling P37.1), and this line
    // going red is again what reported it.** It was the EIGHTH consumer of that
    // union on that branch and the second of two the compiler could not find —
    // the other being `app-core`'s `parseFrame`, which returned `null`. Six of
    // the eight were type errors; the two that were not were both caught by
    // cases like this one, which derive a shape from SOURCE TEXT rather than
    // from a type. That is the argument for this whole file, restated by an
    // event rather than by its docblock.
    expect(CLIENT_STREAM_TYPES).toEqual([
      'event',
      'purge',
      'scope-revoked',
      'reach-granted',
      'caught-up',
      'error',
    ]);

    // Now the server half, through the real path. `visibleEventsFor` is the
    // PRODUCTION generator — the hub's default — and the revocation it reads is
    // the one the owner appended through `POST /v1/events` in `beforeAll`.
    // Nothing about the frame is scripted.
    const hub = createStreamHub({ pool: db.pool, onEventCommitted: () => () => {} });
    const socket = fakeSocket();
    try {
      const outcome = await hub.subscribe(exMember.userId, socket, workspaceId, 0);
      expect(outcome).toBe('subscribed');
      await hub.settled();
    } finally {
      hub.close();
    }

    // Both halves of the recording, because they answer different questions.
    // `frames` is the PARSE — proof `serverStreamFrameSchema`, the schema whose
    // own docblock says it exists because "Plans 6, 9 and 10 mock this
    // protocol", accepts the frame. `raw` is the BYTES — what a client actually
    // receives, and therefore what it actually drops.
    const types = socket.frames.map((frame) => frame.type);
    expect(types).toContain('scope-revoked');
    expect(socket.raw.join('\n')).toContain('"type":"scope-revoked"');
    expect(serverStreamFrameSchema.parse({ type: 'scope-revoked', workspaceId })).toEqual({
      type: 'scope-revoked',
      workspaceId,
    });

    // The reconciliation, asserted as SET EQUALITY between the two unions rather
    // than as the old "they share nothing". The server half is DERIVED from
    // `serverStreamFrameSchema`'s own option list, so a sixth frame added to
    // `ServerStreamFrame` and forgotten on the client lands here as a red case
    // instead of as a frame a client drops.
    //
    // `types` — what this socket actually RECEIVED — is a different question and
    // stays asserted above: the published union is what the client must be able
    // to name, and `types` is proof the server really sends one of them.
    const PUBLISHED_STREAM_TYPES = serverStreamFrameSchema.options.map(
      (option) => option.shape.type.value as string,
    );
    expect([...CLIENT_STREAM_TYPES].sort()).toEqual([...PUBLISHED_STREAM_TYPES].sort());
    // And the specific frame this case is named for is now in BOTH — the
    // positive control on the equality above, which a pair of empty arrays would
    // otherwise satisfy.
    expect(CLIENT_STREAM_TYPES).toContain('scope-revoked');
    expect(PUBLISHED_STREAM_TYPES).toContain('scope-revoked');
    expect(types).toContain('scope-revoked');
  });

  /**
   * 7.198 — the event frame’s envelope carries `workspaceSeq`, and the client’s event member is now typed to hold it.
   */
  it("the event frame's envelope carries `workspaceSeq`, and the client's event member is now typed to hold it", async () => {
    // The client half FIRST, derived from the checked-in source and not from a
    // literal typed here. Until Plan 6 Task 8 this member was
    // `{type: 'event'; envelope: EventEnvelope}`, which has no `workspaceSeq` —
    // and `workspaceSeq` is the field the RESUME protocol is defined in terms of:
    // `subscribe` sends `afterSeq`, `caught-up` reports one, both in workspace-
    // cursor currency. A client typed to `EventEnvelope` could not name the
    // cursor it must send back, so that divergence was a broken resume rather
    // than a cosmetic mismatch.
    //
    // This assertion is the reason this case is not server-only. Its body used to
    // be entirely server-side, so it would have stayed GREEN through the very
    // reconciliation its own title described — a case that cannot notice the
    // thing it is named for. `EventEnvelope` is asserted against by name as the
    // positive control: the pin fails if the member is reverted, not merely if it
    // is renamed to something unexpected.
    // Read from `stream-frames.ts` since closure 3 — see the union case above:
    // the client no longer declares its own copy, so there is one declaration to
    // check and no second one to drift from it. The assertion is unchanged and
    // still the reason this case is not server-only: `LedgerEvent` carries the
    // `workspaceSeq` the cursor is made of and `EventEnvelope` does not, so the
    // `not.toBe` is a pin against a broken resume, not a cosmetic mismatch.
    const CLIENT_EVENT_ENVELOPE = clientUnionMemberFieldType(
      'stream-frames.ts',
      'ServerStreamFrame',
      'event',
      'envelope',
    );
    expect(CLIENT_EVENT_ENVELOPE).toBe('LedgerEvent');
    expect(CLIENT_EVENT_ENVELOPE).not.toBe('EventEnvelope');

    const hub = createStreamHub({ pool: db.pool, onEventCommitted: () => () => {} });
    const socket = fakeSocket();
    try {
      await hub.subscribe(owner.userId, socket, workspaceId, 0);
      await hub.settled();
    } finally {
      hub.close();
    }

    const events = socket.frames.filter((frame) => frame.type === 'event');
    expect(events.length).toBeGreaterThan(0);
    for (const frame of events) {
      expect(frame).toHaveProperty('envelope.workspaceSeq');
      expect(typeof (frame as { envelope: { workspaceSeq: unknown } }).envelope.workspaceSeq).toBe(
        'number',
      );
    }
    // Control, same run: the owner's socket got the `caught-up` whose `seq` is
    // in the SAME workspace-cursor currency, so the two really are one
    // protocol and `workspaceSeq` is the field that joins them.
    const caughtUp = socket.frames.find((frame) => frame.type === 'caught-up');
    expect(caughtUp).toBeDefined();
    const last = events[events.length - 1] as { envelope: { workspaceSeq: number } };
    expect((caughtUp as { seq: number }).seq).toBe(last.envelope.workspaceSeq);
  });

  /**
   * 7.220 — THE PAGING PROTOCOL AGAINST THE REAL ROUTE (ruling P41, Door B).
   *
   * `getTickets` now pages to exhaustion, and every case proving that lives in
   * `packages/app-core` against a FAKE fetch. A fake proves the loop is
   * internally consistent with whatever protocol the fake implements — and an
   * earlier draft of that helper implemented the cursor as a PAGE INDEX, which
   * no server does. **That is this series' signature failure stated exactly: a
   * mocked contract is the thing that excuses the server from existing.**
   *
   * So this case runs the REAL mapper over the REAL route, twice, and carries
   * the server's own cursor between the two requests. It proves the three
   * things no fixture can: that `/v1/projects/:id/tickets` ACCEPTS `cursor` on
   * this path, that the value `mapListPage` hands back is the value the route
   * RESOLVES, and that it ADVANCES rather than re-serving page one.
   *
   * `limit=1` rather than 51 seeded tickets: the route pages at `limit + 1` and
   * emits the last id of the page, so the protocol is identical at any size and
   * two tickets are enough to have a boundary. (`listQueryString` never sends
   * `limit`, so the shipped loop always runs at `DEFAULT_LIMIT`; this asks the
   * route directly for the same reason 7.213 does — the mapper is the unit
   * under test, not the query builder.)
   */
  it('7.220 the REAL route pages and the REAL mapper carries its cursor — two requests, disjoint', async () => {
    const first = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets?groupBy=flat&limit=1`,
      headers: owner.headers,
    });
    expect(first.statusCode).toBe(200);

    // THE ROUND TRIP, not a key-set assertion: `mapListPage` executes against
    // the real bytes, so a rename on either side fails here with the mapper's
    // own message naming the field.
    const pageOne = mapListPage(first.json());

    // The precondition, asserted rather than assumed. If the fixture project
    // held one ticket the cursor would be null and every assertion below would
    // be vacuous while passing — the exact shape this file found at 7.207.
    expect(pageOne.nextCursor, 'the fixture project must hold more than one ticket').not.toBeNull();
    expect(pageOne.rows).toHaveLength(1);

    // The cursor is the LAST ID OF THE PAGE — the route's own contract
    // (`t.ticket_id > $n`, `nextCursor` = last row of the page). Pinning the
    // VALUE, not just its presence, is what makes the fake's keyset semantics
    // a claim about this server rather than about the fake.
    expect(pageOne.nextCursor).toBe(pageOne.rows[0]?.ticketId);

    const second = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/tickets?groupBy=flat&limit=1&cursor=${encodeURIComponent(pageOne.nextCursor ?? '')}`,
      headers: owner.headers,
    });
    expect(second.statusCode).toBe(200);
    const pageTwo = mapListPage(second.json());

    // IT ADVANCED. A route that ignored the cursor would answer page one again
    // and this is the line that catches it — the single most important
    // assertion in the case, because a silently-ignored cursor makes the
    // shipped loop spin until it hits the cap and then REFUSE a project that
    // is perfectly small.
    expect(pageTwo.rows).toHaveLength(1);
    expect(pageTwo.rows[0]?.ticketId).not.toBe(pageOne.rows[0]?.ticketId);
    // And forward, in the route's own ordering, so "different" cannot be
    // satisfied by an arbitrary reshuffle.
    expect(pageTwo.rows[0]?.ticketId.localeCompare(pageOne.rows[0]?.ticketId ?? '')).toBeGreaterThan(0);
  });
});
