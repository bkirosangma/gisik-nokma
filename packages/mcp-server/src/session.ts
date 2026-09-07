import type { McpConfig } from './config.js';
import { HttpError, type GisikClient } from './http-client.js';
import { runDeviceLogin, type LoginPrompt } from './device-login.js';
import { clearCachedToken, readCachedToken, writeCachedToken, type CachedToken } from './token-cache.js';

export type Session = {
  /** The signed-in user's ULID. Every write's `actorId` is this, and the
   *  permission gate refuses any envelope where it is not. */
  userId(): string;
  get(path: string): Promise<unknown>;
  postEvents(events: unknown[]): Promise<unknown>;
};

/**
 * Authentication, and the ONE retry.
 *
 * A 401 means the cached token is expired or revoked, which the person can fix
 * by approving a fresh one — so it re-runs the device flow and repeats the call
 * once. Exactly once: a server answering 401 to everything would otherwise spin
 * this loop forever and spend the device-flow rate-limit budget doing it, and
 * the second 401 is information the caller needs rather than a condition to
 * keep working around.
 *
 * No other status re-authenticates. A 404 from a visibility refusal is THE
 * ANSWER — the product's deliberate "you may not know whether this exists" —
 * and re-authenticating on it would turn a correct refusal into a login prompt.
 */
export async function createSession(deps: {
  config: McpConfig;
  client: GisikClient;
  prompt: LoginPrompt;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}): Promise<Session> {
  let cached: CachedToken =
    (await readCachedToken(deps.config.tokenPath)) ?? (await login());

  async function login(): Promise<CachedToken> {
    const fresh = await runDeviceLogin({
      client: deps.client,
      prompt: deps.prompt,
      sleep: deps.sleep,
      now: deps.now,
      deadlineMs: 600_000,
    });
    await writeCachedToken(deps.config.tokenPath, fresh);
    return fresh;
  }

  async function withReauth<T>(call: (token: string) => Promise<T>): Promise<T> {
    try {
      return await call(cached.token);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      await clearCachedToken(deps.config.tokenPath);
      cached = await login();
      return await call(cached.token);
    }
  }

  return {
    userId: () => cached.userId,
    get: (path) => withReauth((token) => deps.client.get(path, token)),
    postEvents: (events) => withReauth((token) => deps.client.post('/v1/events', { events }, token)),
  };
}
