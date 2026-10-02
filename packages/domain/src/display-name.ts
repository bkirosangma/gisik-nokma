import { z } from 'zod';

/**
 * A name someone will read — ruling P15's refinement, exported ONCE so every
 * name field in the vocabulary reads the same sentence (E6-20, 2026-09-21).
 *
 * `.min(1)` alone admits `'   '`, which names nothing while looking like a
 * name everywhere it is displayed — the plan pinned that refusal
 * (`value.trim() === ''`) and it is kept. It REFUSES rather than trims: the
 * ledger stores the claim as it was made, so quietly rewriting `'  Corner '`
 * to `'Corner'` would put words in the actor's mouth. Padding around a real
 * name stays legal and is stored verbatim.
 *
 * Ruling P15 closed titles, workspace, project and invite names with this
 * construction and left the five names that head a board column or a picker
 * at `.min(1)`: a workflow (`workflowDefSchema.name`), a state
 * (`workflowStateSchema.name` — the column header on every board using the
 * workflow), a ticket type (`ticketTypeDefSchema.name`), a custom field
 * (`customFieldDefSchema.name`) and a select option (`options[]`, a choice
 * with no label). Through `POST /v1/events` a workflow named `" "` and a type
 * named `" "` committed and were listed — measured 2026-09-21 with the P15
 * controls firing in the same run. All five use this schema now, from this
 * one module, so the refusal is one sentence across the series rather than
 * five spellings free to drift. `workspace.created`, `workspace.renamed` and
 * `project.created` (`events/membership.ts`) import it from here too; the
 * ticket title and the invite address keep their own nouns on purpose
 * (`events/ticket-events.ts`, `events/invites.ts` — "a title of only spaces
 * titles nothing", "an address of only spaces reaches nobody"), sharing the
 * construction and not the word.
 *
 * Lives in its own dependency-free module rather than in `events/membership.ts`
 * because `workflow.ts` and `ticket-types.ts` are the core definition schemas
 * the event vocabulary is built ON; a core module importing from `events/`
 * would invert that.
 *
 * ONE issue per failure, and the `value.length === 0 ||` guard is what makes
 * that so. Zod runs a `.refine` on a string whose `.min(1)` already failed
 * (the inner result is dirty, not aborted), so the original spelling reported
 * an EMPTY name twice — `too_small` and the blank sentence. The workspace and
 * project doors never showed it (their tests ask `toContainEqual`), but the
 * ticket-type editor lists every issue of `ticketTypeDefSchema` and maps
 * `too_small` on a string to "<Field> is required" (case E4-29): with this
 * schema on the type's name, an empty form listed three items — "Name is
 * required", the blank sentence about the same field, "Workflow is required"
 * — measured on the merged tree, 2026-09-21. So the blank sentence is reserved
 * for the case `.min(1)` cannot see, a non-empty name of only whitespace, and
 * an empty name is `too_small` alone, as it always was.
 */
export const displayName = z
  .string()
  .min(1)
  .refine(
    (value) => value.length === 0 || value.trim() !== '',
    'must not be blank: a name of only spaces names nothing',
  );
