/**
 * The queue sentence, singular-aware.
 *
 * `status` is a bare `string` rather than the four-member union the component
 * takes, because this is also the function a host calls with a status it read
 * from `query.syncStatus` — and the mobile shell declares it that way
 * (`apps/mobile/src/screens/board-screen.tsx:11`, `status: string;`), so a code
 * this build does not know is a shape a caller already admits rather than one
 * invented here.
 *
 * ## An unrecognised value gets the QUEUE sentence, never a liveness claim (E2-27)
 *
 * This used to fall through to `'Live'`, and the paragraph that defended it read:
 * *"an unrecognised value falls through to the live sentence rather than
 * throwing, which is the honest failure here: the queue depth is still true even
 * when the connection word is not one this build knows."* The premise is right
 * about the QUEUE and was false about what the arm RETURNED — `'Live'` is a claim
 * about the connection, not about the queue, and it is the most optimistic of
 * the four. Every other arm refuses to invent a policy for a code it does not
 * know; that one invented the only policy whose failure is not recoverable,
 * because a person told they are live does not go and check.
 *
 * So `live` is an explicit arm now, and the fallthrough returns the queue
 * sentence — the half that stays true whatever the connection word is.
 */
export function syncStatusLabel(status: string, queued: number): string {
  const claims = queued === 1 ? '1 claim waiting to send' : `${queued} claims waiting to send`;
  if (status === 'offline') return queued === 0 ? 'Offline' : `Offline — ${claims}`;
  if (status === 'catching-up') return 'Catching up…';
  if (status === 'connecting') return 'Connecting…';
  if (status === 'live') return queued === 0 ? 'Live' : claims;
  // Unrecognised. The queue depth is a fact this client holds; the connection
  // word is not, so only the first is said.
  return claims;
}

/**
 * The stream's own error, said out loud — Ruling P34 (2026-09-06).
 *
 * `createSyncEngine`'s docblock deferred "a policy per `StreamErrorCode` (give
 * up on `not-a-member`, retry on `bad-message`)" to *"whoever owns the client's
 * error surface"*. P34 assigned the SURFACE here. It did not assign the policy,
 * and this function deliberately does not invent one.
 *
 * ## What is true today, which is the only thing this may say
 *
 * MEASURED at `packages/sync-client/src/engine/sync-engine.ts`: an amendment-19
 * `error` frame is recorded and the engine RECONNECTS after it, on the same
 * delay as any other close — for every one of the three codes
 * (`STREAM_ERROR_CODES` = `bad-message`, `not-a-member`, `already-subscribed`).
 * The only terminal path is `scope-revoked`, which is a different frame type
 * and not an error code at all.
 *
 * So a label reading "this device will not reconnect" for `not-a-member` would
 * be describing a policy no code implements — the surface asserting a decision
 * on the engine's behalf, which is the same shape as a view laundering "queued"
 * into "accepted". What is said instead is exactly what happened: the server
 * named a reason, in its own words, and this client is still retrying.
 *
 * The code is printed VERBATIM rather than translated through a lookup. An
 * unrecognised code is a code this build has not been taught, and showing it
 * raw is more useful to whoever has to diagnose it than a friendly sentence
 * that drops the one identifying string.
 *
 * **STILL OPEN, and it is a POLICY not a surface**: whether `not-a-member`
 * should stop the retry loop. That belongs in `createSyncEngine`, needs a
 * distributed-systems judgement about a membership that may be restored, and
 * has no owner yet. Naming it here is the second half of the record, not a
 * claim that it is closed.
 */
export function syncErrorNotice(error: { code: string; message: string } | null): string | null {
  if (error === null) return null;
  return `The server refused this stream (${error.code}): ${error.message} — still retrying.`;
}

/**
 * The one sync-truth strip both apps mount: status, queued claims, failed
 * items. `role="status"` rather than `role="alert"` — this is a standing
 * readout a user consults, not an interruption; the contested-claim banner is
 * the one that interrupts.
 *
 * `failed` renders only when non-zero, so a healthy client shows no empty
 * chrome. The count is deliberately phrased "needs attention" and not
 * "failed": a claim the server refused is not a malfunction, it is an answer.
 */
export function SyncStatusBar(props: {
  status: 'offline' | 'connecting' | 'catching-up' | 'live';
  queued: number;
  failed: number;
  /**
   * `engine.lastError()`, passed straight through. Optional because the strip
   * predates it and both app shells may mount it before they hold an engine;
   * absent and `null` mean the same thing here — no error frame stands — which
   * is why this is not a required prop with a `null` default forced on callers.
   */
  error?: { code: string; message: string } | null;
}) {
  const notice = syncErrorNotice(props.error ?? null);
  return (
    <div className="gn-sync-status-bar" role="status" data-status={props.status}>
      <span className="gn-sync-status-bar__label">{syncStatusLabel(props.status, props.queued)}</span>
      {props.failed > 0 ? (
        <span className="gn-sync-status-bar__failed">{props.failed} needs attention</span>
      ) : null}
      {notice === null ? null : <span className="gn-sync-status-bar__error">{notice}</span>}
    </div>
  );
}
