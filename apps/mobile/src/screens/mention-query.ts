import type { MemberListResponse } from '@gisik-nokma/domain';
import { memberLabel } from '@gisik-nokma/app-core';

/**
 * E2-52: `ticket-screen.tsx` never passed `onMentionQuery` to `EditorWebView`,
 * so every `@`-mention query fell through to the editor host's own
 * `?? Promise.resolve([])` fallback (`editor-web-view.tsx:82`) and the popup
 * stated "No people match" for every query, on every workspace. The replica
 * has no roster to answer from (`ReplicaDataSource`'s own `MEMBERS_ABSENCES`
 * — Plan 10's documented gap), but the phone already holds the bearer token
 * and API base it uses for sync, and `GET /v1/workspaces/:id/members` is the
 * same endpoint the web sheet's `queryUsers` is ultimately backed by — no
 * new door, an existing one this device was never asked to call.
 *
 * The residual `ticket-sheet.tsx:945-962` names for the web sheet applies
 * here too and is not re-fixed by this task: a refused roster still resolves
 * `[]`, which the popup still renders as "No people match" rather than
 * "could not be asked" — distinguishing those needs the popup protocol
 * itself to carry an availability signal (`mention-popup.ts`'s
 * `mentionResultAnnouncement`, outside `@gisik-nokma/mobile`), the same
 * repair E2-39 asks for at a different door.
 */
export type MentionCandidate = { userId: string; name: string };

export async function queryWorkspaceMembers(opts: {
  apiBase: string;
  token: string;
  workspaceId: string;
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<MentionCandidate[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.apiBase}/v1/workspaces/${opts.workspaceId}/members`, {
    headers: { authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as MemberListResponse;
  const needle = opts.query.trim().toLowerCase();
  // BOTH sides resolved through `memberLabel` (2026-09-22, case 13.1296) — the
  // label the popup shows AND the string the query matches against.
  // `displayName` verbatim was blank for the magic-link population, so such a
  // member was a nameless row no typing could reach: the same defect E5-4
  // closed on the web sheet's `queryUsers`, one surface over. Resolving only
  // the LABEL would leave them listed and still unfindable.
  //
  // A wire `WorkspaceMember`, so the fields are renamed on the way in — the
  // structural parameter is what lets this pass a shape that is not a
  // `RosterMember`. This list names PEOPLE, so no `actorLabel` and no system
  // override: that step belongs to claims.
  return body.members
    .map((member) => ({
      userId: member.userId,
      name: memberLabel({ id: member.userId, name: member.displayName, email: member.email }),
    }))
    .filter((candidate) => needle === '' || candidate.name.toLowerCase().includes(needle));
}
