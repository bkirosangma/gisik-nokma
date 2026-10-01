import { beforeEach, describe, expect, it, vi } from 'vitest';
import { takeRetryAfterMs } from '../src/session-retry.js';

/**
 * 21.240 — the REAL `auth-client.ts` feeds the Retry-After store. `session-error.test.tsx` replaces the
 * module wholesale, so a client built WITHOUT the `onResponse` hook would pass every case there; this
 * file imports the real one with `createAuthClient` captured, and calls the hook the way better-fetch does.
 */

const captured = vi.hoisted(() => ({
  options: undefined as undefined | { fetchOptions?: { onResponse?: (context: { response: unknown }) => void } },
}));

vi.mock('better-auth/react', () => ({
  createAuthClient: (options: typeof captured.options) => {
    captured.options = options;
    return {};
  },
}));

beforeEach(() => {
  takeRetryAfterMs();
});

describe('21.240 the real auth client reads Retry-After off the response', () => {
  it('21.240 a 429 with Retry-After: 7 leaves 7000 ms for the notice to take; CONTROL: a 200 response leaves nothing', async () => {
    await import('../src/auth-client.js');
    const onResponse = captured.options?.fetchOptions?.onResponse;
    expect(typeof onResponse).toBe('function');

    onResponse?.({ response: { status: 200, headers: new Headers({ 'retry-after': '7' }) } });
    expect(takeRetryAfterMs()).toBeNull();

    onResponse?.({ response: { status: 429, headers: new Headers({ 'retry-after': '7' }) } });
    expect(takeRetryAfterMs()).toBe(7000);
    // taken once: a later retry must not reuse a stale wait
    expect(takeRetryAfterMs()).toBeNull();
  });
});
