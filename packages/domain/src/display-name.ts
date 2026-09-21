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
 */
export const displayName = z
  .string()
  .min(1)
  .refine((value) => value.trim() !== '', 'must not be blank — a name of only spaces names nothing');
