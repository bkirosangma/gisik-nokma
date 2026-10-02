import { z } from 'zod';
import type { WorkspaceRole } from '../entity-state.js';
import { ulidString } from '../envelope.js';
import { displayName } from '../display-name.js';
import { prefixSchema } from '../prefix.js';

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
// `displayName` — a name someone will read, ruling P15's refinement — used to
// be defined here for the two workspace types and the project name, tightening
// Plan 1's provisional `z.string().min(1)`. It moved to `../display-name.ts`
// (E6-20) so the five definition-side name fields in `workflow.ts` and
// `ticket-types.ts` share the one schema and the one sentence; nothing about
// the three payloads below changed.

/**
 * The workspace prefix (owner spec 2026-09-20): up to three capital letters,
 * entered when the workspace is created, and the first half of every ticket key
 * the workspace will ever hold — `CCSO-1183`.
 *
 * **OPTIONAL, and `.strict()` is what makes that safe** — `projectCreatedPayload`'s
 * `description` is the precedent. Every `workspace.created` written before this
 * field existed parses unchanged, which a `.strict()` schema would otherwise
 * turn into a hard refusal of the entire ledger.
 *
 * **Absent means NOT ENTERED**, and the key's first half is then DERIVED from
 * the name (`../prefix.ts`) rather than left off — because a key with no
 * workspace half names nothing. That is also why the field is not REQUIRED even
 * going forward: a caller who mentions no prefix is a caller whose project
 * still needs a key, and refusing them would make the key a precondition of
 * founding a workspace rather than a consequence of it.
 *
 * **A rename never moves it; `workspace.prefix_changed` does** (owner spec
 * 2026-10-01, R1/R2, `docs/superpowers/specs/2026-10-01-prefixes-groups-create-buttons-design.md`).
 * `workspace.renamed` carries a name and NOT a prefix, deliberately: a rename
 * is a claim about what the workspace is CALLED, and a key is not a name. The
 * prefix changes only through the explicit `workspace.prefix_changed` event, so
 * a person always chose it. When it changes every key re-reads, and the former
 * prefixes stay reserved and resolvable (a former key still finds its ticket).
 */
export const workspaceCreatedPayload = z
  .object({ name: displayName, prefix: prefixSchema.optional() })
  .strict();
export type WorkspaceCreatedPayload = z.infer<typeof workspaceCreatedPayload>;

export const workspaceRenamedPayload = z.object({ name: displayName }).strict();
export type WorkspaceRenamedPayload = z.infer<typeof workspaceRenamedPayload>;

/**
 * The workspace's prefix changed (owner spec 2026-10-01, R1/R2). Filed against
 * the WORKSPACE entity. One field, the new prefix, in the same format as
 * `workspaceCreatedPayload.prefix` (`prefixSchema`). Whether the new prefix is
 * free (not held by another project, nor reserved as another's former prefix)
 * is a rule across the ledger, so it is enforced at the door, not here.
 */
export const workspacePrefixChangedPayload = z.object({ prefix: prefixSchema }).strict();
export type WorkspacePrefixChangedPayload = z.infer<typeof workspacePrefixChangedPayload>;

/**
 * A project description: prose a person reads on the project card (door A,
 * 2026-09-19).
 *
 * **REFUSES a blank, for `displayName`'s own reason above** — `'   '` reads as a
 * description everywhere it is displayed while describing nothing. **Does NOT
 * trim**, also for that reason: the ledger stores the claim as it was made.
 *
 * **BOUNDED at 500 because the card renders it on one line**, and 500 is
 * `searchTermSchema`'s bound rather than a second number invented here.
 */
const descriptionText = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) => value.trim() !== '',
    'must not be blank: a description of only spaces describes nothing',
  );

export const projectCreatedPayload = z.object({
  name: displayName,
  /**
   * **OPTIONAL, and `.strict()` is what makes that safe.** The key cannot arrive
   * by accident, and every `project.created` written before this field existed
   * parses unchanged — which is the compatibility rule this repo applies to
   * every additive wire field.
   *
   * Absent means NOT DESCRIBED. There is deliberately no `null` spelling here:
   * the column is nullable because a LATER edit may clear a description, but a
   * create event either carries one or says nothing about one, and two ways to
   * spell "none" is how a reader ends up unable to say which happened.
   */
  description: descriptionText.optional(),
  /**
   * The project prefix (owner spec 2026-09-20): up to three capital letters,
   * entered when the project is created, and the second half of every ticket
   * key this project will ever hold — `CCSO-1183`.
   *
   * **OPTIONAL, for `description`'s reason exactly**: every `project.created`
   * in the ledger written before this field existed parses unchanged, and an
   * event that mentions no prefix is an event whose project still needs a key,
   * so the key's half is DERIVED from the name (`../prefix.ts`) — the name it
   * is FOUNDED under, see below — rather than omitted. Required-ness would make the key a precondition of founding a
   * project rather than a consequence of it, and would refuse the whole
   * pre-existing ledger in the same breath.
   *
   * **The FOUNDING prefix; a rename never moves it.** `project.updated`
   * renames a project and does not touch the key's half — a rename moves the
   * name and never the ticket keys, **entered or derived**. Only an explicit
   * `project.updated.prefix` (owner spec 2026-10-01, R1/R2) changes it, and then
   * every key re-reads and the former prefix stays reserved and resolvable. An un-entered prefix is derived
   * from THIS event's `name` (`proj_projects.founding_name`), never from the
   * project's current name, so a later `project.updated` cannot re-key it or
   * shift a neighbour's derived prefix.
   *
   * **UNIQUE WITHIN THE WORKSPACE** (owner ruling 2026-09-20). That is a
   * constraint on the value, not a shape this schema can express — a payload
   * schema sees one event and the rule spans a workspace's projects — so it is
   * enforced at the door and resolved at read time; see `../prefix.ts`.
   */
  prefix: prefixSchema.optional(),
}).strict();
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
      required_error: 'is required: a project-admin flag is a claim, not a default',
      invalid_type_error: 'is required: a project-admin flag is a claim, not a default',
    }),
  })
  .strict();
export type ProjectMemberAddedPayload = z.infer<typeof projectMemberAddedPayload>;

export const projectMemberRemovedPayload = z.object({ userId: ulidString }).strict();
export type ProjectMemberRemovedPayload = z.infer<typeof projectMemberRemovedPayload>;

/**
 * Archiving a project, and putting it back (Task 16 of the HIG per-screen plan,
 * owner brief 2026-09-09).
 *
 * ## An EVENT PAIR, not a boolean somebody sets
 *
 * The product's whole shape is that a stored fact is the fold of claims people
 * made, and `proj_projects.archived` is no exception: it is written by these two
 * events and by nothing else, so "who archived this, and when" is answerable
 * from the ledger without a second audit column. The pair is symmetric on
 * purpose — a single toggle event carrying `archived: boolean` would let a
 * re-delivery flip a project back, and `project.restored` reads honestly in a
 * history list where `project.archived { archived: false }` does not.
 *
 * ## The payloads are EMPTY, and `.strict()` is what makes that a refusal
 *
 * The project is `env.entity.id` — both types are filed against the project
 * entity, exactly as the two roster events are (`vocabulary.ts`), so there is
 * nothing left for a payload to name. Empty and `.strict()` rather than
 * `z.unknown()`: an actor who sends `{ projectId: '<somebody else's>' }` is
 * REFUSED rather than quietly ignored, which is the same reason
 * `POST /v1/workspaces` refuses a body naming the workspace it founds.
 *
 * ## What they deliberately do NOT mean
 *
 * Archiving hides a project from the places that list live work; it is not a
 * delete, it removes nobody's access, and no read in the product consults it as
 * a permission. There is still no `project.deleted` event anywhere — the
 * invitation gate in `apps/server/src/permissions/check-permission.ts` depends
 * on a founded project staying founded, and this pair keeps that true.
 */
export const projectArchivedPayload = z.object({}).strict();
export type ProjectArchivedPayload = z.infer<typeof projectArchivedPayload>;

export const projectRestoredPayload = z.object({}).strict();
export type ProjectRestoredPayload = z.infer<typeof projectRestoredPayload>;

/**
 * Rename / redescribe / re-prefix / re-file a project (MCP CRUD plan Task 1,
 * owner ruling M1, 2026-10-01; `prefix` and `groupId` added by the prefixes and
 * groups plan Task 1, owner spec 2026-10-01, R1/R2).
 * Filed against the PROJECT entity. `description: null` CLEARS the description —
 * the column has been nullable since door A precisely so a later edit could clear
 * it (see `projectCreatedPayload.description`); an absent key leaves it alone.
 * `groupId: null` takes the project OUT of its group (ungrouped); an absent key
 * leaves the group alone. A RENAME alone moves the name and never the ticket
 * keys — entered or DERIVED: a project with no entered prefix derives it from
 * its FOUNDING name (`project.created`'s `name`), which this event cannot touch
 * (owner, 2026-10-01). Only the `prefix` key changes the key's half. Whether
 * that prefix is free, and whether `groupId` names a real group, are rules
 * across the ledger and are enforced at the door, not here.
 */
export const projectUpdatedPayload = z
  .object({
    name: displayName.optional(),
    description: descriptionText.nullable().optional(),
    prefix: prefixSchema.optional(),
    groupId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (p) => p.name !== undefined || p.description !== undefined || p.prefix !== undefined || p.groupId !== undefined,
    'a project update names a new name, description, prefix or group',
  );
export type ProjectUpdatedPayload = z.infer<typeof projectUpdatedPayload>;
