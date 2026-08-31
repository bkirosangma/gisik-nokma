# Task 3 report — membership & visibility vocabulary + three envelope amendments

**Status:** DONE_WITH_CONCERNS (concerns are interpretive calls and downstream consequences, not defects)
**Branch:** `exec/04-auth-visibility`  **Commit:** `6f8d0e7`
**Verification:** `pnpm turbo run build test typecheck` → 15/15 tasks successful.
domain 205 · rule-engine 115 · server 93 · ui 31 · app-core 5.

---

## 1. What was built, file by file

### `packages/domain/src/ids.ts` (modified)
Adds `MEMBERSHIP_ID_REGEX`, **composed from `ULID_REGEX.source`** rather than hand-spelled:

```ts
const ULID_BODY = ULID_REGEX.source.replace(/^\^/, '').replace(/\$$/, '');
export const MEMBERSHIP_ID_REGEX = new RegExp(`^${ULID_BODY}:${ULID_BODY}$`);
```

`ULID_REGEX` itself is untouched, byte-for-byte. The adaptation map's §7 sketch hand-spelled the
composite; the brief's composition rule overrides it, and a test asserts the composition literally
(`MEMBERSHIP_ID_REGEX.source === `^${body}:${body}$``) so a future hand-spelling fails.

### `packages/domain/src/envelope.ts` (modified — all three amendments)
1. **`ENTITY_KINDS` gains `'invite'`**, appended seventh, with a comment stating why it lands in Task 3
   and why it is inert (every registration names its `entityKind`; `parseEvent` refuses a type filed
   against a kind it did not declare, so nothing can carry `invite` until T14 registers the types).
2. **`entitySchema`** — a `superRefine` branching on `kind`: `membership` → `MEMBERSHIP_ID_REGEX`,
   every other kind → `ULID_REGEX` with `'must be a ULID'` unchanged. `EventEnvelope` the *type* is
   untouched.
3. **`requiredPayload`** — `z.unknown().refine(v => v !== undefined, …)`.
4. **`refuseMisfiledMembership`** — the workspace half of the coherence check, a cross-field
   refinement.
5. **Structural change forced by (4):** a cross-field refinement makes the exported schema a
   `ZodEffects`, and `ZodEffects` has no `.extend`. Both exported schemas are now built from a shared
   private `submittedEventObject`, each `.superRefine`d. `eventEnvelopeSchema` is still
   `submittedEventObject.extend({serverTime, seq})` — the derivation survives, only the route changed.
   Verified by grep that every consumer of both schemas uses `safeParse` only.

### `packages/domain/src/parse-event.ts` (modified)
The **user half** of the coherence check, after payload validation: for `entity.kind === 'membership'`,
`entity.id` must equal `membershipId(workspaceId, payload.userId)`. Two refusals (payload names no
user / names a different one), both `code: 'malformed-envelope'`. Plus a private `readUserId` helper.

### `packages/domain/src/events/membership.ts` (new)
Zod schemas + inferred types: `workspaceCreatedPayload`, `workspaceRenamedPayload`,
`projectCreatedPayload`, `membershipGrantedPayload`, `membershipRevokedPayload`,
`projectMemberAddedPayload`, `projectMemberRemovedPayload`; plus `WORKSPACE_ROLES`,
`workspaceRoleSchema`, and a private `displayName`. No registrations (adaptation §3).

### `packages/domain/src/events/visibility.ts` (new)
`VISIBILITY_MODES`, `VisibilityMode`, `visibilitySetPayload` (`.strict().superRefine(...)`),
`VisibilitySetPayload`.

### `packages/domain/src/vocabulary.ts` (modified)
PROVISIONAL comment retired and replaced with the takeover statement. `workspace.created` and
`workspace.renamed` re-pointed at the new named schemas (**not** re-registered — `register` throws on
a duplicate `type@version`). **Six** new registrations added: `project.created`,
`membership.granted`, `membership.revoked`, `project.member_added`, `project.member_removed`,
`visibility.set`. The now-unused `import { z }` was removed.

### `packages/domain/src/index.ts` (modified)
`export * from './events/membership.js';` and `'./events/visibility.js';`.

### Tests
| File | Tests | Note |
|---|---|---|
| `test/events/membership.test.ts` (new) | 23 | brief's 14 blocks mapped 1:1, plus 9 |
| `test/events/visibility.test.ts` (new) | 10 | brief's 6 blocks mapped 1:1, plus 4 |
| `test/envelope.test.ts` | 21 → 33 | 12 new across the three amendments |
| `test/parse-event.test.ts` | 10 → 15 | 5 new for the user half |
| `test/ids.test.ts` | 3 → 6 | 3 new for `MEMBERSHIP_ID_REGEX` |

Domain 152 → 205.

### Docs (same commit — the SDD workspace is gitignored)
- `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — amendment 3 added with the probe
  matrix; a **LANDED 2026-08-28** block records what actually shipped for all three, the two-halves
  design, the ULID-user-id consequence, and the test design. The existing owner ratification was
  **read first and not restated** (the doc itself warns duplication is drift).
- `docs/superpowers/plans/2026-08-20-04-auth-visibility.md` — Global Constraints entity-kind line now
  includes `'invite'` and states the membership id exception; the "13 tests" and "19 new tests" counts
  corrected in place with the reason.

---

## 2. Refusal messages — complete list, with every wording change and why

The plan pinned ~18 strings written for **throwing parsers**. The shipped registry takes **zod
schemas**, so a message is now an *issue message at a path*, and `parseEvent` composes the sentence:
`payload for '<type>' v<version> is invalid at <path>: <message>`. Transcribing the plan's strings
verbatim into every issue would have restated the event type and the field name that the wrapper
already supplies. The rule applied: **zod defaults for structural failures (which the shipped
`envelope.test.ts` already asserts as its house style), custom messages only where meaning would be
lost.** Every custom message is asserted character-for-character.

### Preserved verbatim (the three that carry semantic content)
| Where | Message | Kept because |
|---|---|---|
| `membership.granted` `scope` | `membership.granted no longer takes a scope; use project.member_added to put someone on a project` | pinned across plans; says where to go instead |
| `membership.revoked` `scope` | `membership.revoked no longer takes a scope; use project.member_removed to take someone off a project` | same |
| `visibility.set` explicit | `visibility.set with explicit mode requires a non-empty userIds list` | pinned; the audience-of-nobody argument |
| `visibility.set` non-explicit | `visibility.set with mode '<mode>' must not carry userIds` | pinned; names the contradicted mode |

Cosmetic consequence, reported rather than fixed: through `parseEvent` the scope refusal reads
`payload for 'membership.granted' v1 is invalid at scope: membership.granted no longer takes a
scope; …` — the type name appears twice. I kept the pinned string because it is cross-plan and
greppable; trimming it would have made the sentence read better and the string unfindable.

### Adapted, meaning preserved
| Plan's string | Now | Why |
|---|---|---|
| `'project.member_added payload requires a boolean projectAdmin'` | `is required — a project-admin flag is a claim, not a default` (at `projectAdmin`, both `required_error` and `invalid_type_error`) | the *argument* is what mattered; the type and field are already in the wrapper |
| `'…payload requires a non-empty name'` (whitespace case) | `must not be blank — a name of only spaces names nothing` (at `name`) | the plan's `.trim() === ''` check is **kept** (see departure 5); the message states the reason |
| n/a (new) | `is required — an event with no payload is not a claim` (at `payload`) | amendment 3 |
| n/a (new) | `must be a membership entity id — workspaceId:userId, two ULIDs joined by a colon` (at `entity.id`) | amendment 1 shape |
| n/a (new) | `must name this event's own workspace — a membership entity id is workspaceId:userId` (at `entity.id`) | amendment 1, workspace half |
| n/a (new) | `This membership event is filed at entity '<id>', but it is about user '<userId>' in workspace '<ws>' — a membership's entity id is workspaceId:userId. Filing it anywhere else starts a second stream for the same person.` | amendment 1, user half |
| n/a (new) | `This membership event is filed at entity '<id>' but its payload names no user — a membership's entity id is workspaceId:userId, so an event that does not say who it is about cannot be addressed at all.` | amendment 1, user half, no-userId branch |

### Replaced by zod defaults (structural; no meaning lost)
| Plan's string | Now |
|---|---|
| `'<type> payload requires a non-empty <field>'` (missing) | `Required` at that field |
| `'<type> payload requires a non-empty <field>'` (empty string) | `String must contain at least 1 character(s)` |
| `'<type> payload requires …'` (not a record) | `Expected object, received null` / `received string` at `[]` |
| `"membership.granted payload requires role 'owner'\|'admin'\|'member'\|'guest'"` | `Invalid enum value. Expected 'owner' \| 'admin' \| 'member' \| 'guest', received 'superuser'` |
| `"visibility.set payload requires mode 'workspace'\|…"` | `Invalid enum value. Expected 'workspace' \| 'project' \| 'explicit' \| 'inherit', received 'secret'` |
| `'visibility.set payload requires a non-empty ticketId'` (non-ULID) | `must be a ULID` at `ticketId` |

The two enum defaults enumerate the vocabulary exactly as the plan's strings did, and match the
assertions `envelope.test.ts` already makes for `origin` and `entity.kind`.

### The `scope` mechanism — a deliberate choice worth flagging
`.strict()` alone answers `Unrecognized key(s) in object: 'scope'` — true and useless. Setting
`.strict(message)` would have applied the scope sentence to *every* unknown key, which would lie.
`scope` is therefore **declared** as `z.never({invalid_type_error: <pinned string>}).optional()`:
absent → fine, present in any shape → the pinned sentence at path `['scope']`, and `.strict()` still
catches every other unknown key generically. A test asserts that a *different* stray key
(`colour`) still gets the generic message, so the declaration cannot silently become a blanket.
`scope` is stripped from the exported types via `Omit<…, 'scope'>` so the produced interfaces match
the brief's `{userId, role}` / `{userId}` exactly.

---

## 3. Falsifiability evidence

Every mutation was applied to production source in the shape production uses, the relevant test file
run, then restored with `git checkout --` and the restoration **verified with `git diff --exit-code`
and a final `git status --porcelain`** (empty). No shell `diff` was used anywhere.

| # | Mutation | Failing assertion(s) |
|---|---|---|
| M1 | membership branch deleted from `entitySchema` | `accepts a membership's composite entity id`; `refuses a membership entity id that is a bare ULID`; all 4 parse-event membership tests |
| M2b | exception widened to `'ticket'` as well | `every OTHER kind still refuses a composite, byte-for-byte as before` — *isolated*: `AssertionError: expected true to be false` |
| M3 | workspace-prefix half disabled | `refuses a composite naming a DIFFERENT workspace`; `eventEnvelopeSchema inherits both membership checks` |
| M4 | **user half implemented as prefix-only — the exact half-done failure mode the brief warns about** | `refuses an id naming a DIFFERENT user than the payload grants`; the `membership.revoked` twin. The no-user test still passes, proving the two branches are independently guarded |
| M5 | missing `userId` coerced to `''` instead of refused | `refuses a membership event whose payload names no user at all` |
| M6 | `'invite'` removed from `ENTITY_KINDS` | `accepts an invite entity`; `lists exactly the seven kinds`; `refuses an unknown entity kind` (enum message) |
| M7 | `payload` reverted to bare `z.unknown()` | `refuses an absent payload`; `refuses an explicitly undefined payload`; `eventEnvelopeSchema inherits the requirement` — and **the `null` and `{}` acceptances stayed green**, which is the point |
| M8 | `MEMBERSHIP_ID_REGEX` hand-spelled `[0-9A-Z]{26}` | `is composed from ULID_REGEX rather than re-spelled`; `refuses … a non-ULID half` (the `ILOU` case) |
| M9 | `membership.granted` scope left to `.strict()` | `refuses a scope, rather than ignoring one` (message assertion) |
| M10 | `membership.revoked` scope silently ignored | `refuses a scope, rather than ignoring one` |
| M11 | blank-name refinement neutered | `refuses a name of only spaces…`; `workspaceRenamedPayload accepts … refuses a blank one` |
| M12b | `projectAdmin` defaulted to `false` | `refuses a missing projectAdmin flag`; `refuses a non-boolean projectAdmin` |
| M13 | membership `userId` loosened to `z.string().min(1)` | `refuses a userId that is not a ULID` |
| M14 | explicit-mode `userIds` requirement removed | `refuses explicit mode without userIds` |
| M15 | `userIds` tolerated on non-explicit modes | `refuses userIds on non-explicit modes` |

**One mutation initially produced no failures and was NOT accepted as evidence.** The first M12 wrote
`z.optional(z.boolean)({…})`, which is invalid at module load: the file failed to import and vitest
recorded zero assertion results — the setup-failure trap. It was re-run as M12b with a valid,
realistic mutation (`.optional().default(false)`), which fails at the two intended assertions.

**Isolation, deliberately designed.** The prefix half and the user half mask each other through
`parseEvent` (full equality subsumes the prefix). So the workspace half is asserted against
`submittedEventSchema` **directly**, and the user half through `parseEvent` with **prefix-correct,
user-wrong** ids. M3 and M4 confirm each fails alone.

---

## 4. Departures from the brief, each with its justification

1. **The user half of the coherence check is in `packages/domain/src/parse-event.ts`, not where Task 9
   puts its `visibility.set` twin.** *This is the one interpretive call and the reviewer should check
   it.* Task 9's check lives in `apps/server/src/permissions/…checkVisibilityPermission`, a file that
   does not exist and is not Task 3's to create — creating it would cause exactly the cross-lane churn
   this task exists to prevent. `parse-event.ts` is the only home in this task with a parsed payload,
   and it is strictly stronger: the offline replica and the client enter through the same door. If the
   coordinator intended a permission-layer home, Task 9 can relocate it; nothing else depends on the
   location.
2. **Its refusal reuses `code: 'malformed-envelope'` rather than adding an `EnvelopeErrorCode`
   member.** `IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id'` is consumed by Plans 6 and
   10; widening it is a cross-plan ripple for a refusal that is honestly a malformed envelope (the
   entity id contradicts the event's own content). Blast-radius call, easily reversed.
3. **No `parse*` functions exist.** The brief's produced interface lists seven
   `(payload: unknown) => Payload` throwing parsers. Adaptation map §3 (binding) rules the registry
   takes zod schemas; hand-written parsers would be a second, unregistered validator. Schemas +
   `z.infer` types are exported instead. All nine payload *types* the brief names are produced under
   their exact names; `WorkspaceRole` and `VisibilityMode` likewise (`WorkspaceRole` is imported from
   the shipped `entity-state.ts`, not redefined — adaptation §6).
4. **Six registrations, not seven.** `workspace.created` was already registered by Plan 1 and is
   taken over; `register` throws on a duplicate. `workspace.renamed` is also taken over, which the
   brief implies and the plan text does not list — so `workspaceRenamedPayload` is a small addition
   beyond the brief's produced list, made so the takeover is complete and `vocabulary.ts` holds no
   inline schemas.
5. **Every user id, ticket id and explicit-audience id is `ulidString`.** For membership this is
   *forced*, not chosen: the ratified composite regex admits `^<ULID>:<ULID>$`, so a grant naming
   `usr_1` could never be filed at an id the door accepts. The project roster and `visibility.set`
   follow for consistency. This is stricter than `ticketCollaboratorPayload`'s `z.string().min(1)` and
   than the plan's `usr_1`/`tkt_1` fixtures — which adaptation §8 says the door refuses anyway.
   **Downstream consequence: better-auth must mint ULID user ids.** That is now a constraint on Task
   1, recorded in the coordination doc.
6. **Blank names are refused, not trimmed.** The plan's `requireNonEmptyString` used
   `value.trim() === ''`; the shipped `z.string().min(1)` on `workspace.created` accepts `'   '`.
   Taking the type over means adopting the plan's stricter shape, so a shared `displayName` refines
   on `trim()`. It **refuses rather than trims** — the ledger stores the claim as made, and a test
   asserts `'  Corner  '` survives verbatim.
7. **Test files carry more blocks than the plan states, and none were removed.**
   `membership.test.ts`: the plan says 13, its own Step-1 listing has 14, and 23 shipped.
   `visibility.test.ts`: 6 stated, 6 in the listing, 10 shipped. Counts corrected in the committed
   plan doc per the literal-block-count rule.
8. **`test/events/` subdirectory** (brief + extract-A agree) rather than the flat `test/` the shipped
   `ticket-events.test.ts` uses. Both are collected by `include: ['test/**/*.test.ts']`.
9. **The commit message is prose, not the plan's pinned Step-9 string.** extract-A pins
   *"Membership and visibility claims parse at the door: seven event types the ledger can replay…"*
   verbatim. The working rules mandate prose commit messages and override the plan text; and the
   pinned string is now factually wrong — six registrations were added, and the seventh type was a
   takeover, not a new registration.
10. **Environment, not code:** `packages/ui` and `packages/app-core` had no `node_modules` in this
   worktree and their turbo tasks failed before any of my changes. Fixed with
   `pnpm install --frozen-lockfile`; `pnpm-lock.yaml` is unmodified.

---

## 5. Things checked so nobody re-checks them

- `events.entity_id` and `proj_entity_heads.entity_id` are plain `text` with no CHECK constraint, so
  the 53-char composite id and the new `invite` kind need no migration.
- Zod aborts (does not run) an object-level `superRefine` when a required inner key is missing or the
  wrong type — probed. `refuseMisfiledMembership` therefore cannot see an undefined `entity` or
  `workspaceId` and needs no defensive guard.
- `scope: undefined` (the key present with an explicit undefined) is *accepted*. JSON cannot carry
  `undefined`, so no client can send it; not chased.
- `EventEnvelope`, `SubmittedEvent`, `ENTITY_WORKSPACE_MISMATCH_RULE`, `LedgerEvent` and the
  `Refusal`-lives-in-rule-engine ruling were all read from shipped code, not from the plan.
- `Features.md` / `test-cases/` deliberately untouched — a later task creates section 6.

---

## 6. Exact verification command and output

```
$ export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
$ pnpm turbo run build test typecheck
@gisik-nokma/rule-engine:test:  Test Files  4 passed (4)
@gisik-nokma/rule-engine:test:       Tests  115 passed (115)
@gisik-nokma/domain:test:  Test Files  14 passed (14)
@gisik-nokma/domain:test:       Tests  205 passed (205)
@gisik-nokma/app-core:test:  Test Files  1 passed (1)
@gisik-nokma/app-core:test:       Tests  5 passed (5)
@gisik-nokma/ui:test:  Test Files  3 passed (3)
@gisik-nokma/ui:test:       Tests  31 passed (31)
@gisik-nokma/server:test:  Test Files  14 passed (14)
@gisik-nokma/server:test:       Tests  93 passed (93)
 Tasks:    15 successful, 15 total
```

Per-file assertion-level evidence was taken with
`node ./node_modules/vitest/vitest.mjs run <file>` from `packages/domain/`, never `pnpm test`
(the shell proxy collapses it to a bare PASS/FAIL summary).

---

# Fix round 1 — review findings addressed (doc + comment only, no behaviour change)

**Rebase:** branch rebased onto `main` at `974fb9a` (T1 merged). My Task 3 commit is now `5cd2e5c`
(was `6f8d0e7`). Gate re-verified **before** editing: 15/15, and again after. Server is 17 files /
102 tests now (T1's three new files); domain unchanged at 205.

Both Important findings are the same shape — a real cross-plan constraint that exists in the code and
nowhere in the durable record. Neither is a code defect, and no production behaviour changed.

## IMPORTANT 1 — `eventEnvelopeSchema` carries only half the coherence check

**Verified against the built package before documenting it**, rather than taking the claim on:

| input | `submittedEventSchema` | `eventEnvelopeSchema` | `parseEvent` |
|---|---|---|---|
| membership in wsA, filed `A:userC`, payload grants **userD** | **accepts** | **accepts** | `malformed-envelope` |
| membership in wsA, filed **wsB**`:userD`, payload grants userD | refuses | refuses | `malformed-envelope` |

**One correction to the finding, and it widens it:** the gap is in **both** exported schemas, not only
`eventEnvelopeSchema`. Neither can see a parsed payload, so neither can carry the user half. The review
named `eventEnvelopeSchema` because that is what a sync-down reader reaches for — but a consumer of
`submittedEventSchema` inherits exactly the same half-check. Documenting only the full-envelope one
would have left the other silent, so both are covered.

Fixed in the two places asked for:
- **`packages/domain/src/envelope.ts`** — a comment above `submittedEventSchema`: what they enforce,
  what they do not, *why* the user half cannot live there (it needs the type, version and registered
  schema to parse the payload, none of them knowable where `payload` is `unknown` by design), the
  concrete envelope that passes silently, and the rule in one line: **to validate an event, call
  `parseEvent`** — these are the shape layer underneath it, not a substitute for it.
  **Corrected in round 2:** a single comment there was NOT "where someone reaching for either looks."
  A doc comment binds to the one declaration beneath it, so `eventEnvelopeSchema` — 78 lines later in
  the emitted `.d.ts`, and the export the finding was actually about — surfaced nothing on hover. The
  note is now duplicated above both exports. See round 2 below.
- **Coordination doc §6**, first item, with the table above and the note that zero production consumers
  validate a bare envelope today, so the hazard is the *first* one that does.

## IMPORTANT 2 — the user half's forward constraint on future membership-kind event types

Coordination doc §6, second item: any future `membership`-kind event type **must carry a top-level
string `userId`**, because the check is written against the KIND, not the two types that exist. Stated
with the reason (a membership's entity id *is* `${workspaceId}:${userId}`, so an event that does not say
who it is about cannot be addressed at all) and with why per-kind beats per-type (a per-type check would
let the next membership type inherit the hole rather than meet the refusal). Named for T14 and Plan 10
specifically, since those are the authors who would add one, and it says what to do instead: name the
user in a top-level `userId`, or file against a different kind — satisfying the entity-id regex is not
enough. Notes that the branch is reachable and tested via `parseEvent`'s injectable registry.

## Also added — the blank-name tightening

Coordination doc §6, third item. It was missing while the ULID-user-id consequence was present, and it
changes a **Plan-1-owned type other lanes already use**. Recorded with the distinction the review
identified as the interesting half: `workspace.created` / `workspace.renamed` / `project.created`
**refuse rather than trim** — `'  Corner  '` is stored exactly as claimed, and a test pins that.
Trimming would have been the obvious implementation and would put words in the actor's mouth.

**The closing sentence of this item as first written was false three ways and is retracted** — see
round 2 below. It claimed a fixture with a padded name "now fails where it used to pass": padded names
are accepted (contradicting this very paragraph two lines up), no such fixture exists, and it pointed
at `envelope.ts` when the door is `displayName` in `events/membership.ts`.

## Deferred as instructed — recorded, not fixed

The six minors go to the final whole-branch review: the `invalid_string` → `custom` issue-code drift and
the issue-count drift (both unobservable through `parseEvent`, which reads `issues[0]`); the scope-only
`membership.revoked` ordering (the realistic stale-client shape `{userId, role, scope}` does surface the
pinned sentence); and the three stale statements in files I did not touch — `engine-context.ts:11`'s
kind enumeration, `Features.md:22`'s "provisional seed vocabulary", and the plan's Step-9 commit string.
Scope was not widened to chase any of them.

## Verification

```
$ pnpm turbo run build test typecheck
@gisik-nokma/domain:test:       Tests  205 passed (205)
@gisik-nokma/rule-engine:test:  Tests  115 passed (115)
@gisik-nokma/server:test:       Tests  102 passed (102)
@gisik-nokma/ui:test:           Tests  31 passed (31)
@gisik-nokma/app-core:test:     Tests  5 passed (5)
 Tasks:    15 successful, 15 total
```

Doc-and-comment round, so no test changed and none was expected to. The falsifiability evidence from
the original round stands unaltered — no guarded code was touched.

---

# Fix round 2 — two problems the round-1 fix introduced (doc + comment only)

Both were mine, both were prose, and both were confidently wrong. Per the standing instruction, **every
sentence below that asserts something happens was run before it was written**, and the two claims I
carried over from round 1 without re-running were the two that were false.

## IMPORTANT — the last sentence of §6 was false three ways

> *"Sibling lanes rebasing onto `envelope.ts` inherit this door too, and a fixture with a padded
> workspace name now fails where it used to pass."*

Retracted and replaced. Each defect confirmed by running it, not by re-reading:

| claim | what I ran | result |
|---|---|---|
| a padded name fails | `workspaceCreatedPayload.safeParse({name:'  Corner  '})` | **ACCEPT**, stored `'  Corner  '` verbatim. Only `'   '` and `''` are refused. My own paragraph said so two lines earlier — the item contradicted itself |
| such a fixture exists | grep of `apps/server/test`, `packages/domain/test`, `packages/rule-engine` | every `workspace.created`/`renamed` payload carries a real name (`'Convenience Corner'`, `'Gisik Nokma Build'`, `'Personal'`, `'CC HQ'`, `'Corner HQ'`, …); **no `project.created` fixtures exist at all**. Nothing "now fails" |
| the door is in `envelope.ts` | grep for `trim()` in `packages/domain/src` | the door is `displayName` at **`events/membership.ts:41`**, bound to all three types via `vocabulary.ts`. `envelope.ts` has nothing to do with it — a later author following that sentence would have found no trace of the refusal |

The item now says the true thing: three types refuse a **whitespace-only** name, the door lives in
`events/membership.ts`, padding is explicitly *not* the defect (with the three run results quoted), and
**no existing fixture is affected** — what a rebasing lane inherits is the door, not a breakage. The
identical sentence in this report (§"Also added") is retracted in place rather than silently edited, so
the record shows it was wrong rather than appearing never to have been written.

## IMPORTANT — the round-1 comment bound to `submittedEventSchema` only

A `/** */` block binds to the **one** declaration beneath it. Mine sat above `submittedEventSchema`,
so `eventEnvelopeSchema` — the export the original finding singled out as "what a sync-down reader
reaches for" — carried nothing. Confirmed in the emitted declarations consumers actually read, before
and after:

```
before:  dist/envelope.d.ts:64  (note)   :84 submittedEventSchema   :162 eventEnvelopeSchema  ← no comment
after:   dist/envelope.d.ts:81  (note)   :84 submittedEventSchema
         dist/envelope.d.ts:177 (note)  :181 eventEnvelopeSchema
         $ grep -c "If you are validating an event, call" dist/envelope.d.ts → 2
```

The load-bearing content is now duplicated above `eventEnvelopeSchema`, with a line saying *why* it is
duplicated rather than referenced, so nobody deletes it as redundant. The two claims that the comment
sat "where someone reaching for either looks" — §6 and this report — are corrected to describe what was
actually done; both now note that this was the round-1 defect.

**A number I had to fix in my own correction.** The first draft of both passages said the declarations
are "78 lines apart" — the *pre-fix* measurement. Adding the second comment moved it to 97, so the figure
was stale the moment I wrote it. Both now describe the cause (the whole inlined shape of the first export
sits between them) instead of pinning a count that drifts.

## Two precision corrections folded in

- **`entity.id`'s "right half" → full equality.** `parse-event.ts:128` is
  `entity.id !== membershipId(workspaceId, userId)` — full equality, which re-proves the workspace half
  as a by-product. "Right half" understated the coverage, and the doc's own test-design bullet is precise
  about exactly this, so two passages described one line differently. §6 now states the full-equality
  shape and cross-references the test-design bullet, since that shape is *why* the two halves must be
  asserted through different doors.
- **"whatever its type" → the refusal a caller actually meets.** Run: `membership.granted` with
  `{role}` and `membership.revoked` with `{}` both answer **`invalid-payload`** —
  *"payload for '…' v1 is invalid at userId: Required"* — because their schemas require
  `userId: ulidString` and the payload gate runs first. The `malformed-envelope` sentence is exact only
  for a **future** membership-kind type whose own schema does not require `userId`, which is the case the
  by-kind check exists for. §6 now says both, and which to expect while the shipped two are the only ones.

## One round-1 claim re-verified rather than assumed

§6 says *"zero production consumers validate a bare envelope today (`parse-event.ts` is the only
caller)"*. T1 merged new server code between round 1 and round 2, so that claim could have gone stale.
Re-grepped across `packages` and `apps`: `parse-event.ts:35` is still the only `.safeParse` call site;
the only other source hit is a comment in `testing.ts`. The claim holds.

## Verification

```
$ pnpm turbo run build test typecheck
@gisik-nokma/domain:test:       Tests  205 passed (205)
@gisik-nokma/rule-engine:test:  Tests  115 passed (115)
@gisik-nokma/server:test:       Tests  102 passed (102)
@gisik-nokma/ui:test:           Tests  31 passed (31)
@gisik-nokma/app-core:test:     Tests  5 passed (5)
 Tasks:    15 successful, 15 total
```

No test changed and none was expected to; no guarded code was touched, so the falsifiability evidence
from the original round stands. **The pattern named in the review is accepted:** four prose claims on
this branch have now explained why something was safe and been false, each caught by running the
mechanism rather than reading it. In a docs round the prose is the deliverable, and it gets the same
"run it or do not assert it" treatment the code does.
