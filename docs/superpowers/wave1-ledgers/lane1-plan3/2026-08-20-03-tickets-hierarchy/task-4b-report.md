# Task 4b report — `require-different-user` fails closed, and reads the `seq` it was given

**Status: DONE.** Branch `exec/03-tickets-hierarchy`, one commit: **`7e9854f`** (parent `1417a4d`).
Gate: `pnpm turbo run build test typecheck` → **15/15 tasks successful**; `packages/rule-engine`
alone → **140 tests, 0 failures**; fixture suite **62 fixtures + the count gate = 63 blocks green**.

---

## What changed

Seven files, one commit.

| File | Change |
|---|---|
| `packages/rule-engine/src/rules/require-different-user.ts` | R1 (fail closed), R1a (comment rewrite), R2 (`seq` sort on a copy), header doc-comment updated |
| `packages/rule-engine/test/require-different-user.test.ts` | **NEW** — 5 unit tests (the file did not exist; RDU had only fixtures) |
| `packages/rule-engine/fixtures/rule-rdu-refuses-a-history-it-cannot-read.json` | **NEW** — the end-to-end fixture |
| `packages/rule-engine/test/fixtures.test.ts` | count gate **61 → 62**, in the `toHaveLength` AND the `it` title (both carry the number) |
| `docs/superpowers/plans/2026-08-20-00-series-coordination.md` | Plan 2 consequences **§3** and **§4** discharged |
| `Features.md` | §4 "Rule engine" bullet describes fail-closed + `seq` ordering; "Planted-defect fixture suite" 61 → 62 |
| `test-cases/04-workflow-engine.md` | cases **4.52** (fail-closed) and **4.53** (`seq` order), both ✅ |

### R1 — fail closed

`if (!resolved.ok) continue;` is replaced by a refusal carrying
`REFUSAL_RULES.requireDifferentUser` (the string `require-different-user`, not a sixth id) and the
pinned reason, templated on `rule.thanActorOf.to` exactly as the accepting path's is. It returns on
the **first** unresolvable candidate entry rather than finishing the loop. Guard 1
(`entry.workflowId !== input.ticket.workflowId`) is untouched and still runs before any resolution.

### R1a — the comment

The old block (lines 51–55) is gone. Its replacement states what the code does, then why the old
justification died: it rested on the ticket's and the entry's `workflowVersion` coinciding, and
refresh-on-publish makes them diverge routinely (ticket folds latest→latest as a no-op while an old
entry walks the whole chain). It also names the "first unresolvable wins" reasoning at that site, and
carries the coordination-doc citation so the decision is legible as a decision. The file's header
doc-comment gained a paragraph saying both properties are *established* by the loop, not inherited.

### R2 — order by `seq`

`const ordered = [...input.ticket.transitions].sort((a, b) => a.seq - b.seq);` — a copy, ascending.
The `// Iterating oldest-first …` comment is replaced by one saying the ordering is established here,
why a copy, and what the unread `seq` field left resting on a projection's append order. The
match line now reads `// Overwriting as we go leaves the LAST match in \`seq\` order standing.`

---

## A correction to the coordination doc's own §3 analysis

Recorded in the discharge note, and worth surfacing here because it is a finding, not a restatement:

**§3's precondition was weaker than §3 credited, even at EQUAL versions.** §3 argues that while the
ticket's version and the entry's version coincide, "any break the entry hits, the ticket hits first."
That is not so. The ticket walks the **one** id it currently sits in; an entry walks its own recorded
id. A version that drops some *other* state without mapping it strands that entry while the ticket
resolves cleanly — same version, no divergence needed. Publishing refuses unmapped drops, so this too
is only reachable through a planted or corrupted store, which is the same argument §3 makes and the
same answer: fail closed. It matters here for one practical reason: **it is what made the end-to-end
fixture expressible** (see below).

---

## Tests

`packages/rule-engine/test/require-different-user.test.ts` — 5 `it` blocks, all new. Helpers are
modelled on `test/version-map.test.ts` (three-version chain, `getWorkflowDef`-by-number context, a
`ticketWith` in the shape of its `ticketAt`) rather than on `memory-context.ts`, per the dispatch.
Envelopes come from the shipped `makeEnvelope`. No casts anywhere; the rule literals are `as const`
object literals that satisfy `Extract<Rule, { kind: 'require-different-user' }>` structurally.

1. **fail-closed, the divergence shape.** Ticket at v3 (folds v3→v3 as a no-op), one entry recorded
   at v1, v2 absent from the context. The test first asserts `resolveCurrentStateId(ticket, v3, ctx)`
   resolves `{ ok: true, stateId: 'review' }` — the premise is asserted, not assumed, so the refusal
   is provably four-eyes' own and not `stranded-state` arriving first. The acting user is a third
   person, so the pre-change code accepts cleanly. Asserts the full verdict with the reason as a
   **literal string**, character-for-character against the brief's pinned interpolated example:
   `This step needs a second person, and this ticket's history cannot be read against its current workflow, so who last performed the move to "done" is unknown. Ask an admin to check this workflow's version history.`
2. **first unreadable entry wins.** An unreadable entry at `seq 2` and a resolvable, matching entry
   at `seq 5` naming a third person. A loop that ran to the end would accept.
3. **guard 1 regression.** A foreign-workflow entry that *would strand if walked* (v2 missing), so
   the test pins the ORDER of the two guards, not merely the skip. Expects `{ refused: false }`.
4. **`seq` order.** Two entries matching the watched state; array order `[seq 9, seq 2]` contradicts
   `seq` order; the acting user is the `seq 9` actor. Pre-change the array's last element (`seq 2`,
   a different person) stands and the move is accepted — a self-approval let through.
5. **sorts a COPY.** Asserts the handed-in array still reads `[9, 2]` after evaluation, and that
   `ticket.transitions` is still the same array object.

### Test-count note (Addendum 3/3a)

No stated count existed for this task — the brief lists four required items, and the literal file
holds **5** `it` blocks (items 1 and 2 both serve requirement 1, which the brief's own R1 text splits
into "refuse" and "refuse on the first"). Per Addendum 3, the literal count is the authority. The
fixture count gate was resolved by counting the directory: `ls packages/rule-engine/fixtures/*.json |
wc -l` → **62** after the addition. **Delta: +1 (61 → 62)**, stated in the commit message.

---

## The end-to-end fixture — it WAS expressible

`packages/rule-engine/fixtures/rule-rdu-refuses-a-history-it-cannot-read.json`, flat, no
`workspaceId` anywhere (harness defaults to `ws_1`), no memberships needed.

**How, and what it is not.** The brief's worry was that the harness might not stage an unresolvable
entry without also stranding the ticket, which would prove the weaker thing. It does not have to.
The harness has no refresh-on-publish, so the **version-divergence** shape is genuinely not stageable
through it — but the correction above supplies a second route to the identical code path: workflow
`wf_audit` v2 drops state `hold` and maps nothing to it, while the ticket sits in `review`, which v2
still has. The ticket therefore folds v1→v2 cleanly (no `stranded-state`), and the `hold` entry
strands. `resolved.ok === false` on an entry while the ticket resolves — the same line, the same
verdict. The fixture's `notes` field records that this is a planted store and why.

I considered and rejected staging divergence by rebinding the ticket to its **own** workflow's latest
version (`ticket.workflow_rebound` with `toWorkflowId` equal to the ticket's workflow — the harness
would accept it and move the version while leaving the log's entries at v1). Rejected because Task 6
ships a `ticket.rebound-same-workflow` refusal for exactly that event, and the harness's own rule is
that fixtures may only contain events a real server can ingest. The unit tests cover the divergence
shape directly instead.

**The fixture constrains rather than agrees** (Addendum 2). Its candidate actor `user_b` is a genuine
second person, so under both fail-open mutants the fixture goes red with an **acceptance** where a
refusal was expected — see M1 and M5 below. It is not a fixture that would still refuse with the new
check deleted.

---

## Mutation proofs

Every restoration was verified by **sha256 of the restored file against the pre-mutation sha256**,
plus `git diff` / `grep` on the restored content. **No shell `diff` was used at any point**
(Plan 2 consequences §7 rider 3). Pristine source hash:
`180255b056887eb37fd6d464561f9227029f5c9527d09b130994d471368ffc23`.

Command in every case (from `packages/rule-engine`, PATH-prefixed, `vitest run` only):
`npx vitest run test/require-different-user.test.ts test/fixtures.test.ts`.

### M1 — revert R1: restore `if (!resolved.ok) continue;`

`PASS (65) FAIL (3)`

```
1. planted-defect fixtures four-eyes refuses when a transition-log entry cannot be read against the current workflow, instead of skipping it
   Error: fixture "…": expected refusal [require-different-user], got acceptance
       at assertFixtureOutcome (…/src/fixtures/harness.ts:338:11)
2. require-different-user fails CLOSED … refuses when a log entry cannot be resolved forward, while the ticket itself resolves cleanly
   AssertionError: expected { refused: false } to deeply equal { refused: true, …(2) }
       at …/test/require-different-user.test.ts:146:21
3. require-different-user fails CLOSED … refuses on the FIRST unreadable entry, even when a later entry resolves and matches
   AssertionError: expected { refused: false } to deeply equal { refused: true, …(2) }
       at …/test/require-different-user.test.ts:172:21
```

Lines 146 and 172 are the `expect(verdict).toEqual(...)` calls — failures at the assertion, not at
setup or parse. The fixture fails inside `assertFixtureOutcome`, at its own expected outcome.
Restored: `restored sha256: 180255b0…8ffc23` (identical), and `git diff` shows the fail-closed reason
line present (1 hit) and no re-added `if (!resolved.ok) continue` (0 hits).

### M2 — revert R2's sort only (`[...transitions]`, unsorted)

`PASS (4) FAIL (1)`

```
1. require-different-user orders the log by `seq`, not by array position
   compares the actor of the greatest-`seq` match, not of the last array element
   AssertionError: expected { refused: false } to deeply equal { refused: true, …(2) }
       at …/test/require-different-user.test.ts:223:21
```

**This is the required proof that the `seq` test fails against the pre-change code**: the fixture's
array order disagrees with `seq` strongly enough that array-order reading accepts where `seq`-order
reading refuses.

### M3 — sort IN PLACE (`input.ticket.transitions.sort(...)`)

`PASS (4) FAIL (1)`

```
1. … sorts a COPY: the log it was handed comes back in the order it arrived
   AssertionError: expected [ 2, 9 ] to deeply equal [ 9, 2 ]
       at …/test/require-different-user.test.ts:239:51
```

Note M2 and M3 are independent: the ordering test passes under M3 and the copy test passes under M2,
which is why they are two blocks.

### M4 — delete guard 1

`PASS (66) FAIL (2)`

```
1. planted-defect fixtures four-eyes ignores a log entry recorded under a workflow the ticket has since been migrated off
   Error: expected acceptance, got refusal [require-different-user] This step needs a second person: user_a already performed the move to "review" on this ticket.
2. require-different-user fails CLOSED … still skips an entry from a workflow the ticket has left, without refusing on it
   AssertionError: expected { refused: true, …(2) } to deeply equal { refused: false }
       at …/test/require-different-user.test.ts:198:21
```

The reporter elides the verdict body, so I probed it once (a temporary write-to-file in the test,
removed and hash-verified afterwards — test file restored to
`15c11d291fd5d530783ae7df67048c4107220837267eaa8135d59a92d4ef5d49`). With guard 1 deleted the foreign
entry produces:

```json
{ "refused": true, "rule": "require-different-user",
  "reason": "This step needs a second person, and this ticket's history cannot be read against its current workflow, so who last performed the move to \"done\" is unknown. Ask an admin to check this workflow's version history." }
```

i.e. the foreign entry reaches the **new** refusal — which is precisely the guards-in-this-order
property the test exists to pin, and the reason the brief said guard 1 must not be folded into R1.

### M5 — refuse at the END instead of on the first unreadable entry

Loop sets a flag and refuses after the loop only when `prior === undefined`.

`PASS (66) FAIL (2)`

```
1. planted-defect fixtures four-eyes refuses when a transition-log entry cannot be read …
   Error: expected refusal [require-different-user], got acceptance
2. require-different-user fails CLOSED … refuses on the FIRST unreadable entry, even when a later entry resolves and matches
   AssertionError: expected { refused: false } to deeply equal { refused: true, …(2) }
       at …/test/require-different-user.test.ts:172:21
```

M5 is the independent falsification of R1's "refuse on the first unresolvable candidate entry"
clause, which M1 alone does not distinguish. It also verifies the claim the fixture's own `notes`
field makes about two mutants turning it green with an acceptance.

**No check was found that could not be made to fail.** Nothing is disclosed as unfalsifiable here.

---

## Routing — done in this commit, not deferred

`docs/superpowers/plans/2026-08-20-00-series-coordination.md`, in the house style of `cf4bbc7`
(bold `**Resolved by Plan 3, Task 4b (2026-08-28): …**` appended after the section's live analysis,
original reasoning untouched):

- **§3 discharged** — fail-closed chosen, with the reason (the section's own "only reachable through
  corruption" observation, plus the autonomous execution protocol's ruling 3 making the conservative
  option the standing default), the refusal id and the pinned copy quoted, first-unreadable-wins
  stated, guard 1 stated as untouched, the comment rewrite recorded, the equal-versions correction
  recorded, the fixture-vs-unit-test division of labour explained, and the 61 → 62 count noted. It
  also prices the rejected half honestly: diagnostics-only is a new cross-package surface, because
  the engine is pure and holds no logger.
- **§4 discharged** — RDU sorts a copy by ascending `seq` at the point of use (the option that
  section names preferable), so `proj_tickets` inherits **no** obligation to guarantee append order
  for four-eyes' sake. **The residual for Task 10 is kept live and explicit**: it should still say
  what order it appends in, where it appends, because a reader of `proj_tickets` still needs to know
  whether that table's log is ordered — "some consumer sorts it" is not an answer a projection gets
  to give about its own table.

---

## Catalogue placement — §4, not §5, and why

The brief anticipated a `Features.md` / `test-cases/` entry and warned about the 5.4–5.36
reservation. **The reservation is never touched**, because the right home is §4: `require-different-user`
is a Plan 2 rule, catalogued at 4.9 / 4.28 / 4.35 / 4.37, and `Features.md` §4's "Rule engine" bullet
already described its guard semantics — so the honest edit is to enhance that bullet and continue the
same numbering. Max existing id in `test-cases/04-workflow-engine.md` was **4.51**; the new cases are
**4.52** (fail-closed, citing both the fixture and the unit-test file) and **4.53** (`seq` order,
including the sorts-a-copy half). Nothing was renumbered anywhere.

`Features.md`'s fixture-suite bullet also states the count in prose and was moved 61 → 62 in the same
commit — a third place the number lives, easy to miss.

---

## Deviations, and things I could not verify

- **No deviation from the pre-flight conflict table.** Addendum 1 (`to` / `comment: { text }`) is
  honoured: the fixture's `ticket.transitioned` payloads all spell `to`, and the transition **log
  entries** spell `toStateId` — both spellings kept, neither unified. Addendum 2 was applied to the
  authored fixture (M1/M5). Addendum 3/3a: counts resolved by literal block count; no test deleted.
- **No new zod schema and no `as` casts** were introduced. The two rule literals use `as const`,
  which is a literal-type assertion rather than a shape-forcing cast.
- **`entity-state.ts`'s doc comment is deliberately untouched.** Its "appended oldest first" line is
  still a true statement about the log's documented convention; R2 removes four-eyes' *dependence* on
  that convention, not the convention. It is also outside the brief's Files list.
- **Fixture-count merge hazard, unresolved by construction.** 61 → 62 here; another lane is also
  adding fixtures, and whoever merges second must re-count the directory and sum the deltas
  arithmetically rather than taking either branch's number.
- **Not verified:** that no *other* lane's in-flight fixture already strands an RDU entry and would
  now flip from accept to refuse under fail-closed. All 62 fixtures on this branch pass, and the
  three shipped RDU fixtures plus the two workflow-defined ones are unaffected, but I cannot see
  other lanes' unmerged fixtures from here. A merged branch should re-run the whole fixture suite —
  which the gate does anyway.
- **Not verified:** server-side behaviour of the new refusal end to end. `ticket.transitioned` cannot
  yet reach a real ticket through `apps/server` (the engine context serves ticket state only from
  Task 12 onward), so there is no integration path to exercise. The rule is proven at the two levels
  that exist today: unit, and the shared fixture suite both server and client builds run.
