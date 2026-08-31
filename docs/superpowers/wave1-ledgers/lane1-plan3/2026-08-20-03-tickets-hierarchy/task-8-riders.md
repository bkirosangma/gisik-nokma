# Task 8 riders — accumulated across Tasks 3–7b

**Read with `task-8-brief.md` and `preflight-conflict-table.md`. This file is BINDING and collects
what the brief cannot know.** Task 8 closes Chain A: the end-to-end planted-defect fixtures, plus the
harness work every earlier task deferred to it.

---

## A. Do NOT swap the fixture runner (A14 / BA-6) — this is the largest trap in the brief

The brief instructs replacing the runner's context construction with `buildMemoryContext`. **That
breaks all 67 shipped fixtures and ~30 harness tests, three independent ways** the brief prices none of:

1. the prior-event payload dialect differs (`ticket.created` is `{workflowId, workflowVersion?, …}` in
   the harness, `{typeId, projectId, parentId, title}` in domain);
2. `buildInMemoryContext` needs `fx.memberships` for restrict-to's fixtures, which a
   `(workflowDefs, events)` signature cannot receive — those fixtures would refuse for the *wrong reason*;
3. the harness's deliberate planted `stateId`/`stateCategory` overrides have no path through the reducer.

**Keep `packages/rule-engine/test/fixtures.test.ts:19` unchanged.** Extend `applyPriorEvent` instead.
`memory-context.ts` is a SECOND context and does not replace `buildInMemoryContext` — Task 4 states
this in its own doc comment; do not "unify" them.

## B. The harness/domain PRESENCE audit (Addendum 8) — inherit the list, do not re-derive it

**Ruling P10: a harness schema may diverge from its domain twin in VALUE FORMAT; it may NOT diverge in
PRESENCE.** Format divergence is deliberate and load-bearing (fixtures use `t1`/`ws_1` because they
enter at `evaluateEvent` and never pass `parseEvent`'s door; tightening would invalidate every shipped
fixture). Presence divergence has no purpose: it lets a fixture stage a prior state the real door
would refuse.

Four presence defects to close, all in `packages/rule-engine/src/fixtures/harness.ts`:

| Site | Now | Must be |
|---|---|---|
| `ticketCreatedFixturePayloadSchema.parentId` (~:140) | `z.string().nullable().optional()` | **required**-nullable, mirroring `ticket-events.ts:19` |
| same schema: `typeId`, `projectId`, `title` | **absent entirely** | added as **required** — A14 says to add them, and adding them *optional* would reproduce the `parentId` defect three more times in the act of fixing something else |
| `partialEnvelopeSchema.payload` (~:32) | `z.unknown()` | presence-checked, matching `envelope.ts:124` |
| `ticketFieldSetFixturePayloadSchema.value` (~:155) | `z.unknown()` | presence-checked, matching `ticket-events.ts:60` |

Plus: **`ticketReparented` has no harness schema yet.** When you add it, mirror presence —
`newParentId` required-nullable, never optional.

**Deliberate divergences to LEAVE ALONE** (all format or harness-only affordances): `assigneeId`
without `min(1)`; rebound ids without `min(1)`; short non-ULID ids; `workflowId` on the created
payload (a harness-only affordance — no ticket-type projection exists in memory); the
`stateId`/`stateCategory` planting overrides; and the `field` / `fieldId` split (**Ruling P8** — keep
it, and add the comment P8 requires saying why the two spellings are deliberate).

## C. The `?? null` sites are NOT uniformly wrong — do not over-correct

- `harness.ts:226` (`parentId`) and `:231` (`assigneeId`) are **correct**. A ticket created with no
  parent *is* a root ticket; one with no assignee *is* unassigned. Null is the natural absence-default
  of a state field there. **Tightening these into refusals would be a regression.**
- `harness.ts:308` (`value`) is **the defect** — in `field_set`, null is not a default, it is an *act*
  (the clearing claim design decision 3 sanctions, carrying provenance). Fix it **together with** the
  schema at `:155`; dropping the coalesce alone would write `undefined` into fixture state, strictly
  worse. Task 7b left it deliberately for exactly this reason.

**The discriminator:** `?? null` fabricates only where `null` carries the meaning of a deliberate act.

## D. Fix-order floor, as refined and verified

- The **candidate** event is judged by the **real domain schema** (`fixtures.test.ts:19` →
  `evaluateEvent`); `applyPriorEvent` handles priors only. So a candidate-position fixture can prove a
  door's behaviour today.
- The harness schemas gate **prior-event staging**. Fix them **before** writing any fixture whose
  *priors* depend on tightened behaviour, and before any fixture is offered as evidence that the
  harness and the production door agree.

## E. Falsifiability — transcribed fixtures get mutated too (Addendum 2)

A sibling lane mutated fixtures shipped as pinned plan text and found **four surviving mutants**,
including a discriminator deletable with every case still green. **A fixture that AGREES with the
implementation is not one that CONSTRAINS it**, and plan-text fixtures are the least-interrogated kind
because they read authoritative.

Per fixture: mutate the code path it claims to pin and confirm it goes RED **at its own expected
outcome**, not at load or parse; for refusal fixtures confirm it fails for the **named rule** (one that
still refuses after the check under test is deleted is pinning something else); if no mutation can
make it fail, **report it — do not ship it**.

For the presence fixes, mirror the shape all three doors now use: **four assertions, not "make it
required"**, and mutate by reverting to bare `z.unknown()` while watching the **ABSENT** case fail
specifically. A mutation killing only present-but-`undefined` proves a side effect of the fix.

## F. Fixture mechanics

- **Flat** in `packages/rule-engine/fixtures/`; the scan is non-recursive and a nested fixture is
  silently skipped.
- **Omit `workspaceId` entirely** (Ruling P5). Two independent reasons now: the harness keys
  memberships to `ws_1` unconditionally while only *defaulting* the envelope's, so an override yields a
  null membership and a legitimate-looking restrict-to refusal — **and** after P12 it also yields a
  legitimate-looking `hierarchy.unknown-parent`.
- **Count the directory yourself at commit time (Ruling P6).** Expected: **70** after the rebase onto
  main (67 there + this lane's 3), **83** after your thirteen. **Verify both by counting; do not write
  a number you did not count.** State your delta in the commit message.
- `harness.ts:238` hardcodes `projectId: 'prj_1'` on every prior-event ticket — a trap for
  parented-create and cross-project fixtures. Extend it rather than working around it.
- Parent-terminal fixtures assert **`rule` only**, deferring the reason to Plan 2's shipped rule
  (`fixtureSchema`'s rule-only branch exists for this).
- Task 4b's fixture `notes` cite **`(unmapped-drop)`**, a name that greps to nothing; the real refusal
  is `workflow-state-mapping`. Correct it or rephrase as plain prose.

## G. Scope guards

- **`getTicketTypeDef` throws in the harness by design** (naming this task). You are the task that
  makes it real — extend `applyPriorEvent` to fold `ticket-type.defined` and give the method a real
  body. Do not make it return `null`.
- **If you admit `workflow.defined` into the harness dialect, you MUST carry the
  `foldTicketToWorkflowVersion` loop with it** — otherwise the harness and the memory context split at
  exactly the seam Task 4 exists to weld.
- **C-06 stands:** these fixtures do NOT traverse Task 3's reducer; A15's mirroring is the only thing
  keeping the two folds honest. Anything you add to one, check against the other.
- **Ruling P15 residual:** the whitespace-title refusal is proven at the schema, through `parseEvent`
  and via `checkTicketCreated`'s `safeParse`, but has **no end-to-end proof**, and `parseEvent`'s exact
  blank-title message was verified by a probe rather than pinned by an assertion. You own the fixtures
  that could close both.

## H. Method

- **`grep -r` over a directory is unreliable here** — a silent empty result is indistinguishable from a
  true negative. For any "X appears nowhere" claim use `find … | xargs grep` with explicit file
  enumeration, and **include `.json`** (a recent sweep missed a fixture by globbing `*.ts` only).
- **For every sentence asserting that something happens, is inherited, or now fails: run it. If you
  cannot run it, do not assert it.** A sibling lane shipped four false prose claims on one branch, the
  fourth introduced by the fix for the third.
- Restorations verified by reading the file or `git diff` — **never a shell `diff`**.
