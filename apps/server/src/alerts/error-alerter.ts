/**
 * Error alerting (Plan 11 Task 3) — errors that reach Fastify's error handler
 * phone somewhere, and the phoning can never take the server down with it.
 *
 * THE BOUNDARY, stated because the shorter claim ("5xx failures phone
 * somewhere") is not what ships: this alerts on errors that reach
 * `setErrorHandler`, which is NOT every 5xx. `/healthz` catches its own
 * `SELECT 1` failure and RETURNS 503 rather than throwing, so a deployment whose
 * database has gone away — the failure an on-call webhook most exists for —
 * pages nobody through this path. That is a deliberate boundary, not an
 * oversight: nothing here coalesces, so alerting a probe-driven 503 would post
 * once per probe interval until the receiver rate-limits and drops the real
 * signal. The database-down case belongs with the process-level handlers
 * `index.ts` defers to the shutdown errand. The note at the `/healthz` route in
 * `app.ts` says the same thing where a reader of that route will meet it.
 *
 * The second clause of the first sentence is the whole design. A hook that runs
 * on the 5xx path is a hook that runs when the process is ALREADY in trouble, so
 * every way it can fail — throwing before it returns a promise, rejecting after,
 * or never settling at all — has to end here rather than in the request that
 * tripped it.
 * `alertWithoutWaiting` below is where that containment lives; nothing else in
 * this codebase should call `notify` directly on the request path.
 *
 * The interface is deliberately narrower than a logger: one string of context,
 * one unknown cause. Task 11's backup daemon consumes the same `ErrorAlerter`,
 * because a backup that fails silently is a lie about being backed up.
 */
export type ErrorAlerter = {
  notify(context: string, error: unknown): Promise<void>;
};

/**
 * No webhook configured, so nothing is sent — and that is the DEV DEFAULT, not
 * a degraded server. A deployment states where alerts go by setting
 * `ALERT_WEBHOOK_URL`; a local run states nothing and gets silence, with the
 * error still in the structured log where it always was.
 */
export class NoopErrorAlerter implements ErrorAlerter {
  async notify(): Promise<void> {
    // Intentionally nothing.
  }
}

/**
 * How long a webhook POST is allowed to take before it is abandoned.
 *
 * Fire-and-forget bounds the REQUEST's wait at zero, but not the socket's: a
 * receiver that accepts a connection and never answers would otherwise hold one
 * open per 5xx for the life of the process, which is a slow leak that only
 * appears during an incident — exactly when it is least welcome.
 */
const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * POSTs `{ text }` — the shape Slack, Mattermost, and Discord (with the
 * `/slack` suffix) webhooks all accept, and any generic receiver can read. The
 * provider is whatever URL the configuration carries; this code knows no vendor.
 *
 * `notify` NEVER rejects. Its own failures are swallowed here rather than left
 * to the caller because the caller is the error path — the original error is
 * already in the structured log, and a failed alert must not become a second
 * error competing with the first.
 */
export class WebhookErrorAlerter implements ErrorAlerter {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async notify(context: string, error: unknown): Promise<void> {
    try {
      // Inside the try on purpose: `String(error)` runs arbitrary `toString`
      // code from whatever was thrown, and this method's contract is that it
      // cannot throw.
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      await this.fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `gisik-nokma error — ${context}: ${message}` }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    } catch {
      // Alerting must never take the server down with it.
    }
  }
}

/**
 * The one place the configured URL becomes an alerter. `string | null` rather
 * than the whole config object: `null` is precisely what `loadConfig` produces
 * for an unset or empty `ALERT_WEBHOOK_URL`, and a factory that took the config
 * would let this module reach for fields it has no business reading.
 */
export function alerterFromConfig(alertWebhookUrl: string | null): ErrorAlerter {
  return alertWebhookUrl === null ? new NoopErrorAlerter() : new WebhookErrorAlerter(alertWebhookUrl);
}

/**
 * Send an alert and DO NOT WAIT for it — the only shape allowed on a request
 * path.
 *
 * TWO containments, because `notify` has two ways to fail and they are caught
 * in different places:
 *
 * - it REJECTS after returning a promise → the `.catch` swallows it, so nothing
 *   escapes as an unhandled rejection (which, on Node's default settings, ends
 *   the process);
 * - it THROWS before returning one → the promise never exists, so there is
 *   nothing to attach a `.catch` to and the throw would propagate straight out
 *   of Fastify's error handler; the surrounding `try` is what stops it. The same
 *   `try` covers an implementation that returns a non-promise.
 *
 * `app.ts` uses a bare `void fanout.onCommitted(event)` for the notification
 * fan-out and this deliberately does NOT copy that line: `NotificationFanout`
 * never rejects BY CONSTRUCTION (it logs its own failures), whereas an
 * `ErrorAlerter` is supplied by the caller and carries no such guarantee.
 *
 * A hanging `notify` needs no containment at all — nothing awaits it — but that
 * is a property of this function returning `void`, so it is pinned by a test
 * rather than left to the reader.
 */
export function alertWithoutWaiting(alerter: ErrorAlerter, context: string, error: unknown): void {
  try {
    void alerter.notify(context, error).catch(() => {
      // The alerter's own failure ends here. The error that triggered it is
      // already logged; a report about a failed report helps nobody.
    });
  } catch {
    // A synchronous throw out of `notify`, contained for the same reason.
  }
}
