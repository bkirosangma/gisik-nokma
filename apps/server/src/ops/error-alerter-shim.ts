/**
 * TEMPORARY SHIM — DELETE IT WHEN PLAN 11 TASK 3 LANDS.
 *
 * The real module is `apps/server/src/alerts/error-alerter.ts`. It exports
 * more than two names, but only two of them are consumed here, and this file
 * mirrors those two exactly: the type `ErrorAlerter` (one method,
 * `notify(context, error)`, returning `Promise<void>` — NOT `void |
 * Promise<void>`, which is what this file said until a review measured it
 * against the real module and found the wider type would let a caller written
 * against the shim stop compiling on the day of the swap) and the function
 * `alerterFromConfig(webhookUrl: string | null): ErrorAlerter`. The real module
 * additionally exports `NoopErrorAlerter`, `WebhookErrorAlerter` and
 * `alertWithoutWaiting`; nothing on this branch imports them, so nothing here
 * mirrors them. That module is in flight on the unmerged branch
 * `origin/exec/23-plan11` and does not exist on this one; writing
 * `src/alerts/` here would land a SECOND competing implementation the moment
 * that branch merges, which is worse than a shim that announces itself.
 *
 * WHOEVER REBASES PAST TASK 3: delete this file and repoint its two importers
 * — `src/ops/schedule.ts` and `src/ops/backup-daemon-main.ts` — at
 * `../alerts/error-alerter.js`. Nothing else needs to change, and that is a
 * checked claim rather than a hope: the ONE behaviour a backup daemon cannot
 * lose — that a failure is always written down — lives in
 * `startBackupDaemon`'s own catch (cases 13.25–13.27), NOT in this file. Task
 * 3's `WebhookErrorAlerter` POSTs without logging and its `NoopErrorAlerter`
 * does nothing at all, and `.env.example` ships `ALERT_WEBHOOK_URL` empty, so
 * a default deployment gets the Noop; if the stderr line below were the only
 * one, deleting this file would silence every backup failure. It is not. The
 * stderr line here is a second, harmless witness for the shim's lifetime.
 *
 * THE OTHER HALF OF THAT CHECKED CLAIM IS THE CALL SITE'S ARGUMENT. The real
 * `alerterFromConfig` treats ONLY a strict `null` as "no alerter" and hands
 * everything else — an empty string included — to `WebhookErrorAlerter`. Its
 * docblock states the division: `null` "is precisely what `loadConfig`
 * produces for an unset or empty `ALERT_WEBHOOK_URL`", so mapping empty to
 * `null` belongs to the caller. `backup-daemon-main.ts` therefore passes
 * `process.env.ALERT_WEBHOOK_URL || null` — logical OR, not `??` — which is
 * what makes the retirement a genuine one-liner for the DEFAULT deployment
 * too (`.env.example` ships the variable empty, and `deploy/do/app.yaml`
 * declares it as a valueless SECRET).
 */
export type ErrorAlerter = { notify(context: string, error: unknown): Promise<void> };

/**
 * A backup that fails silently is a lie about being backed up, so the failure
 * is ALWAYS written to stderr as structured JSON, webhook or no webhook. The
 * webhook is the additional, best-effort hop: an unreachable or rejecting
 * endpoint is logged and swallowed, never thrown, because failing to *report*
 * a failure must not become a second failure that takes the daemon down.
 */
export function alerterFromConfig(webhookUrl: string | null): ErrorAlerter {
  return {
    async notify(context: string, error: unknown): Promise<void> {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ level: 'error', msg: 'alert', context, error: message }));
      if (!webhookUrl) return;
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: `${context}: ${message}` }),
        });
        if (!response.ok) {
          console.error(
            JSON.stringify({ level: 'error', msg: 'alert webhook rejected', status: response.status }),
          );
        }
      } catch (sendError: unknown) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'alert webhook unreachable',
            error: sendError instanceof Error ? sendError.message : String(sendError),
          }),
        );
      }
    },
  };
}
