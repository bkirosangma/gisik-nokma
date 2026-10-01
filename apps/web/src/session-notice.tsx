'use client';

import { useEffect, useRef } from 'react';
import { useSessionFailure } from './providers.js';
import { retryDelayMs, takeRetryAfterMs } from './session-retry.js';

/**
 * The shell's ONE notice for a failed session read (SYS-01): the person is
 * still signed in as far as anyone knows, the server just could not be reached
 * (a 429, a 5xx, a dropped connection), and signing in again would fix nothing.
 *
 * Retries on its own with backoff — the server's `Retry-After` when a 429 gave
 * one — and offers **Try again** to skip the wait. Renders nothing, and sets no
 * timer, while the session read is healthy.
 */
export function SessionNotice() {
  const { failed, error, retry } = useSessionFailure();
  const attempt = useRef(0);
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(() => {
    if (error === null) {
      if (!failed) attempt.current = 0;
      return;
    }
    const wait = retryDelayMs(attempt.current, takeRetryAfterMs());
    attempt.current += 1;
    const timer = setTimeout(() => retryRef.current(), wait);
    return () => clearTimeout(timer);
  }, [error, failed]);

  if (!failed) return null;
  return (
    <div className="gn-session-notice" role="status">
      <span className="gn-session-notice__text">Can&apos;t reach the server right now. Retrying…</span>
      <button
        type="button"
        className="gn-session-notice__retry"
        onClick={() => {
          attempt.current = 0;
          retry();
        }}
      >
        Try again
      </button>
    </div>
  );
}
