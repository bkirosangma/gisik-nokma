# Task 4b: `require-different-user` fails closed, and reads the `seq` it was given

**This task has no text in Plan 3.** It exists because the coordination doc assigned Plan 3 a
decision that no task owns. The controller ruled it before dispatching Task 3; this brief IS the
requirements, and the two rulings below are settled — implement them, do not re-litigate them.

## Where this comes from

`docs/superpowers/plans/2026-08-20-00-series-coordination.md`, section **"Plan 2 execution
consequences (2026-08-28)"**, items **§3** (lines 424–432) and **§4** (lines 434–440). Read both
before you start. Their substance:

- **§3.** `packages/rule-engine/src/rules/require-different-user.ts:56` is `if (!resolved.ok) continue;`
  — fail-open on an unresolvable transition-log entry. The comment above it justifies the skip by
  claiming "in such a store the ticket's own state resolution refuses first, as stranded-state,
  before any rule runs." That claim holds only while the ticket's `workflowVersion` and the entry's
  `workflowVersion` coincide. **Plan 3's refresh-on-publish makes divergence routine**: the ticket's
  row is folded to latest and thereafter folds latest→latest as a no-op, while a v1 log entry still
  walks the whole chain. From then on an entry can strand where the ticket cannot, the entry is
  skipped, `prior` stays undefined, and the rule returns `{refused: false}` — four-eyes silently
  disarmed, for a security control, with no diagnostic anywhere. The doc states: *"What must not
  survive Plan 3 is the current arrangement: fail-open, plus a committed comment asserting a
  precondition Plan 3 itself removes. Whichever is chosen, that comment gets rewritten in the same
  change."*
- **§4.** The same rule ends with `// Iterating oldest-first and overwriting leaves the LAST match
  standing` (lines 57–58). That is correct **by convention only**: `TicketState.transitions` is
  documented as appended oldest-first. Every entry carries a `seq`
  (`packages/domain/src/entity-state.ts:38`) and **nothing in the monorepo reads it**. A Plan 3
  projection that appends out of order silently inverts latest-wins — the wrong person's id compared
  against the wrong actor, refusing legitimate moves and accepting self-approvals, with a green
  suite, because every fixture's log is built in order.

## The two rulings (settled — implement, do not re-decide)

### Ruling R1 — fail CLOSED

An entry that cannot be resolved forward **refuses the transition**. It is no longer skipped.

Rationale, so you can defend it in your report: the autonomous execution protocol (coordination doc,
"Autonomous execution protocol", ruling 3) makes the conservative option — fail-closed, refuse, the
narrower scope — the standing default for a question the plans do not answer. §3 itself observes the
fail-open path is reachable "only through corruption", and that *"'only reachable through corruption'
is exactly the condition under which a security control should fail closed."*

**The refusal, pinned by the controller** (there is no canonical copy table entry for it, so this
brief is the canonical copy — tests assert the literal string, never the constant):

- rule id: `REFUSAL_RULES.requireDifferentUser` — i.e. the string **`require-different-user`**.
  It is the four-eyes rule refusing; the rule vocabulary is closed and versioned (spec §4) and a
  second id would imply a sixth rule in it. A client filtering on the four-eyes id must see this.
- reason (templated on the rule's target state id, exactly as the accepting-path message is):

```
This step needs a second person, and this ticket's history cannot be read against its current workflow, so who last performed the move to "${target}" is unknown. Ask an admin to check this workflow's version history.
```

Interpolated example, for the test to assert character-for-character:

```
This step needs a second person, and this ticket's history cannot be read against its current workflow, so who last performed the move to "done" is unknown. Ask an admin to check this workflow's version history.
```

**Refuse on the first unresolvable candidate entry.** Do not finish the loop and refuse at the end:
an entry that cannot be read is a fact about the store, and continuing past it to find a resolvable
match would let a later entry paper over an unreadable earlier one — which is the fail-open failure
wearing a longer loop.

**Guard 1 still comes first.** An entry belonging to a different workflow
(`entry.workflowId !== input.ticket.workflowId`) is skipped BEFORE any resolution is attempted, and
stays skipped. It is not unresolvable — it is correctly out of scope, for the reason the existing
comment gives. Do not fold it into the new refusal.

### Ruling R2 — order by `seq`, at the point of use

Iterate the candidate entries in ascending `seq` order rather than trusting array order.

- Sort a **copy**. Never mutate `input.ticket.transitions` — it is engine input, and a rule that
  reorders the state it was handed is a defect of its own.
- Ascending `seq`. `seq` is the per-entity sequence number, so within one ticket's log it is a total
  order.
- The `// Iterating oldest-first and overwriting leaves the LAST match standing` comment is now
  wrong as written — the ordering is no longer inherited from the caller. Rewrite it to say the
  ordering is established here, and why (the field existed and nothing read it; the guarantee must
  not live in a projection's implementation detail).

## Files

- **MODIFY** `packages/rule-engine/src/rules/require-different-user.ts` — both rulings, and the
  doc-comment rewrite R1a requires.
- **MODIFY/CREATE** the unit test file for this rule under `packages/rule-engine/test/`. Follow the
  existing layout there; do not invent a new test directory.
- **MODIFY** `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — see "Routing" below.
- **DO NOT** touch `packages/rule-engine/fixtures/` unless the fixture requirement below applies,
  and **do not** change `packages/rule-engine/test/fixtures.test.ts`'s count except in the same
  commit as a fixture you actually add.

## The comment rewrite (R1a) — non-negotiable

The block at lines 51–55 justifying the skip must not survive. Replace it with a comment that says:

1. what the code now does (refuses), and
2. **why the old justification died** — that it rested on the ticket's version and the entry's
   version coinciding, and Plan 3's refresh-on-publish makes them diverge routinely (the ticket
   folds latest→latest as a no-op while an old entry walks the whole chain), so an entry can now
   strand where the ticket cannot.

A reader who arrives in six months must be able to see that this was decided, not defaulted into.

## Tests — and what counts as evidence

**Every planted check must be mutation-proven falsifiable.** Restorations are verified with
`git diff` or by reading the file — **never** with a shell `diff`: the RTK proxy has returned a
false "identical" on exactly this operation (coordination doc, Plan 2 consequences §7 riders).

Required:

1. **Fail-closed unit test.** Stage a ticket whose transition log holds a candidate entry that
   cannot be resolved forward, while the ticket's own state resolves cleanly. Assert the refusal's
   `rule` AND its complete `reason`, character-for-character against the pinned copy above. Note the
   shape you need: the ticket at the latest version folding as a no-op, an older entry whose
   `workflowVersion` starts a chain that breaks. `packages/rule-engine/test/version-map.test.ts`
   already builds version chains and a `ticketAt(stateId, workflowVersion)` helper — read it first
   and reuse rather than reinvent.
2. **`seq`-ordering unit test.** Build a transitions array whose **array order disagrees with `seq`
   order** — two entries both matching the target, the later-`seq` one placed earlier in the array —
   and assert the actor compared is the one with the greater `seq`. This test must FAIL against the
   pre-R2 code. If it passes both before and after your change, your fixture does not disagree
   strongly enough; fix the fixture, do not weaken the assertion.
3. **Guard-1 regression.** One test proving a foreign-workflow entry is still skipped and does NOT
   trigger the new refusal.
4. **Mutation proofs** for tests 1 and 2: revert the production change, show the test fails at its
   own assertion (not at setup), restore, verify by reading the file or `git diff`. Record both
   outputs in your report.

**End-to-end fixture — required if expressible.** Try to stage this through the shared fixture
suite (`packages/rule-engine/fixtures/`, flat, workspace `ws_1`, harness imported from
`@gisik-nokma/rule-engine/fixtures` — never the package root). If you add one, bump the exact-count
assertion in `packages/rule-engine/test/fixtures.test.ts` **in the same commit** and state your
delta in the commit message (it is currently **61**; another lane is also adding fixtures and the
merge resolution is arithmetic).

If the harness **cannot** stage an unresolvable entry without also stranding the ticket — which
would prove something weaker, since the ticket's own stranded-state refusal would fire first and the
test would pass for the wrong reason — then **do not ship a fixture that proves the weaker thing.**
Report that finding explicitly in your report, with what you tried. A check that cannot fail is not
evidence; reporting it is right, shipping it silently is not.

## Routing — same change set, not a follow-up

This is the failure both consequences sections were written about: Plans 1 and 2 each recorded
"routed to coordination doc at plan end", plan end came, and the branch changed no document at all,
because the ledger is gitignored. **In the same commit as the code**, edit
`docs/superpowers/plans/2026-08-20-00-series-coordination.md`:

- Mark **Plan 2 consequences §3** discharged: state that Plan 3 chose **fail-closed**, name the
  refusal copy, and record that the comment was rewritten in the same change. Keep the original
  analysis intact — append the resolution, do not delete the reasoning.
- Mark **Plan 2 consequences §4** discharged: state that RDU now sorts by `seq` at the point of use
  (the option that section names as preferable), so the ordering guarantee no longer rests on a
  projection's append order — and that Plan 3's `proj_tickets` therefore inherits no obligation to
  guarantee append order for four-eyes' sake.

Follow the document's existing house style for discharged items (see how earlier entries are struck
through or marked **Done** with what was found).

## Global constraints that bind this task

- TypeScript strict, Node 22, pnpm, Vitest. Prefix toolchain commands with
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.
- `vitest run`, never watch mode. Verify across packages with
  `pnpm turbo run build test typecheck` — never a direct `npx vitest` (stale dist).
- Exact-rejection tests assert the type/code AND the complete message, character-for-character.
  Tests assert the **literal string**, never the constant — a typo'd constant must not certify itself.
- Commits are prose that say what was found and why it matters. No `feat:`/`fix:` prefixes.
  End the commit message with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- `reference/` is frozen.
- You are on branch `exec/03-tickets-hierarchy`. Never commit to `main`.
- Do not dispatch subagents. Review arrives from the controller after your report.
