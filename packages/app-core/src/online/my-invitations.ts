import { HttpError, refusalText, type HttpClient } from './http.js';

/**
 * One invitation waiting for the signed-in person.
 *
 * `workspaceName` and `invitedByName` are `string | null` because the SERVER
 * can honestly not know either: a workspace with no naming event in its ledger
 * has no name, and an inviter whose account has since gone has no display name.
 * Both are served as `null` rather than dropped, and the banner writes its own
 * words for that case — a client that turned `null` into `'Unknown'` would be
 * inventing a fact, and one that dropped the row would withhold something only
 * its recipient can act on.
 */
export type PendingInvitation = {
  inviteId: string;
  workspaceId: string;
  workspaceName: string | null;
  role: 'admin' | 'member' | 'guest';
  invitedByName: string | null;
  invitedAt: string;
  expiresAt: string;
};

/**
 * The caller-scoped invitations surface (Task 17): what is waiting for ME, and
 * the two things I can do about it.
 *
 * ## Deliberately outside `DataSource`, on the same argument as its neighbours
 *
 * `invites.js`, `invites-admin.js` and `founding.js` are one-shot onboarding
 * actions no replica ever serves offline, and this is the fourth. An offline
 * replica cannot know whether an invitation is still pending — the answer
 * depends on a credential row and a clock that live only on the server — so
 * putting these three methods in `DataSource` would oblige Plan 10's replica to
 * implement something it could only refuse.
 *
 * ## Why `accept` is here and not on `InviteGateway`
 *
 * `InviteGateway.acceptInvite` takes a TOKEN. This one takes an invitation id,
 * and the difference is forced rather than stylistic: the raw token is
 * unrecoverable (sha256 at rest, one copy, handed out once at mint), so a
 * caller-scoped list has none to give. The two doors share one acceptance
 * SEMANTICS on the server (`apps/server/src/invites/acceptance.ts`) and differ
 * only in the proof they demand — possession of the link, or a verified email
 * equal to the address the invitation names.
 */
export type MyInvitationsGateway = {
  list(): Promise<PendingInvitation[]>;
  accept(inviteId: string): Promise<{ workspaceId: string }>;
  decline(inviteId: string): Promise<void>;
};

/**
 * Acting on an invitation failed, carrying the server's own sentence when it
 * sent one — the same shape, and for the same reason, as
 * `InviteAcceptanceError`: the banner shows a different thing for "this
 * invitation is no longer open" than for "the server broke", and `status` is
 * what tells them apart.
 */
export class InvitationActionError extends Error {
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(status: number | null, serverMessage: string | null) {
    super(serverMessage ?? `the invitation could not be acted on${status === null ? '' : ` (HTTP ${status})`}`);
    this.name = 'InvitationActionError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

const INVITE_ROLES: readonly PendingInvitation['role'][] = ['admin', 'member', 'guest'];

/**
 * `role` is CHECKED against the three the door can send, never cast — the rule
 * `invites.ts` states for the same field: the banner prints this value to a
 * person as the terms of the membership they are being offered, so a garbled
 * role would be rendered to them as fact. The door refuses `owner` on the way
 * in (`inviteSentPayload`), so three values is the whole set a pending
 * invitation can hold.
 *
 * A row that fails this THROWS rather than being dropped. Dropping it would
 * silently withhold an invitation only its recipient can act on, and the
 * server's own `LEFT JOIN` on the inviter was written the same way round for
 * the same reason.
 */
function asInvitation(raw: unknown): PendingInvitation {
  const record = (raw ?? {}) as Record<string, unknown>;
  const role = INVITE_ROLES.find((candidate) => candidate === record['role']);
  const optionalString = (value: unknown): value is string | null =>
    value === null || typeof value === 'string';
  if (
    typeof record['inviteId'] !== 'string' ||
    typeof record['workspaceId'] !== 'string' ||
    !optionalString(record['workspaceName']) ||
    !optionalString(record['invitedByName']) ||
    typeof record['invitedAt'] !== 'string' ||
    typeof record['expiresAt'] !== 'string' ||
    role === undefined
  ) {
    throw new Error(`the invitations list carried a row this client cannot read: ${JSON.stringify(raw)}`);
  }
  return {
    inviteId: record['inviteId'],
    workspaceId: record['workspaceId'],
    workspaceName: record['workspaceName'],
    role,
    invitedByName: record['invitedByName'],
    invitedAt: record['invitedAt'],
    expiresAt: record['expiresAt'],
  };
}

export function createHttpMyInvitationsGateway(http: HttpClient): MyInvitationsGateway {
  const act = async (inviteId: string, action: 'accept' | 'decline'): Promise<unknown> => {
    try {
      return await http.post(`/v1/me/invitations/${encodeURIComponent(inviteId)}/${action}`, {});
    } catch (cause) {
      // A POST 404 is the door's own "no longer open" body, not the transport's
      // read affordance — `send` gates 404-as-null on the method precisely so
      // this one can be read. The server's sentence rides out on the error.
      if (cause instanceof HttpError) {
        throw new InvitationActionError(cause.status, refusalText(cause.body));
      }
      throw cause;
    }
  };
  return {
    async list() {
      const raw = await http.get('/v1/me/invitations');
      const record = (raw ?? {}) as Record<string, unknown>;
      const invitations = record['invitations'];
      // NOT `?? []`. A response with no `invitations` key is a server this
      // client does not understand, and answering "you have none" for it would
      // be the banner asserting something about the world on no evidence — the
      // failure mode `stub-services.ts` refuses by name for every un-stubbed
      // read, applied to the wire.
      if (!Array.isArray(invitations)) {
        throw new Error('the invitations read answered no invitations list');
      }
      return invitations.map(asInvitation);
    },
    async accept(inviteId) {
      const raw = await act(inviteId, 'accept');
      const record = (raw ?? {}) as Record<string, unknown>;
      // A 2xx whose body names no workspace is still a failure, and it is not
      // the server refusing — there is no status and no sentence to carry,
      // which is what `null, null` says.
      if (typeof record['workspaceId'] !== 'string') throw new InvitationActionError(null, null);
      return { workspaceId: record['workspaceId'] };
    },
    async decline(inviteId) {
      // The door answers 204 and the transport turns that into `undefined`.
      // There is nothing to read and nothing to check: the invitation leaving
      // the caller's list is what the client observes, by re-reading it.
      await act(inviteId, 'decline');
    },
  };
}
