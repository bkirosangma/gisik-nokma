import { z } from 'zod';
import type { WorkspaceRole } from '../entity-state.js';
import { ulidString } from '../envelope.js';

/**
 * The payload shapes of the workspace, project and membership vocabulary
 * (spec §6). Schemas only — the `domainRegistry.register` calls that bind them
 * to a type, a version and an entity kind live in `../vocabulary.ts`, following
 * the precedent `workflow.defined` and the ticket vocabulary set: registration
 * in the registry module, schema beside the concept it describes. Keeping them
 * there means the registry is complete for every importer of `parseEvent`, not
 * only for importers of the barrel.
 *
 * `workspace.created` and `workspace.renamed` are NOT new here. Plan 1 seeded
 * them so the ledger had something real to carry, marked provisional until this
 * plan landed (coordination decision 6). This is that landing: the shapes move
 * beside their siblings and the registrations stay exactly one apiece — the
 * registry throws on a duplicate `type@version`, so re-registering them would
 * crash at module load.
 *
 * Every user id is a ULID (`ulidString`), which is FORCED rather than chosen.
 * A membership's entity id is `${workspaceId}:${userId}` and the door admits
 * only `^<ULID>:<ULID>$`, so a membership naming a non-ULID user could never be
 * addressed at all. The project roster and the explicit-visibility list follow
 * the same spelling, because one product cannot hold two ideas of what names a
 * person. This is stricter than the plan's `usr_1` fixtures, which the door
 * refuses anyway.
 */
/**
 * A name someone will read. `.min(1)` alone admits `'   '`, which names nothing
 * while looking like a name everywhere it is displayed — the plan pinned that
 * refusal (`value.trim() === ''`) and it is kept. It REFUSES rather than trims:
 * the ledger stores the claim as it was made, so quietly rewriting `'  Corner '`
 * to `'Corner'` would put words in the actor's mouth. This tightens Plan 1's
 * provisional `z.string().min(1)` on the two workspace types, which is what
 * taking them over means.
 */
const displayName = z
  .string()
  .min(1)
  .refine((value) => value.trim() !== '', 'must not be blank — a name of only spaces names nothing');

export const workspaceCreatedPayload = z.object({ name: displayName }).strict();
export type WorkspaceCreatedPayload = z.infer<typeof workspaceCreatedPayload>;

export const workspaceRenamedPayload = z.object({ name: displayName }).strict();
export type WorkspaceRenamedPayload = z.infer<typeof workspaceRenamedPayload>;

export const projectCreatedPayload = z.object({ name: displayName }).strict();
export type ProjectCreatedPayload = z.infer<typeof projectCreatedPayload>;

/**
 * The role vocabulary as the door spells it. `WorkspaceRole` in entity-state.ts
 * stays the type origin; `satisfies` here means a role this list has and the
 * type does not fails to compile, and the exhaustive switch in the test file
 * fails to compile in the other direction. One vocabulary, checked both ways.
 */
export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'] as const satisfies readonly WorkspaceRole[];
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

/**
 * A `scope` is REFUSED, not ignored.
 *
 * `membership.granted` used to carry `MembershipScope = 'workspace' | {projectId}`,
 * removed by the owner 2026-08-27. Two ways on meant two ways off: a project
 * scope here and `project.member_added` both put a person on a project, and
 * `membership.revoked` with a scope and `project.member_removed` both took them
 * off — so unless both paths wrote the identical projection key, removing by one
 * left the other standing and an admin believed access was gone when it was not.
 * The scope bought nothing either: a guest's `canSee` is explicit-only so it
 * granted no reads, and guests are refused ticket creation before the project
 * check is reached so it granted no writes.
 *
 * A stale client or an old fixture can still send one, and accepting it while
 * silently doing something else is exactly the quiet acceptance the honesty
 * contract forbids — the claim means "put them on project P". So `scope` is
 * DECLARED as `z.never()` rather than left to `.strict()`: strict alone would
 * answer "Unrecognized key(s) in object: 'scope'", which is true and useless.
 * Declaring it keeps the sentence that says where to go instead, while
 * `.strict()` still catches every other unknown key generically.
 *
 * Project association is `project.member_added` / `project.member_removed`, and
 * nothing else.
 */
const refusedGrantScope = z.never({
  invalid_type_error:
    'membership.granted no longer takes a scope; use project.member_added to put someone on a project',
});

const refusedRevokeScope = z.never({
  invalid_type_error:
    'membership.revoked no longer takes a scope; use project.member_removed to take someone off a project',
});

export const membershipGrantedPayload = z
  .object({ userId: ulidString, role: workspaceRoleSchema, scope: refusedGrantScope.optional() })
  .strict();
/** `scope` is dropped from the type: it exists in the schema only to be refused. */
export type MembershipGrantedPayload = Omit<z.infer<typeof membershipGrantedPayload>, 'scope'>;

export const membershipRevokedPayload = z
  .object({ userId: ulidString, scope: refusedRevokeScope.optional() })
  .strict();
export type MembershipRevokedPayload = Omit<z.infer<typeof membershipRevokedPayload>, 'scope'>;

/**
 * `projectAdmin` is required, with no default. The flag is a claim about what
 * this person may do to the project's roster and its tickets' visibility, and a
 * claim nobody made is not a claim — defaulting it to false would put an
 * unattributed answer in the ledger, and defaulting it to true would grant
 * rights nobody asked for.
 */
export const projectMemberAddedPayload = z
  .object({
    userId: ulidString,
    projectAdmin: z.boolean({
      required_error: 'is required — a project-admin flag is a claim, not a default',
      invalid_type_error: 'is required — a project-admin flag is a claim, not a default',
    }),
  })
  .strict();
export type ProjectMemberAddedPayload = z.infer<typeof projectMemberAddedPayload>;

export const projectMemberRemovedPayload = z.object({ userId: ulidString }).strict();
export type ProjectMemberRemovedPayload = z.infer<typeof projectMemberRemovedPayload>;
