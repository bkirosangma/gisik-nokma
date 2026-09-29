import { HttpError, refusalText, type HttpClient } from './http.js';

/** The members door failed for a reason that is not the gate's answer. */
export class MemberRemovalError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  constructor(status: number, serverMessage: string | null) {
    super(serverMessage ?? `HTTP ${status} from the member-removal door`);
    this.name = 'MemberRemovalError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/** An invitation the server could not withdraw after the membership went. */
export type InviteNotWithdrawn = { inviteId: string; rule: string; reason: string };

/**
 * What removing a person came to. `refused` IS an answer — the gate's own rule
 * and words (last owner, only an owner may remove an owner) — returned, never
 * thrown, so the page can show it where the control is, as it shows an ingest
 * refusal.
 */
export type RemoveMemberOutcome =
  | { kind: 'removed'; invitesWithdrawn: number; invitesNotWithdrawn: InviteNotWithdrawn[] }
  | { kind: 'refused'; rule: string; reason: string };

export type MembersGateway = {
  remove(workspaceId: string, userId: string): Promise<RemoveMemberOutcome>;
};

/**
 * `POST /v1/workspaces/:id/members/:userId/remove` (access follow-ups R5): 200
 * `{ revoked, invitesWithdrawn, invitesNotWithdrawn? }`, or 409 `{ rule, reason }`
 * for the gate's refusal. Anything else (the shared 404 for a non-admin, a 5xx)
 * throws a `MemberRemovalError` carrying the server's words when it sent any.
 */
export function createHttpMembersGateway(http: HttpClient): MembersGateway {
  return {
    async remove(workspaceId, userId) {
      const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/remove`;
      let raw: unknown;
      try {
        raw = await http.post(path, {});
      } catch (cause) {
        if (cause instanceof HttpError) {
          const body = cause.body as { rule?: unknown; reason?: unknown } | null | undefined;
          if (cause.status === 409 && typeof body?.rule === 'string' && typeof body.reason === 'string') {
            return { kind: 'refused', rule: body.rule, reason: body.reason };
          }
          throw new MemberRemovalError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      const body = raw as { revoked?: unknown; invitesWithdrawn?: unknown; invitesNotWithdrawn?: unknown } | null;
      if (body === null || typeof body !== 'object' || body.revoked !== true) throw new MemberRemovalError(200, null);
      return {
        kind: 'removed',
        invitesWithdrawn: typeof body.invitesWithdrawn === 'number' ? body.invitesWithdrawn : 0,
        invitesNotWithdrawn: Array.isArray(body.invitesNotWithdrawn) ? (body.invitesNotWithdrawn as InviteNotWithdrawn[]) : [],
      };
    },
  };
}
