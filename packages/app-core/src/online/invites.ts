import { HttpError, refusalText, type HttpClient } from './http.js';

export type InviteSummary = {
  workspaceId: string;
  workspaceName: string;
  role: 'admin' | 'member' | 'guest';
};

/**
 * Invite links (spec §6): an admin mints a link; whoever holds it signs in and
 * accepts, and the SERVER appends the membership.
 *
 * **Deliberately outside `DataSource`.** Acceptance is a one-shot onboarding
 * action no replica ever serves offline, so it has no place among the thirteen
 * methods a replica must implement (Plan 10 implements `DataSource`, not this).
 *
 * ## The plan's "surface gap" is CLOSED, and the routes were verified at source
 *
 * Plan 6 Task 15 says "no plan currently owns invite issuance/acceptance server
 * routes". That sentence is stale: **Plan 4 Task 14 built exactly this surface**
 * and pinned it verbatim, the contract having flowed client-to-server for once.
 * Both paths were re-derived from the shipped registrations before this file was
 * written, not taken from the plan:
 *
 * - `GET  /v1/invites/:token`        — `apps/server/src/routes/invites.ts:378`
 * - `POST /v1/invites/:token/accept` — `apps/server/src/routes/invites.ts:397`
 *
 * and the response shapes match the plan's field for field —
 * `{workspaceId, workspaceName, role}` and `{workspaceId}`.
 *
 * ## Three facts about the shipped door this client honours
 *
 * 1. **The token is server-owned and hashed** (`hashToken`, sha256 at
 *    `invites.ts:126`). It is NOT the invite event's id, so reading the ledger
 *    confers nothing. This module therefore treats the token as an opaque
 *    bearer credential: it is URI-encoded into a path and never parsed, logged
 *    or displayed.
 * 2. **`GET` requires no session, `POST /accept` does.** That asymmetry is the
 *    door's, and it is what lets a signed-out arrival be told which workspace
 *    they are being asked to join before they are made to authenticate. This
 *    module makes no session check of its own — a client-side gate here would
 *    be a second answer to a question the door already answers.
 * 3. **Every acceptance-path event's `actorId` is the ACCEPTOR**, with the
 *    authorization tracing through `inviteId` to the admin's attributed
 *    `invite.sent`. Nothing is submitted from here: the accept route appends
 *    through the server's own door because `invite.accepted` is refused from
 *    every client envelope-origin at every role.
 */
export type InviteGateway = {
  /**
   * `null` means the link opens nothing — used, withdrawn, lapsed, or never
   * real. All four arrive as ONE 404 with one frozen body
   * (`INVITE_NOT_OPENABLE_BODY`), deliberately, so a holder learns nothing
   * about which; `createHttpClient` turns a GET 404 into `null`, which is that
   * same refusal to distinguish carried into the type.
   *
   * The consequence, stated because a caller must handle it: the server's own
   * sentence is NOT reachable here. The read affordance discards the body, so a
   * page rendering this `null` writes its own copy, and that copy must say the
   * same three things the server's does — used, withdrawn, or lapsed — rather
   * than the narrower "expired" a reader would guess.
   */
  getInvite(token: string): Promise<InviteSummary | null>;
  acceptInvite(token: string): Promise<{ workspaceId: string }>;
};

/**
 * The acceptance failed, carrying the server's own sentence when it sent one.
 *
 * A named class rather than a bare `Error` for the same reason `HttpError` is
 * one: the invite page shows a different thing for "this link is dead" than for
 * "the server broke", and `status` is what tells them apart. `serverMessage` is
 * `null` when the door sent nothing readable — never a manufactured sentence.
 */
export class InviteAcceptanceError extends Error {
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(status: number | null, serverMessage: string | null) {
    super(serverMessage ?? `invite acceptance failed${status === null ? '' : ` (HTTP ${status})`}`);
    this.name = 'InviteAcceptanceError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/**
 * `role` is CHECKED against the three the door can send rather than cast.
 *
 * The plan's snippet writes `(record.role ?? 'member') as InviteSummary['role']`,
 * which does two untrue things at once: it invents `member` for a response that
 * named no role, and it stamps this union onto whatever string arrived. The
 * page prints this value in "You are invited to join X as Y", so a garbled role
 * would be rendered to a person as the terms of their membership. The door
 * refuses `owner` on the way in (`inviteSentPayload`), so three values is the
 * whole set a pending invitation can hold.
 */
const INVITE_ROLES: readonly InviteSummary['role'][] = ['admin', 'member', 'guest'];

function asInviteRole(value: unknown): InviteSummary['role'] | null {
  return INVITE_ROLES.find((role) => role === value) ?? null;
}

export function createHttpInviteGateway(http: HttpClient): InviteGateway {
  return {
    async getInvite(token) {
      const raw = await http.get(`/v1/invites/${encodeURIComponent(token)}`);
      if (raw === null || typeof raw !== 'object') return null;
      const record = raw as Record<string, unknown>;
      const role = asInviteRole(record['role']);
      if (
        typeof record['workspaceId'] !== 'string' ||
        typeof record['workspaceName'] !== 'string' ||
        role === null
      ) {
        return null;
      }
      return { workspaceId: record['workspaceId'], workspaceName: record['workspaceName'], role };
    },
    async acceptInvite(token) {
      let raw: unknown;
      try {
        raw = await http.post(`/v1/invites/${encodeURIComponent(token)}/accept`, {});
      } catch (cause) {
        // A POST 404 is the dead-link body, NOT the transport's read affordance
        // — `send` gates 404-as-null on the method precisely so this one can be
        // read. The server's sentence rides out on the error.
        if (cause instanceof HttpError) {
          throw new InviteAcceptanceError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      const record = (raw ?? {}) as Record<string, unknown>;
      // A 2xx whose body does not name a workspace is still a failure, and it
      // is not the server refusing — there is no status and no sentence to
      // carry, which is what `null, null` says.
      if (typeof record['workspaceId'] !== 'string') throw new InviteAcceptanceError(null, null);
      return { workspaceId: record['workspaceId'] };
    },
  };
}
