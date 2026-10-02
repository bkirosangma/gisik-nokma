import type { Session } from './session.js';

/**
 * A `Session` that exists before any credential does.
 *
 * `createSession` authenticates EAGERLY: on a cache miss it runs the device
 * flow, which blocks for as long as it takes a person to open a browser and
 * type a code — up to the ten-minute deadline. The plan's `main.ts` awaited it
 * before `server.connect(...)`, and that ordering is fatal on a fresh install:
 * stdout stays silent, the client's `initialize` is never answered, and the
 * MCP client reports a server that failed to start. The person never learns
 * they were being asked to approve something, because the prompt went to
 * stderr — which for a stdio server is a log file nobody is reading.
 *
 * So the transport connects first and the credential is fetched on the FIRST
 * TOOL CALL instead. `ready()` is the seam: `registerTools` awaits it before
 * dispatching, which is what makes `userId()` — the one synchronous method on
 * `Session`, and the one every write's `actorId` comes from — safe to call
 * inside a handler.
 *
 * At most one login runs: concurrent first calls share the same promise. A
 * FAILED login is not memoised, deliberately — a device flow that hit its
 * deadline because the person was away from the keyboard must be retryable by
 * asking the assistant again, not a permanent state requiring a restart.
 */
export type LazySession = Session & {
  /** Resolve the credential if it is not resolved already. Idempotent. */
  ready(): Promise<void>;
};

export function lazySession(open: () => Promise<Session>): LazySession {
  let opening: Promise<Session> | null = null;
  let live: Session | null = null;

  async function ready(): Promise<void> {
    if (live !== null) return;
    opening ??= open().then(
      (session) => {
        live = session;
        return session;
      },
      (error: unknown) => {
        opening = null;
        throw error;
      },
    );
    await opening;
  }

  function resolved(): Session {
    if (live === null) {
      // Unreachable through `registerTools`, which awaits `ready()` first.
      // Stated rather than assumed, because the failure it replaces —
      // `undefined` reaching `actorId` — would be a malformed envelope
      // refused at the server door with no hint of where it came from.
      throw new Error('gisik-nokma is not signed in yet — await ready() before using the session');
    }
    return live;
  }

  return {
    ready,
    userId: () => resolved().userId(),
    get: async (path) => {
      await ready();
      return resolved().get(path);
    },
    post: async (path, body) => {
      await ready();
      return resolved().post(path, body);
    },
    postEvents: async (events) => {
      await ready();
      return resolved().postEvents(events);
    },
    getBytes: async (path) => {
      await ready();
      return resolved().getBytes(path);
    },
    postMultipart: async (path, fields, file) => {
      await ready();
      return resolved().postMultipart(path, fields, file);
    },
  };
}
