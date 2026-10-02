import { useEffect, useState, type RefObject } from 'react';
import { SegmentedControl } from '@gisik-nokma/ui';
import { prefersReducedMotion } from './board-motion.js';

/** One option of the picker: a column of the group, however the person had it collapsed on a wider screen. */
export type PhoneColumn = { stateId: string; name: string; count: number };

/** The rail's column sections, in DOM order, each carrying the state it renders (`BoardGroupSection` sets the attribute). */
function sectionsOf(rail: HTMLElement): HTMLElement[] {
  return [...rail.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.dataset['stateId'] !== undefined);
}

/**
 * Which column the phone rail is showing: the one whose left edge is nearest the rail's own left edge, kept as
 * state so the picker can mark it. The listener is throttled to one read per frame — a flick fires dozens of
 * `scroll` events and each read forces layout — and does nothing unless `enabled` (the picker exists only on a
 * phone). `pick` is what the picker calls: it records the choice at once, since the scroll that follows takes a
 * while to arrive.
 *
 * The state can name a column that no longer exists (a refetch dropped it); it then reads as the first column,
 * which is where a rail that lost its scroll position sits.
 */
export function useActiveRailColumn(
  railRef: RefObject<HTMLElement | null>,
  stateIds: string[],
  enabled: boolean,
): { activeStateId: string | null; pick: (stateId: string) => void } {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!enabled || rail === null) return;
    let queued = false;
    const read = (): void => {
      queued = false;
      const railLeft = rail.getBoundingClientRect().left;
      let nearest: { stateId: string; distance: number } | null = null;
      for (const section of sectionsOf(rail)) {
        const distance = Math.abs(section.getBoundingClientRect().left - railLeft);
        const stateId = section.dataset['stateId'];
        if (stateId !== undefined && (nearest === null || distance < nearest.distance)) nearest = { stateId, distance };
      }
      if (nearest !== null) setActive(nearest.stateId);
    };
    const onScroll = (): void => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(read);
    };
    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => rail.removeEventListener('scroll', onScroll);
  }, [railRef, enabled]);

  const activeStateId = active !== null && stateIds.includes(active) ? active : (stateIds[0] ?? null);
  return { activeStateId, pick: setActive };
}

/**
 * The phone's column picker (mobile plan FD8): a segmented control above the rail, one option per column as
 * "<name> <count>", collapsed columns included — the phone shows every column expanded, so there is nothing to
 * leave out. Choosing one scrolls the RAIL to its column (`inline: 'start'`, `block: 'nearest'`), never the
 * page: `scrollIntoView` on the section moves its scroll container only on the axis it needs, and `block:
 * 'nearest'` keeps the vertical position where it is. Reduced motion jumps instead of gliding.
 */
export function BoardPhonePicker({
  columns,
  railRef,
  activeStateId,
  onPick,
}: {
  columns: PhoneColumn[];
  railRef: RefObject<HTMLElement | null>;
  activeStateId: string;
  onPick: (stateId: string) => void;
}) {
  return (
    <SegmentedControl
      className="gn-board-phone-picker"
      fade
      aria-label="Column"
      options={columns.map((column) => ({ value: column.stateId, label: `${column.name} ${column.count}` }))}
      value={activeStateId}
      onChange={(stateId) => {
        const section = railRef.current === null ? undefined : sectionsOf(railRef.current).find((candidate) => candidate.dataset['stateId'] === stateId);
        section?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        onPick(stateId);
      }}
    />
  );
}
