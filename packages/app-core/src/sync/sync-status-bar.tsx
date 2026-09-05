/**
 * The queue sentence, singular-aware.
 *
 * `status` is a bare `string` rather than the four-member union the component
 * takes, because this is also the function a host calls with a status it read
 * from `query.syncStatus` — an unrecognised value falls through to the live
 * sentence rather than throwing, which is the honest failure here: the queue
 * depth is still true even when the connection word is not one this build
 * knows.
 */
export function syncStatusLabel(status: string, queued: number): string {
  const claims = queued === 1 ? '1 claim waiting to send' : `${queued} claims waiting to send`;
  if (status === 'offline') return queued === 0 ? 'Offline' : `Offline — ${claims}`;
  if (status === 'catching-up') return 'Catching up…';
  if (status === 'connecting') return 'Connecting…';
  return queued === 0 ? 'Live' : claims;
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
}) {
  return (
    <div className="gn-sync-status-bar" role="status" data-status={props.status}>
      <span className="gn-sync-status-bar__label">{syncStatusLabel(props.status, props.queued)}</span>
      {props.failed > 0 ? (
        <span className="gn-sync-status-bar__failed">{props.failed} needs attention</span>
      ) : null}
    </div>
  );
}
