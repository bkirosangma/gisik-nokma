import { HttpError, refusalText, type HttpClient } from './http.js';

/**
 * Founding a workspace refused, with the door's own words.
 *
 * `POST /v1/workspaces` (`apps/server/src/routes/workspaces.ts:74`) refuses in
 * two shapes and the status is what tells them apart:
 *
 * - **400** `INVALID_NAME_BODY` — a name that is only whitespace. The route
 *   checks `name.trim() === ''` above the ledger on purpose: `minLength: 1`
 *   admits `'   '`, which names nothing while looking like a name everywhere it
 *   is displayed, and the domain schema would refuse it anyway — but as a
 *   per-event `invalid` inside a 422, and a malformed request deserves the 400
 *   the rest of that door answers with.
 * - **422** the ingest layer's own `IngestResult`, verbatim.
 *
 * Both carry a sentence, and both sentences reach the screen unparaphrased.
 */
export class FoundingError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  constructor(status: number, serverMessage: string | null) {
    super(serverMessage ?? `HTTP ${status} from POST /v1/workspaces`);
    this.name = 'FoundingError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/**
 * Founding a workspace — the client half of Plan 4 Task 13's door.
 *
 * ## Why this is a gateway and not a thirteenth `DataSource` method
 *
 * Same argument as `InviteGateway`, and it is the one Task 15 makes explicitly:
 * `DataSource` is the contract a REPLICA must also satisfy (Plan 10), and
 * founding a workspace is a one-shot onboarding action no replica ever serves
 * offline — there is no local state a founding could be answered from, and an
 * outbox entry for one would be a workspace that exists on one device. Adding
 * it to `DataSourceQuery` would oblige the replica to implement something it
 * can only refuse.
 *
 * ## Why it is not a bare `fetch` in the page either
 *
 * Coordination amendment 10: `src/online/` is the one module in this package
 * that speaks HTTP, and `test/no-http-in-views.test.ts` enforces it against the
 * checked-in source. The web shell's `/workspaces` page could legally reach for
 * `fetch` — the scanner covers `packages/app-core/src/views/` and not
 * `apps/web` — but then the URL, the refusal shapes and the 201 contract would
 * live in a page component, where nothing in this package's test suite can see
 * them. Naming the owner here is what lets the shape be pinned by a test that
 * runs on the gate.
 */
export type FoundingGateway = {
  /**
   * `prefix` is the workspace's half of every ticket key — `CC` in `CCSO-1183`
   * (owner spec 2026-09-20). OPTIONAL, and omitted rather than sent as `''`:
   * an untouched box makes no claim, and a workspace founded without one still
   * gets a key, because the half is derived from the name.
   */
  foundWorkspace(name: string, prefix?: string): Promise<{ workspaceId: string }>;
};

export function createHttpFoundingGateway(http: HttpClient): FoundingGateway {
  return {
    async foundWorkspace(name, prefix) {
      let raw: unknown;
      try {
        // The name is sent AS TYPED, untrimmed. Trimming here would silently
        // repair a claim the person made and hand the ledger a name they did
        // not write — and it would make the door's 400 unreachable for the one
        // input it exists to refuse. What the user typed is what is submitted;
        // what the server thinks of it comes back in its own words.
        // Spread rather than `prefix`, so the body genuinely lacks the key when
        // the box was untouched — `workspaceCreatedPayload` is `.strict()` and
        // the route's body schema allows the property only when it is a string.
        raw = await http.post('/v1/workspaces', {
          name,
          ...(prefix === undefined ? {} : { prefix }),
        });
      } catch (cause) {
        if (cause instanceof HttpError) {
          throw new FoundingError(cause.status, refusalText(cause.body));
        }
        throw cause;
      }
      const record = (raw ?? {}) as Record<string, unknown>;
      const workspaceId = record['workspaceId'];
      // A 201 with no id is not a workspace anybody can be sent to. Routing on
      // `undefined` would put the founder at `/w/undefined/my-work`, which is a
      // 404 wearing the shape of success.
      if (typeof workspaceId !== 'string') throw new FoundingError(201, null);
      return { workspaceId };
    },
  };
}
