import { z } from 'zod';

/**
 * The note vocabulary's payload schemas (notes series, Plan 1 of 6, spec §3.2).
 * Registration on entity kind `'note'` lives in `../vocabulary.ts`; the folder
 * is folded by `applyNoteEvent` (`../note-state.ts`).
 *
 * A note is a rich-text document, not an entity with fields. Its payloads carry
 * four things and nothing else: where it is filed (`homeProjectId`), who may
 * see it (`scope`), what it says (`body`), and which tickets it is pinned to
 * (`attachTicketId` / `ticketId`). Every mutation is its own small type rather
 * than one `note.field_set`, because each carries a rule the others do not:
 * `scope_set`'s `inherit` needs an attachment to exist, `moved`'s empty
 * `homeProjectId` is refused under a `project` scope, and so on. Those rules
 * live in the reducer, where the state to check them against already is.
 *
 * ## Why every scope object is `.strict()`
 *
 * `userIds` on a mode that is not `explicit` is a list NOTHING will ever read —
 * the note would be visible to a whole workspace or project while the ledger
 * carried a permanent, untrue record of a hand-picked audience. A plain
 * `z.object` STRIPS the unknown key and parses clean, so the claim would commit
 * and the lie would be in the ledger forever. `.strict()` refuses it instead.
 * This is not a new convention invented here: `visibilitySetPayload`
 * (`./visibility.ts`) makes the identical refusal for the identical reason, and
 * this file follows it rather than growing a second spelling of the same rule.
 * Case 18.002 is the witness, and the `{ mode: 'workspace', userIds: […] }`
 * assertion in it is measured against this choice — with a loose object that
 * assertion reads `true` and the case tests nothing.
 *
 * `explicit` with an EMPTY list is the matched half of the same pair: an
 * audience of nobody reads as a restriction that hides the note from everyone
 * including its author, when what the sender meant was a list they forgot to
 * attach. Hence `min(1)`.
 */
export const noteScopePayload = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('private') }).strict(),
  z.object({ mode: z.literal('workspace') }).strict(),
  z.object({ mode: z.literal('project') }).strict(),
  z.object({ mode: z.literal('inherit') }).strict(),
  z.object({ mode: z.literal('explicit'), userIds: z.array(z.string().min(1)).min(1) }).strict(),
]);

/**
 * A note's content: a ProseMirror JSON document, the same shape a ticket's
 * description and a comment body already travel in.
 *
 * The check is structural and deliberately shallow. `packages/editor` owns the
 * real `isDocJson` and the schema behind it, and `packages/domain` must not
 * import `packages/editor` (the dependency runs the other way), so this asks
 * only the question the door can answer alone: is this an object that says it
 * is a doc. Depth is the editor's business, and a body that is a doc by this
 * test but not by the editor's is a migration problem (`DOC_SCHEMA_VERSION`,
 * carried inside the doc), not a door problem.
 */
const docJson = z.record(z.string(), z.unknown()).refine((d) => d.type === 'doc', 'not a doc');

/**
 * A note comes into existence. Two cross-field rules, both `.refine()`d rather
 * than left to the reducer, because neither needs state to check:
 *
 * - **`inherit` at birth needs `attachTicketId`.** There is nothing to inherit
 *   from otherwise, and the reducer's own precondition would refuse the very
 *   first event of the stream — an entity that can never come into existence.
 * - **`project` scope needs a project home.** A note filed at workspace level
 *   cannot be visible to one project, so the pair is refused at the door rather
 *   than stored as a scope nothing resolves.
 *
 * `body` is optional: a note created from a picker or a ticket's "New note" row
 * starts empty, and `EMPTY_NOTE_DOC` is what the reducer folds in for it.
 */
export const noteCreatedPayload = z
  .object({
    title: z.string().min(1).max(500),
    homeProjectId: z.string(), // '' = workspace level
    scope: noteScopePayload,
    body: docJson.optional(),
    attachTicketId: z.string().min(1).optional(),
  })
  .refine(
    (p) => p.scope.mode !== 'inherit' || p.attachTicketId !== undefined,
    'inherit at birth requires attachTicketId',
  )
  .refine((p) => p.scope.mode !== 'project' || p.homeProjectId !== '', 'project scope requires a project home');

export const noteRenamedPayload = z.object({ title: z.string().min(1).max(500) });
export const noteBodySetPayload = z.object({ body: docJson });
/**
 * The same schema as `created`'s `scope` field, exported under its own name so
 * the reducer reads `payload.scope` for both without a second definition to
 * keep in step. The two rules `created` refines on top of it are about the
 * BIRTH of a note and have no meaning here: `inherit` is legal on an existing
 * note exactly when it has an attachment, which is state the reducer holds.
 */
export const noteScopeSetPayload = noteScopePayload;
export const noteMovedPayload = z.object({ homeProjectId: z.string() });
export const noteAttachedPayload = z.object({ ticketId: z.string().min(1) });
export const noteDetachedPayload = z.object({ ticketId: z.string().min(1) });
export const noteDeletedPayload = z.object({});
export const noteRestoredPayload = z.object({});
