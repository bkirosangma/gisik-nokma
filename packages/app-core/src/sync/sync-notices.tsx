import type { ReactElement } from 'react';

/**
 * The notices a device owes the person (trash series Plan 3, D6; spec §5.7,
 * "a visible notice — never silently"): a queued change the device removed
 * because its item was permanently deleted, and any change the server refused
 * for another reason. Drawn under the sync strip; each can be dismissed.
 */
export type SyncNoticeView = { id: string; text: string };

export const SYNC_NOTICE_DISMISS = 'Dismiss';

/** A refused change's line: the server's own `rule: reason`, verbatim, as the strip's error line is. */
export function failedClaimNotice(lastError: string | null): string {
  return lastError === null || lastError === '' ? 'A change could not be saved.' : `A change could not be saved — ${lastError}`;
}

/**
 * The live region stays MOUNTED when empty (`.gn-sync-notices:empty` hides it):
 * a region inserted together with its first notice is not reliably announced.
 * Each button's name starts with its visible word (WCAG 2.5.3) and ends with
 * the sentence it dismisses, so a list of them is not five identical "Dismiss".
 */
export function SyncNotices(props: { notices: readonly SyncNoticeView[]; onDismiss(id: string): void }): ReactElement {
  return (
    <section className="gn-sync-notices" aria-label="Sync notices" aria-live="polite">
      {props.notices.length === 0 ? null : (
        <ul className="gn-sync-notices__list">
          {props.notices.map((notice) => (
            <li key={notice.id} className="gn-sync-notices__item">
              <span className="gn-sync-notices__text">{notice.text}</span>
              <button
                type="button"
                className="gn-sync-notices__dismiss"
                aria-label={`${SYNC_NOTICE_DISMISS}: ${notice.text}`}
                onClick={() => props.onDismiss(notice.id)}
              >
                {SYNC_NOTICE_DISMISS}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
