import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { LookedUpPerson } from '../people/types.js';
import { HttpError, refusalText, type HttpClient } from './http.js';

/** A people door refused, with its status and the server's own words. */
export class PeopleLookupError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  constructor(status: number, serverMessage: string | null) {
    super(serverMessage ?? `HTTP ${status} from a people door`);
    this.name = 'PeopleLookupError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

export type PeopleGateway = {
  lookup(workspaceId: string, email: string): Promise<LookedUpPerson | null>;
  assignOutsider(workspaceId: string, userId: string, event: SubmittedEvent): Promise<IngestResult>;
};

function isIngestResult(value: unknown): value is IngestResult {
  return typeof value === 'object' && value !== null && typeof (value as { status?: unknown }).status === 'string';
}

/**
 * The two access-plan doors (Task 6):
 * `POST /v1/workspaces/:id/people-lookup` and `…/assign-outsider`. A 422 from
 * the second IS an answer (the claim's own refusal) and is returned, never
 * thrown — the caller renders it where the control is, as it renders an ingest
 * refusal.
 */
export function createHttpPeopleGateway(http: HttpClient): PeopleGateway {
  const base = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
  return {
    async lookup(workspaceId, email) {
      let raw: unknown;
      try {
        raw = await http.post(`${base(workspaceId)}/people-lookup`, { email });
      } catch (cause) {
        if (cause instanceof HttpError) throw new PeopleLookupError(cause.status, refusalText(cause.body));
        throw cause;
      }
      const user = (raw as { user?: unknown } | null)?.user;
      return user === null || user === undefined ? null : (user as LookedUpPerson);
    },

    async assignOutsider(workspaceId, userId, event) {
      let raw: unknown;
      try {
        raw = await http.post(`${base(workspaceId)}/assign-outsider`, { userId, event });
      } catch (cause) {
        if (cause instanceof HttpError) {
          const result = (cause.body as { result?: unknown } | undefined)?.result;
          if (cause.status === 422 && isIngestResult(result)) return result;
          throw new PeopleLookupError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      const result = (raw as { result?: unknown } | null)?.result;
      if (!isIngestResult(result)) throw new PeopleLookupError(200, null);
      return result;
    },
  };
}
