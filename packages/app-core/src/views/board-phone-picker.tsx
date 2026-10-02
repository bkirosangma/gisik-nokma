import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SegmentedControl } from '@gisik-nokma/ui';

/** One option of the picker: a column of the group, however the person had it collapsed on a wider screen. */
export type PhoneColumn = { stateId: string; name: string; count: number };

/**
 * Which column the phone rail SHOWS (UX fixes T7, audit BRD-01). It used to follow the rail's scroll position; now
 * the picker owns it, because the columns the picker did not choose are `inert` and `hidden` (so a phone Tab walk
 * never lands in a column that is off screen, and the rail is as tall as the shown column rather than the tallest).
 * A `hidden` column cannot be scrolled to, so there is no scroll listener any more — the choice is the state.
 *
 * `pick(stateId, { focus: true })` also moves focus into the chosen column once it is shown: its first card's
 * control, or the column itself when it is empty (`tabIndex={-1}` on a phone, set by `BoardGroupSection`). The
 * picker asks for it only on an activation (a tap, Enter or Space); an arrow key inside the tablist changes the
 * column and leaves focus where it was, which is what lets a keyboard user arrow through the options.
 *
 * The state can name a column that no longer exists (a refetch dropped it); it then reads as the first column.
 */
export function useActiveColumn(
  railRef: RefObject<HTMLElement | null>,
  stateIds: string[],
): { activeStateId: string | null; pick: (stateId: string, options?: { focus?: boolean }) => void } {
  const [active, setActive] = useState<string | null>(null);
  // An object, never a bare id: choosing the column already shown must still run the effect below.
  const [focusRequest, setFocusRequest] = useState<{ stateId: string } | null>(null);
  const activeStateId = active !== null && stateIds.includes(active) ? active : (stateIds[0] ?? null);
  useEffect(() => {
    if (focusRequest === null) return;
    const section = [...(railRef.current?.children ?? [])].find(
      (child): child is HTMLElement => child instanceof HTMLElement && child.dataset['stateId'] === focusRequest.stateId,
    );
    if (section === undefined) return;
    const control = section.querySelector<HTMLElement>('.gn-board__card-slot button, .gn-board__card-slot a');
    (control ?? section).focus({ preventScroll: true });
  }, [focusRequest, railRef]);
  return {
    activeStateId,
    pick: (stateId, options) => {
      setActive(stateId);
      if (options?.focus === true) setFocusRequest({ stateId });
    },
  };
}

/**
 * The phone's column picker (mobile plan FD8): a segmented control above the rail, one option per column as
 * "<name> <count>", collapsed columns included — the phone shows every column expanded, so there is nothing to
 * leave out. Choosing one SHOWS that column and hides the others (`useActiveColumn`); the page does not scroll.
 *
 * `focus` is true for an activation and false for an arrow key. The segmented control reports both through the
 * one `onChange`, so the wrapper marks a click on its way down (a tap, and Enter/Space, which the browser turns
 * into a click) and `onChange` reads and clears the mark; a key press clears it too, so a click that changed nothing
 * cannot arm the next arrow key.
 */
export function BoardPhonePicker({
  columns,
  activeStateId,
  onPick,
}: {
  columns: PhoneColumn[];
  activeStateId: string;
  onPick: (stateId: string, options: { focus: boolean }) => void;
}) {
  const activated = useRef(false);
  return (
    <div
      className="gn-board-phone-picker__activation"
      onClickCapture={() => { activated.current = true; }}
      // A click on the option already selected fires no `onChange`, so the mark would outlive it and the NEXT arrow
      // key would be taken for an activation (U-T7 fix 1, 23.128). Every key press starts afresh; Enter and Space
      // reach `onClickCapture` after their keydown, so they are still marked.
      onKeyDownCapture={() => { activated.current = false; }}
    >
      <SegmentedControl
        className="gn-board-phone-picker"
        fade
        aria-label="Column"
        options={columns.map((column) => ({ value: column.stateId, label: `${column.name} ${column.count}` }))}
        value={activeStateId}
        onChange={(stateId) => {
          const focus = activated.current;
          activated.current = false;
          onPick(stateId, { focus });
        }}
      />
    </div>
  );
}

/**
 * A phone Move must never leave its dialog or notice in a column the person cannot see (UX T7 fix 1, 23.126).
 *
 * `Dialog` does not portal and the card is remounted in its landing column the moment a move is laid, so the move
 * dialog and the refusal/transport notices are drawn in whichever column the card is in — and on a phone every column
 * but the shown one is `hidden` and `inert`. While any card has an open dialog or a notice (`heldIn` is the column
 * that holds it), the phone SHOWS that column; when the last one closes, the view goes back to the column the person
 * was on. The follow is a pick, made when the holder's column CHANGES, never a lock: the person can choose another
 * column at any time (a notice that lingers after a failed direct move does not trap them).
 */
export function useFollowOpenMove(
  heldIn: string | null,
  activeStateId: string | null,
  pick: (stateId: string) => void,
): void {
  const returnTo = useRef<string | null>(null);
  const latest = useRef({ activeStateId, pick });
  latest.current = { activeStateId, pick };
  useLayoutEffect(() => {
    const { activeStateId: shown, pick: choose } = latest.current;
    if (heldIn !== null) {
      if (heldIn !== shown) {
        returnTo.current ??= shown;
        choose(heldIn);
      }
    } else if (returnTo.current !== null) {
      const back = returnTo.current;
      returnTo.current = null;
      choose(back);
    }
  }, [heldIn]);
}
