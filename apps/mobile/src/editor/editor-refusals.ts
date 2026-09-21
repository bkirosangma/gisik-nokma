/**
 * E2-53: `editor-web-view.tsx` had no refusal vocabulary at all — three
 * doors, each answered by silence:
 *   (a) a parse failure on an inbound frame (`onMessage`'s `if (message ===
 *       null) return;`) — dropped with no reply and no host-visible signal.
 *   (b) the `WebView` itself failing to load — no `onError`/`onHttpError`,
 *       so a load failure rendered a blank rectangle.
 *   (c) `ready` never arriving — no timeout behind it, so a stuck bundle
 *       waited forever with nothing on screen.
 * This module holds the vocabulary the host now reports through those three
 * doors, plus the pure timeout decision (b) and (c) don't otherwise have a
 * pure form for.
 *
 * Door (a)'s "reply in-protocol" is NOT a new `HostToEditorMessage` kind —
 * the bridge protocol has none shaped for a generic refusal, and widening
 * it is a `packages/editor` change outside this task's package (the same
 * boundary E2-52's own residual names). What this host CAN do without that
 * widening is stop dropping the frame silently: the same host-level error
 * surface (b) and (c) report through now also reports a parse failure.
 */
export const EDITOR_PARSE_FAILURE_MESSAGE = 'The editor sent something the host could not read.';
export const EDITOR_LOAD_FAILURE_MESSAGE = 'The editor did not load.';
export const EDITOR_READY_TIMEOUT_MESSAGE = 'The editor did not open.';
export const EDITOR_READY_TIMEOUT_MS = 8000;

export function readyTimedOut(opts: { readyReceived: boolean; elapsedMs: number; timeoutMs: number }): boolean {
  if (opts.readyReceived) return false;
  return opts.elapsedMs >= opts.timeoutMs;
}
