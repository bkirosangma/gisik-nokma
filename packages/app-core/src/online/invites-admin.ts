import { HttpError, refusalText, type HttpClient } from './http.js';

/**
 * What the mint door hands back, ONCE.
 *
 * `url` and not a token: the server builds it from `WEB_ORIGIN`
 * (`apps/server/src/routes/invites.ts:361`, `${deps.webOrigin}/invite/${token}`),
 * so the link the admin copies already points at this shell's `/invite/[token]`
 * route. A client that re-assembled a URL from a token would be a second
 * opinion about where the web app lives, free to drift from the server's.
 *
 * `expiresAt` rides along because an admin who cannot say when the link lapses
 * learns it from the person who could not get in.
 */
export type MintedInvite = { inviteId: string; url: string; expiresAt: string };

/** One row of the pending list. **No token** — see the gateway's docblock. */
export type PendingInvite = {
  inviteId: string;
  address: string;
  channel: string;
  role: string;
  projectIds: string[];
  invitedBy: string;
  invitedAt: string;
  /** `null` for the mint-crash residue the server's LEFT JOIN deliberately keeps listable. */
  expiresAt: string | null;
};

export type MintInviteRequest = {
  address: string;
  channel: string;
  role: string;
  /**
   * OMITTED, never `[]`. `inviteSentPayload` refuses the key entirely on a
   * guest invitation, and an empty array a client never asked for is refused as
   * if the admin had asked for one — the same reason `routes/invites.ts:319`
   * builds its payload with the key absent rather than empty.
   */
  projectIds?: string[];
};

/**
 * A door refused, with the server's own words.
 *
 * The two doors this gateway speaks to refuse in three ways that a caller does
 * three different things about, so the status is carried rather than folded
 * into a sentence:
 *
 * - **403** on the list (`INVITE_ADMIN_ONLY_BODY`) — the caller is not an owner
 *   or admin of this workspace. The members page uses exactly this to decide
 *   whether to draw the invite machinery at all; see its docblock for why that
 *   is the only honest gate available on this branch.
 * - **422** on the mint — the ingest layer's own `IngestResult`, verbatim: a
 *   plain member's `permission.role` refusal and the guest-with-projects parse
 *   refusal both arrive here unchanged.
 * - **400** on the mint — the door's JSON-schema refusal of a malformed body.
 */
export class InviteAdminError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  constructor(status: number, serverMessage: string | null) {
    super(serverMessage ?? `HTTP ${status} from an invite admin door`);
    this.name = 'InviteAdminError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/**
 * Minting and listing invitations — the admin half of spec §6, and the client
 * side of Plan 4 Task 14's two admin doors:
 *
 * - `POST /v1/workspaces/:workspaceId/invites` — `routes/invites.ts:285`
 * - `GET  /v1/workspaces/:workspaceId/invites` — `routes/invites.ts:542`
 *
 * ## REVOKE IS NOT HERE, and its absence is the design
 *
 * Withdrawing an invitation is `invite.revoked`, an ordinary registered domain
 * event (`packages/domain/src/vocabulary.ts:292`, payload `{inviteId}`) filed
 * against `entity: {kind:'invite', id: inviteId}`. It goes through
 * `DataSource.ingest` like every other claim a person makes, which means it
 * gets the ordinary door, the ordinary refusal, the ordinary attribution and —
 * for Plan 10's replica — the ordinary outbox. A revoke route on this gateway
 * would be a second write path for a claim the one write path already carries.
 *
 * It also needs no client-side role check: `invite.revoked` is in
 * `ADMIN_ONLY_TYPES` (`apps/server/src/permissions/check-permission.ts:207`),
 * so a member's revoke is refused at the same door, in the same words, as their
 * mint. A check here would be a second answer to that question, free to drift.
 *
 * ## No token is ever re-served, and this client must not imply one is
 *
 * The mint's response holds the ONE copy of the raw link; the server stores
 * only a sha256 hash. The pending list therefore carries `expiresAt` and no
 * token, deliberately — a list that re-served credentials would turn a read
 * into an issuance and hand every admin a working link to every invitation
 * anyone else had sent. `PendingInvite` has no token field for that reason, and
 * a UI over it must not offer a "show link again" affordance, because there is
 * nothing behind one.
 */
export type InviteAdminGateway = {
  mintInvite(workspaceId: string, request: MintInviteRequest): Promise<MintedInvite>;
  listPending(workspaceId: string): Promise<PendingInvite[]>;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function createHttpInviteAdminGateway(http: HttpClient): InviteAdminGateway {
  return {
    async mintInvite(workspaceId, request) {
      // The key is omitted rather than sent undefined: `JSON.stringify` drops an
      // undefined value, but building the object conditionally is what makes the
      // guest case readable at the call site rather than a serialisation
      // accident somebody later "tidies" into `projectIds: []`.
      const body: Record<string, unknown> =
        request.projectIds === undefined
          ? { address: request.address, channel: request.channel, role: request.role }
          : {
              address: request.address,
              channel: request.channel,
              role: request.role,
              projectIds: request.projectIds,
            };
      let raw: unknown;
      try {
        raw = await http.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`, body);
      } catch (cause) {
        if (cause instanceof HttpError) {
          throw new InviteAdminError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      const record = (raw ?? {}) as Record<string, unknown>;
      const inviteId = asString(record['inviteId']);
      const url = asString(record['url']);
      const expiresAt = asString(record['expiresAt']);
      // All three or none. A mint that returned a link with no expiry would be
      // shown to an admin under copy that promises to say when it lapses.
      if (inviteId === null || url === null || expiresAt === null) {
        throw new InviteAdminError(200, null);
      }
      return { inviteId, url, expiresAt };
    },

    async listPending(workspaceId) {
      let raw: unknown;
      try {
        raw = await http.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`);
      } catch (cause) {
        if (cause instanceof HttpError) {
          throw new InviteAdminError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      // A GET 404 arrives as `null` from the transport. This route has no 404
      // branch at all — it answers 403 or 200 — so a `null` here is a route
      // that moved, not an empty list, and returning `[]` would draw "no
      // invitations outstanding" over it.
      if (raw === null || typeof raw !== 'object') throw new InviteAdminError(404, null);
      const rows = (raw as Record<string, unknown>)['invites'];
      if (!Array.isArray(rows)) throw new InviteAdminError(200, null);
      return rows.map((entry, index) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        const inviteId = asString(row['inviteId']);
        if (inviteId === null) throw new InviteAdminError(200, null);
        const expiresAt = row['expiresAt'];
        return {
          inviteId,
          // An address is what an admin recognises the invitation BY, so a
          // missing one is shown as the gap it is rather than as an empty cell
          // that reads like an invitation to nobody.
          address: asString(row['address']) ?? `(no address recorded — row ${index + 1})`,
          channel: asString(row['channel']) ?? '(no channel recorded)',
          role: asString(row['role']) ?? '(no role recorded)',
          projectIds: Array.isArray(row['projectIds'])
            ? row['projectIds'].filter((id): id is string => typeof id === 'string')
            : [],
          // Same rule as `address`/`channel`/`role` above, and it was NOT applied
          // here until 2026-09-02: an empty string is indistinguishable from a
          // served one on a non-nullable `string`, so a malformed body would be
          // MASKED by the very field meant to attribute the invitation. Neither
          // can fire against the shipped door — `routes/invites.ts:579-580` always
          // serves both — which is exactly why the substitute had never been seen.
          invitedBy: asString(row['invitedBy']) ?? '(no inviter recorded)',
          invitedAt: asString(row['invitedAt']) ?? '(no invite date recorded)',
          expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
        };
      });
    },
  };
}
