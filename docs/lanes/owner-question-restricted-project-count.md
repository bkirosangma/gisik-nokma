# OWNER RULING REQUEST — may a workspace card carry a COUNT of the projects the caller may not name?

**Raised by the serial executor, 2026-09-09, during Task 16 (`/v1/me/workspaces` real counts).**
**Status: OPEN. Nothing in Task 16's PR depends on the answer** — the field is strictly additive and is
NOT built. **Task 18's card string *"1 project · name restricted"* has no data source until this is ruled.**

## The conflict, in the two documents' own words

The task text (both the plan's `### Task 16:` and the controller dispatch) asks for:

> "The guest's `projects` already come scoped; **add the restricted marker + a visible/restricted count**
> so Task 18 can render *"N project · name restricted"* without ever carrying a name the guest may not
> see (P32/P38 — **escalate before a new rule**)."

The shipped code that implements P32/P38 says the opposite, in `packages/app-core/src/online/mappers.ts`
(`mapWorkspaceRefs`, the `projects` key):

> "The client renders what it is given and asserts nothing about what it is not: **there is deliberately
> no "and N more", because the COUNT would itself be the disclosure the rule withholds.**"

Both cannot be satisfied. Serving a restricted-project count requires rewriting that docblock's rationale,
and rewriting a recorded ruling's rationale is not something an executor should do on its own reading —
which is why the task text's own "escalate before a new rule" clause fires here rather than being resolved
in-task. (Task 16's other visibility questions — `memberCount`'s guest-hiding, the visibility scoping of
the ticket counts — WERE resolved in-task against shipped precedent, and are described in the PR body.
This one is the only escalation.)

## What is at stake, stated without a recommendation dressed as a fact

`visibleProjects` (`apps/server/src/read/visible-projects.ts`) serves a caller only the projects whose
NAME they may be told. Its own docblock argues the list being partial is not an existence secret:

> "They may still hold Y's project ID — `TicketCard` carries `projectId` … so this list is not an existence
> secret. It is a NAME one, which is exactly the distinction P32 drew."

That argument is about a project the caller can already see a TICKET in. It does not extend to a project
the caller has no sight into at all, and a total count of the workspace's projects would cover both.

## The three options, as the executor sees them

1. **Withhold entirely (the conservative default, and what Task 16 ships today).** No restricted count on
   the wire. Task 18's card lists the projects it was given and asserts nothing about the rest. Cost:
   the owner's *"1 project · name restricted"* string is not renderable, and a guest cannot tell the
   difference between "this workspace has one project" and "you can see one of its projects".
2. **Count only projects the caller can already derive** — i.e. projects in which the caller can see at
   least one ticket (`visibleTicketsWhere`) but whose name `visibleProjects` withholds. This discloses
   nothing the caller does not already hold (they have the `projectId` from the ticket card), and it makes
   *"1 project · name restricted"* exactly true. Cost: it is a NEW derivation rule on the visibility
   surface, and it still requires the `mappers.ts` docblock to be amended rather than merely extended.
   It is also the option the executor would pick if it had the authority; it is recorded here as an option
   and not acted on.
3. **Count every project in the workspace** (the most literal reading of the task text). Simplest, and the
   only one that makes the number mean "projects in this workspace". It is a plain existence disclosure to
   a guest, and it is what the `mappers.ts` docblock forbids by name.

**The direction of the mistake is asymmetric** and the tie-break is already recorded in
`visible-projects.ts`: *"serving MORE later is a widening and reversible; serving a name and retracting it
is not."* A count withheld today can be added in Task 18's own PR without touching Task 16's wire; a count
served today cannot be recalled from anyone who read it.

## What the executor needs back

One sentence choosing 1, 2 or 3. If 2 or 3, the `mapWorkspaceRefs` docblock must be amended in the same
change set that adds the field, saying what changed and why — the sentence it replaces is load-bearing.
