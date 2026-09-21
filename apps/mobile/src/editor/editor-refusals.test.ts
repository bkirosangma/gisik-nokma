import { describe, expect, it } from 'vitest';
import {
  EDITOR_LOAD_FAILURE_MESSAGE,
  EDITOR_PARSE_FAILURE_MESSAGE,
  EDITOR_READY_TIMEOUT_MESSAGE,
  EDITOR_READY_TIMEOUT_MS,
  readyTimedOut,
} from './editor-refusals.js';

/**
 * 12.412 — E2-53: the editor host's three silent doors (a parse failure, a
 * WebView load failure, `ready` never arriving) now each have a
 * host-visible refusal, and `readyTimedOut` is the pure decision rule the
 * third of those uses.
 */
describe('readyTimedOut', () => {
  it('12.412 — is false once ready has been received, regardless of elapsed time', () => {
    expect(readyTimedOut({ readyReceived: true, elapsedMs: 999_999, timeoutMs: EDITOR_READY_TIMEOUT_MS })).toBe(false);
  });

  it('is false before the timeout has elapsed', () => {
    expect(readyTimedOut({ readyReceived: false, elapsedMs: EDITOR_READY_TIMEOUT_MS - 1, timeoutMs: EDITOR_READY_TIMEOUT_MS })).toBe(
      false,
    );
  });

  it('is true once the timeout has elapsed with no ready', () => {
    expect(readyTimedOut({ readyReceived: false, elapsedMs: EDITOR_READY_TIMEOUT_MS, timeoutMs: EDITOR_READY_TIMEOUT_MS })).toBe(
      true,
    );
  });
});

describe('refusal messages', () => {
  it('name what went wrong, not a blank rectangle or silence', () => {
    expect(EDITOR_PARSE_FAILURE_MESSAGE.length).toBeGreaterThan(0);
    expect(EDITOR_LOAD_FAILURE_MESSAGE.length).toBeGreaterThan(0);
    expect(EDITOR_READY_TIMEOUT_MESSAGE.length).toBeGreaterThan(0);
  });
});
