import { Button } from '@gisik-nokma/ui';

/**
 * KB `DraftRestoreBanner`, adapted: shown when the note opened with an unsaved
 * local draft (`useNoteAutosave().restoredAt`). **Keep** dismisses it and
 * leaves the recovered words live; **Discard** drops the draft and reloads the
 * server's body. The KB's "disk" is this app's server copy.
 */
export function relativeTime(then: number, now: number): string {
  const diff = Math.max(0, now - then);
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function DraftRestoreBanner({
  savedAt,
  now = Date.now(),
  onKeep,
  onDiscard,
}: {
  /** Epoch ms the draft was last persisted. */
  savedAt: number;
  now?: number;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="gn-notes__draft-banner" role="status" data-testid="draft-restore-banner">
      <p>Restored unsaved changes from {relativeTime(savedAt, now)}.</p>
      <Button onClick={onDiscard}>Discard</Button>
      <Button variant="primary" onClick={onKeep}>
        Keep
      </Button>
    </div>
  );
}
