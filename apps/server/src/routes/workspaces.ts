import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { visibleProjects } from '../read/visible-projects.js';
import {
  nameRestrictedProjectCount,
  ticketVisibleProjectIds,
  visibleMemberCount,
  visibleProjectCounts,
} from '../read/workspace-counts.js';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { workspaceNameFromLedger } from '../workspaces/workspace-name.js';

/** The refusal body a blank name draws. Built once so both the route and its test name one object. */
export const INVALID_NAME_BODY = {
  error: 'invalid',
  message: 'A workspace needs a name.',
} as const;

/**
 * The founding door and the directory that answers it.
 *
 * Until the owner decision of 2026-08-26 there was no workspace-creation route
 * anywhere in the series: every workspace in every test arrived by hand-
 * appending a `workspace.created` envelope, and the product had no way to make
 * its first one.
 *
 * ## The route mints the workspace id, and refuses a body that names one
 *
 * A workspace's id IS its founding entity's id, and it is a ULID minted HERE.
 * That is not tidiness — it is the route's half of case 6.52. The gate refuses
 * a `workspace.created` naming an already-founded workspace
 * (`../permissions/check-permission.ts`), but that refusal is reachable from
 * `POST /v1/events`, not from here: a route-originated founding always names a
 * workspace with no ledger, so `workspaceExists` is always false on this path
 * and the gate's branch is never taken.
 *
 * What makes "a client cannot choose the workspace it founds" TRUE at this door
 * is therefore the body schema's `additionalProperties: false`, not the
 * destructuring below. The plan text reads `request.body` with no schema at
 * all, and under that version `{ name: 'X', workspaceId: '<somebody else's>' }`
 * is silently ignored — which is the right outcome by accident, one refactor
 * away from being the wrong one. Declared refusal is the house idiom and the
 * app is built for it: `app.ts` sets `removeAdditional: false` precisely so an
 * unknown key is answered rather than stripped (see `events.ts`).
 *
 * ## It submits through the GATED client door
 *
 * `ingest.ingestClientBatch`, never `ingestBatch`. **The plan text's call is
 * `deps.ingest.ingestBatch([founding], { sessionUserId: request.currentUserId })`
 * and it is wrong on three counts** — wrong door (ungated: it would let this
 * route append anything, including the server's own provenance), wrong second
 * argument (the session id is a string, not an options object), and not even
 * reachable: `AppDeps.ingest` is narrowed to `ClientIngest`, on which
 * `ingestBatch` does not exist, so the plan's line does not compile. That
 * narrowing is the guard working as designed.
 *
 * Founding still succeeds through the gate because `checkRolePermission` lets a
 * `workspace.created` past the membership check when the workspace has no
 * ledger — founding needs a session, not a membership — and the founding
 * SEQUENCE (the default workflow, the four built-in types, the founder's owner
 * grant) is appended by `bootstrapWorkspace` through the internal door, from
 * inside the ingest path. This route knows nothing about that sequence,
 * deliberately: Plan 11's seed CLIs found workspaces through the same path, so
 * there is exactly one founding sequence between them.
 *
 * ## `origin: 'web'` and `actorId: currentUserId`
 *
 * Envelope-origin `'web'`, not `'server'`: this is a person's claim to have
 * founded a workspace, and the gate refuses a client-submitted event wearing
 * the server's provenance. `actorId` must equal the session user for the same
 * reason — the gate's first question is whether the actor is the person
 * submitting.
 */
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; ingest: ClientIngest },
  requireSession: preHandlerHookHandler,
): void {
  app.post(
    '/v1/workspaces',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          // The client does not get to name the workspace it founds. See the
          // docblock: this is the route's half of case 6.52.
          additionalProperties: false,
          properties: { name: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { name } = request.body as { name: string };
      // `minLength: 1` admits `'   '`, which names nothing while looking like a
      // name everywhere it is displayed. The domain schema refuses it too
      // (`displayName` in `packages/domain/src/events/membership.ts`), so
      // nothing would be appended either way — but that refusal arrives as a
      // per-event `invalid` result inside a 422, and a malformed request
      // deserves the 400 the rest of this door answers with.
      if (name.trim() === '') {
        return reply.code(400).send(INVALID_NAME_BODY);
      }

      const workspaceId = newUlid();
      const founding: SubmittedEvent = {
        id: newUlid(),
        workspaceId,
        entity: { kind: 'workspace', id: workspaceId },
        type: 'workspace.created',
        version: 1,
        payload: { name },
        actorId: request.currentUserId,
        origin: 'web',
        clientTime: new Date().toISOString(),
      };

      const [result] = await deps.ingest.ingestClientBatch([founding], request.currentUserId);
      if (result === undefined) {
        throw new Error('ingest returned no result for the founding event');
      }
      // DEFENSIVE, and said plainly rather than pinned by a test that would
      // pass for an unrelated reason: with the id minted here and the payload
      // already checked, there is no submission this route can build that the
      // gate or the engine refuses. It stays because "the ingest layer's own
      // refusal, verbatim" is the contract Task 13 publishes, and a route that
      // silently 201'd a refusal would be worse than an unreachable branch.
      if (result.status !== 'committed') {
        return reply.code(422).send(result);
      }
      return reply.code(201).send({ workspaceId });
    },
  );

  /**
   * The directory: the workspaces this person belongs to, with names and roles.
   *
   * Added at Plan 6's walk (2026-08-27), which found the gap the hard way: Plan
   * 6's navigation codes against this route, its Playwright smoke MOCKS it, and
   * no plan served it — so a signed-in person could found a workspace and then
   * have no way to be told they belong to it.
   *
   * It reads `proj_memberships` and nothing else, which is what makes three of
   * its properties true at once and none of them a special case: a guest is
   * told where they are a guest (that is their own membership, not somebody
   * else's data); a revoked membership disappears on the next call, because
   * revocation deletes the workspace-scope row; and a half-founded workspace
   * never appears at all, because its founder holds no grant.
   *
   * `scope_kind = 'workspace'` rather than every row: a project-scope row is an
   * association inside a workspace the workspace-scope row already names, so
   * including them would list the same workspace once per project.
   */
  app.get('/v1/me/workspaces', { preHandler: requireSession }, async (request) => {
    const { rows } = await deps.pool.query<{ workspace_id: string; role: string }>(
      `SELECT workspace_id, role FROM proj_memberships
        WHERE user_id = $1 AND scope_kind = 'workspace'
        ORDER BY workspace_id`,
      [request.currentUserId],
    );
    const workspaces: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      // Resolved PER WORKSPACE, never once for the caller: `eff.projects` is a
      // set within one workspace, and reusing another workspace's resolution
      // here would be a cross-tenancy answer wearing the right shape.
      const eff = await resolveEffectiveRole(deps.pool, request.currentUserId, row.workspace_id);
      const [memberCount, counts, projects, ticketVisible] = await Promise.all([
        visibleMemberCount(deps.pool, eff, row.workspace_id),
        visibleProjectCounts(deps.pool, eff, request.currentUserId, row.workspace_id),
        // Rulings P32/P38. A viewer outside a project is not told its NAME —
        // and this list being partial is the CORRECT answer, not a defect. See
        // `read/visible-projects.ts` for why that is an application of
        // `resolveEffectiveRole` rather than a new rule.
        visibleProjects(deps.pool, eff, row.workspace_id),
        // Task 18's option-2 half. It runs BESIDE `visibleProjects` rather than
        // after it — the SQL depends only on `eff`, and the subtraction that
        // needs both answers is pure and happens below. Sequencing them would
        // have cost a round trip per workspace to express the same rule.
        ticketVisibleProjectIds(deps.pool, eff, request.currentUserId, row.workspace_id),
      ]);
      workspaces.push({
        workspaceId: row.workspace_id,
        name: await workspaceNameFromLedger(deps.pool, row.workspace_id),
        role: row.role,
        // WITHHELD IS AN ABSENT KEY, NEVER A ZERO (Task 16). A guest resolves
        // `null` here and the key is not written at all, so the card renders
        // "Restricted" rather than a number nobody counted. `?? 0` anywhere on
        // this path would turn a withholding into a false statement, and the
        // mapper's own refusal (`asNumber` on an absent key) would never fire.
        ...(memberCount === null ? {} : { memberCount }),
        // ALWAYS PRESENT, for every caller including a guest — the one count on
        // this route that is not withheld from anybody (owner ruling
        // 2026-09-09, option 2). `read/workspace-counts.ts` argues why at
        // length: this is a count of project ids the caller already carries on
        // their own ticket cards, so it discloses a NAME restriction and not an
        // existence. An owner's is `0` by construction. Copying the guest guard
        // from the two counts above would withhold it from the exact viewer the
        // owner's reference card draws it on.
        nameRestrictedProjectCount: nameRestrictedProjectCount(ticketVisible, projects),
        projects: projects.map((project) => {
          const count = counts?.get(project.projectId);
          return {
            projectId: project.projectId,
            name: project.name,
            // Served to every viewer who is told the project's NAME, guests
            // included — see `read/visible-projects.ts`. It is not a count.
            archived: project.archived,
            // `counts === null` is the WITHHOLDING, decided once in
            // `visibleProjectCounts` and never re-asked here. Inside a served
            // map, a project with no row is an honest 0 — the aggregation
            // groups only projects with visible tickets, and "none you can see"
            // is a true claim to a caller who is being served counts at all.
            ...(counts === null
              ? {}
              : {
                  ticketCount: count?.ticketCount ?? 0,
                  blockedCount: count?.blockedCount ?? 0,
                }),
          };
        }),
      });
    }
    return { workspaces };
  });
}
