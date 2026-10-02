import { describe, expect, it, vi } from 'vitest';
import { runDeviceLogin } from '../src/device-login.js';
import type { GisikClient } from '../src/http-client.js';
import { NO_CLIENT_TRANSFER } from './fixtures/fake-session.js';

/**
 * Plan: MCP server, Task 7. Cases 14.50–14.52.
 *
 * The plan's own docblock for this file says "14.50–14.53" and then defines
 * three cases. `14.53` does not exist — corrected here rather than carried,
 * because a docblock naming a case no test defines is exactly what
 * `check-case-citations.mjs` exists to catch, and the catalogue would have
 * inherited a ✅ with nothing behind it.
 */
function clientAnswering(script: unknown[]): { client: GisikClient; posts: string[] } {
  const posts: string[] = [];
  let i = 0;
  const client: GisikClient = {
    ...NO_CLIENT_TRANSFER,
    get: async () => { throw new Error('not used'); },
    post: async (path) => {
      posts.push(path);
      const next = script[i];
      i += 1;
      if (next === undefined) throw new Error('script exhausted');
      return next;
    },
  };
  return { client, posts };
}

describe('the device flow', () => {
  it('14.50 mints, prompts, polls until issued, and returns token + userId', async () => {
    const { client, posts } = clientAnswering([
      { deviceCode: 'dev', userCode: 'BCDF-GHJK', verificationUri: 'http://web/mcp/authorize', expiresInSec: 600, pollIntervalSec: 12 },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'issued', token: 'tok', userId: '01J0USER0000000000000000AA' },
    ]);
    const prompt = vi.fn();
    const sleep = vi.fn(async () => {});

    const result = await runDeviceLogin({
      client, prompt, sleep, now: () => 0, deadlineMs: 600_000,
    });

    expect(result).toEqual({ token: 'tok', userId: '01J0USER0000000000000000AA' });
    expect(prompt).toHaveBeenCalledWith({ userCode: 'BCDF-GHJK', verificationUri: 'http://web/mcp/authorize' });
    expect(posts).toEqual([
      '/v1/mcp/device/code',
      '/v1/mcp/device/token',
      '/v1/mcp/device/token',
      '/v1/mcp/device/token',
    ]);
    // The interval comes from the SERVER's answer, not from a constant in this
    // file. If the server's budget changes, the client follows without a
    // release.
    expect(sleep).toHaveBeenCalledWith(12_000);
  });

  it('14.51 gives up at the deadline rather than polling forever', async () => {
    const { client } = clientAnswering([
      { deviceCode: 'dev', userCode: 'BCDF-GHJK', verificationUri: 'http://web/mcp/authorize', expiresInSec: 600, pollIntervalSec: 12 },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'pending' },
    ]);
    let clock = 0;
    await expect(
      runDeviceLogin({
        client, prompt: () => {}, sleep: async () => { clock += 12_000; },
        now: () => clock, deadlineMs: 24_000,
      }),
    ).rejects.toThrow(/expired|not approved/i);
  });

  it('14.52 surfaces the prompt BEFORE the first poll', async () => {
    const order: string[] = [];
    const client: GisikClient = {
    ...NO_CLIENT_TRANSFER,
      get: async () => { throw new Error('not used'); },
      post: async (path) => {
        order.push(`post ${path}`);
        if (path === '/v1/mcp/device/code') {
          return { deviceCode: 'dev', userCode: 'BCDF-GHJK', verificationUri: 'http://web/a', expiresInSec: 600, pollIntervalSec: 1 };
        }
        return { status: 'issued', token: 'tok', userId: 'u' };
      },
    };
    await runDeviceLogin({
      client, prompt: () => order.push('prompt'), sleep: async () => {}, now: () => 0, deadlineMs: 600_000,
    });
    // A person cannot approve a code they have not been shown. Prompting after
    // the first poll would burn one poll interval of silence on every login.
    expect(order).toEqual(['post /v1/mcp/device/code', 'prompt', 'post /v1/mcp/device/token']);
  });
});
