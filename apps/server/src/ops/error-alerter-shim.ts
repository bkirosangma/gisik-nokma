/**
 * TEMPORARY SHIM — DELETE IT WHEN PLAN 11 TASK 3 LANDS.
 *
 * The real module is `apps/server/src/alerts/error-alerter.ts`. It exports
 * exactly two names, and this file mirrors both of them exactly: the type
 * `ErrorAlerter` (one method, `notify(context, error)`, returning `void` or a
 * promise of it) and the function `alerterFromConfig(webhookUrl: string |
 * null): ErrorAlerter`. That module is in flight on the unmerged branch
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
 */
export type ErrorAlerter = { notify(context: string, error: unknown): void | Promise<void> };

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
