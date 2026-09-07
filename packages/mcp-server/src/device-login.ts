import type { GisikClient } from './http-client.js';
import type { CachedToken } from './token-cache.js';

export type LoginPrompt = (info: { userCode: string; verificationUri: string }) => void;

type MintResponse = {
  deviceCode: string; userCode: string; verificationUri: string;
  expiresInSec: number; pollIntervalSec: number;
};

/**
 * The whole device flow, with every source of time injected so a test can run
 * it in microseconds and a reader can see there is no hidden clock.
 *
 * The poll INTERVAL comes from the server's own answer rather than a constant
 * here, because the server is the side that knows its rate-limit budget. A
 * client with its own number would 429 itself the day that budget changes, and
 * a login loop that rate-limits its own polling is indistinguishable from a
 * server that never approves.
 */
export async function runDeviceLogin(deps: {
  client: GisikClient;
  prompt: LoginPrompt;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  deadlineMs: number;
}): Promise<CachedToken> {
  const minted = (await deps.client.post('/v1/mcp/device/code', {}, null)) as MintResponse;
  deps.prompt({ userCode: minted.userCode, verificationUri: minted.verificationUri });

  const started = deps.now();
  const intervalMs = minted.pollIntervalSec * 1000;

  for (;;) {
    const answer = (await deps.client.post(
      '/v1/mcp/device/token',
      { deviceCode: minted.deviceCode },
      null,
    )) as { status: 'pending' } | { status: 'issued'; token: string; userId: string };

    if (answer.status === 'issued') {
      return { token: answer.token, userId: answer.userId };
    }
    if (deps.now() - started >= deps.deadlineMs) {
      throw new Error(
        `the sign-in request expired before it was approved. Run the tool again and approve ` +
          `${minted.verificationUri} with the code it shows.`,
      );
    }
    await deps.sleep(intervalMs);
  }
}
