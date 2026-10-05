'use client';
import type { HomeNumberKey, HomeResponse } from '@gisik-nokma/domain';
import { Button, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import { HOME_NUMBERS } from './home-copy.js';

export type HomeNumbersProps = {
  home: HomeResponse | null;
  failed: boolean;
  onRetry: () => void;
  pressed: HomeNumberKey | null;
  onToggle: (key: HomeNumberKey) => void;
  /** The last known `dueSoonDays`, for a failed load; `undefined` when none has ever arrived (planner ruling 2026-10-04 Q2). */
  dueSoonDays?: number;
};

/**
 * Home's six numbers (spec E §2.2): one row of six tiles, 3×2 on a phone. Loading draws placeholders in the tiles' own
 * box (`.gn-home__number`, one `min-height`), so the swap to numbers does not move the page.
 */
export function HomeNumbers({ home, failed, onRetry, pressed, onToggle, dueSoonDays: lastKnownDueSoonDays }: HomeNumbersProps) {
  if (home === null && !failed) {
    return (
      <SkeletonRegion label="Loading the numbers" className="gn-home__numbers">
        {HOME_NUMBERS.map((n) => (
          <div key={n.key} className="gn-home__number">
            <Skeleton width="3rem" height="1.75rem" />
            <Skeleton width="5rem" height="0.8125rem" />
          </div>
        ))}
      </SkeletonRegion>
    );
  }
  // Never `?? 0`: that reads "Due today" on a failed load (planner ruling 2026-10-04 Q2).
  const dueSoonDays = home?.dueSoonDays ?? lastKnownDueSoonDays;
  return (
    <>
      <div className="gn-home__numbers">
        {HOME_NUMBERS.map((n) => {
          const count = home === null ? undefined : home.counts[n.key];
          const value = count === undefined ? '–' : count === null ? 'Restricted' : String(count);
          const disabled = count === undefined || count === null || count === 0;
          const warn = n.key === 'pastDue' && typeof count === 'number' && count > 0;
          return (
            <button
              key={n.key}
              type="button"
              className={warn ? 'gn-home__number gn-home__number--warn' : 'gn-home__number'}
              aria-pressed={pressed === n.key}
              disabled={disabled}
              onClick={() => onToggle(n.key)}
            >
              {/* The space makes the tile's text "12 Tickets", not "12Tickets" (27.634); the grid draws no box for it. */}
              <span className="gn-home__number-value">{value}</span>{' '}
              <span className="gn-home__number-label">{n.label(dueSoonDays)}</span>
            </button>
          );
        })}
      </div>
      {failed ? (
        <div className="gn-home__refusal">
          <p>Couldn&apos;t load the numbers.</p>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      ) : null}
    </>
  );
}
