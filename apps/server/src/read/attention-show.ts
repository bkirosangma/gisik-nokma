import { ATTENTION_SHOW_VALUES, type AttentionShow } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../permissions/effective-role.js';

/**
 * The attention strip's `?show=` filter (my-work-global T1, spec D2): its ONE
 * parse, shared by the two routes the strip is assembled from —
 * `GET /v1/workspaces/:ws/attention` (tickets) and `GET /v1/contests`
 * (contests, which the client appends to the strip). One parse, so the two
 * halves of one strip cannot accept different sets or refuse differently.
 *
 * ## What is refused, and why every refusal is the same 400
 *
 * `{ error: 'invalid_query' }` for each of:
 * - a `show` that is not ONE string — `?show=a&show=b` arrives as an array, the
 *   same shape `routes/my-work.ts` refuses for a repeated `workspaceId`;
 * - an empty value, or any comma-separated member outside
 *   `ATTENTION_SHOW_VALUES` (`show=`, `show=created,`, `show=bogus`);
 * - `ws-admin` when the viewer is not `owner` or `admin` in THIS workspace;
 * - `project-admin` when the viewer administers no project in THIS workspace.
 *
 * The last two are refused rather than answered: the UI offers a role chip only
 * where the viewer holds the role (`/v1/me/workspaces` carries `role` and
 * `adminProjectIds` for that), so a request naming one it does not hold is a
 * client bug, and a refusal is loud where a silent `FALSE` arm would look like
 * "nothing needs your attention". Every refusal is judged from the `eff` of the
 * workspace the request names, never from another workspace's role.
 *
 * Duplicates collapse (`created,created` is `{created}`): the answer is a set.
 * An ABSENT `show` is not a refusal — it is `show: undefined`, and both routes
 * then answer exactly as they did before this filter existed.
 */
export type ShowParse = { ok: true; show: ReadonlySet<AttentionShow> | undefined } | { ok: false };

export function parseShow(query: { show?: unknown }, eff: EffectiveRole): ShowParse {
  const raw = query.show;
  if (raw === undefined) return { ok: true, show: undefined };
  if (typeof raw !== 'string') return { ok: false };
  const members = raw.split(',');
  if (!members.every((member): member is AttentionShow => (ATTENTION_SHOW_VALUES as readonly string[]).includes(member))) {
    return { ok: false };
  }
  const show = new Set<AttentionShow>(members);
  if (show.has('ws-admin') && eff.workspaceRole !== 'owner' && eff.workspaceRole !== 'admin') {
    return { ok: false };
  }
  if (show.has('project-admin') && adminProjectIdsOf(eff).length === 0) {
    return { ok: false };
  }
  return { ok: true, show };
}

/**
 * The projects this viewer administers in `eff`'s workspace, sorted: the ones
 * whose roster row carries `projectAdmin`. An owner's or admin's IMPLICIT
 * rule-A projects carry `projectAdmin: false` (`resolveEffectiveRole`), so a
 * workspace role alone administers no project here — that is `ws-admin`'s arm.
 *
 * One definition for the `project-admin` arm (`readAttention`'s SQL and
 * `ticketMatchesShow` below), its refusal in `parseShow`, and the
 * `adminProjectIds` field `/v1/me/workspaces` serves to decide whether the chip
 * is offered.
 */
export function adminProjectIdsOf(eff: EffectiveRole): string[] {
  return [...eff.projects]
    .filter(([, project]) => project.projectAdmin)
    .map(([projectId]) => projectId)
    .sort();
}

/**
 * Does one ticket match a parsed `show`? The per-row form of the arms
 * `readAttention` puts in its SQL, for `GET /v1/contests`, which judges each
 * contest by the ticket it names. The two must change together; the attention
 * cases (30.003–30.009) pin the SQL and the contests cases (30.059–30.061) pin
 * this.
 *
 * `ws-admin` matches every row: `parseShow` has already refused it unless the
 * viewer is `owner` or `admin` in this workspace. Visibility is NOT judged here
 * — each caller keeps its own audience check (`visibleTicketsWhere`, `canOpen`),
 * and this only ever narrows what that check let through.
 */
export function ticketMatchesShow(
  ticket: { createdBy: string | null; assigneeId: string | null; projectId: string | null },
  show: ReadonlySet<AttentionShow>,
  viewerId: string,
  eff: EffectiveRole,
): boolean {
  if (show.has('created') && ticket.createdBy === viewerId) return true;
  if (show.has('assigned') && ticket.assigneeId === viewerId) return true;
  if (show.has('ws-admin')) return true;
  if (show.has('project-admin') && ticket.projectId !== null) {
    return adminProjectIdsOf(eff).includes(ticket.projectId);
  }
  return false;
}
