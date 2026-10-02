// packages/ui/src/components/segmented-control.tsx
import { useRef, type KeyboardEvent } from 'react';
import { useScrollEdges } from '../use-scroll-edges.js';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Names the choice for assistive tech. Required, so it cannot be forgotten. */
  'aria-label': string;
  /**
   * Extra classes for the ROOT track, appended AFTER `gn-segmented`.
   *
   * **This exists so a CALLER never has to write a descendant selector naming
   * `.gn-segmented`, and that is a correctness constraint rather than a
   * convenience.** `packages/ui/test/components.test.tsx`'s `rule(selector)`
   * helper finds a rule with `UI_CSS.match(new RegExp(escapedSelector +
   * '\\s*\\{([^}]*)\\}'))` — **`.match()`, so the FIRST occurrence in file order
   * wins.** A caller-side `.gn-somewhere .gn-segmented { … }` placed ABOVE the
   * real `.gn-segmented` rule therefore becomes the body `rule('.gn-segmented')`
   * returns, and a case asserting the track's own declaration reads the caller's
   * override instead. Measured, 2026-09-22: with such a selector at `ui.css:2163`
   * and the real rule at `:5125`, `rule('.gn-segmented')` answered
   * `" display: inline-flex; "` — the override — while every existing case stayed
   * green, because they all query `.gn-segmented__item` and the `__item` suffix
   * blocks the prefix match. **The hazard is invisible until someone writes the
   * bare selector, which is the most natural thing to write.** A class passed
   * here has no `.gn-segmented` in its own selector, so it cannot shadow one.
   */
  className?: string;
  /**
   * The track scrolls sideways when its options do not fit (the phone view tabs, the board's column picker):
   * wear `.gn-scroll-fade` and keep its edge attributes current, so no option is hidden without a cue. Off by default —
   * a track that wraps or fits never needs it.
   */
  fade?: boolean;
};

/**
 * HIG's method / view picker. Replaces the bordered `.gn-view-tabs` buttons
 * with a fill track and a raised selected segment, keeping the exact roles the
 * old markup carried — `tablist`, `tab`, `aria-selected` — so the accessible-name
 * ratchet (13.285/13.287) sees no loss.
 *
 * ## P9 — the roles promised a keyboard model that was not there
 *
 * Declaring `role="tablist"`/`role="tab"`/`aria-selected` tells assistive tech to
 * announce "tab, 1 of 3" and tells the person listening that the arrow keys move
 * between tabs. They did not: `grep -n "onKeyDown|Arrow|tabIndex|aria-controls|
 * tabpanel"` on this file returned nothing, so every tab was its own Tab stop and
 * no key moved anything. The semantics were taken and the contract skipped.
 *
 * What is implemented here is the keyboard half — a roving `tabindex` (ONE Tab
 * stop for the whole tablist, arrows within it, which is the part the reviewer
 * measured directly: Tab walked tab to tab instead of leaving the group) plus
 * ArrowLeft/ArrowRight with wraparound and Home/End. Selection follows focus
 * (the pattern's "automatic activation"), which is what a segmented control's
 * whole-surface-is-one-choice shape means.
 *
 * **ArrowUp/ArrowDown are deliberately NOT handled.** They are optional in the
 * pattern, this is a horizontal control, and claiming them would swallow vertical
 * scrolling on a control that sits inside scrolling pages.
 *
 * **`aria-controls`/`tabpanel` is NOT added, and the limit is on purpose.**
 * `SegmentedControl` is generic — it renders a choice, not a panel — and it has
 * seven render sites of two genuinely different kinds: the ticket sheet's
 * *Details* / *History* and the help browser's sections really do switch a panel
 * in place, while the theme and style toggles, `/inbox` and `/sign-in` switch a
 * setting or a route. The finding's first alternative (`aria-pressed` on a group
 * of buttons, which needs no keyboard model at all) would therefore misdescribe
 * the panel-switching sites, and the second half needs a `tabpanel` id no caller
 * currently passes. Implementing the keyboard contract is the part that is right
 * for every site; inventing a `tabpanel` relationship for callers that have no
 * panel would be a worse claim than the one being fixed.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
  fade = false,
}: SegmentedControlProps<T>) {
  const edgesRef = useScrollEdges<HTMLDivElement>('x');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // A `value` matching no option is reachable (a caller whose options narrowed
  // under a still-held value). Falling back to the first tab keeps the tablist
  // reachable by keyboard instead of leaving every tab at `tabindex="-1"`, which
  // would take the whole group out of the tab order.
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const moveTo = (index: number) => {
    const option = options[index];
    if (option === undefined) return;
    tabRefs.current[index]?.focus();
    onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowRight':
        moveTo(index === last ? 0 : index + 1);
        break;
      case 'ArrowLeft':
        moveTo(index === 0 ? last : index - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(last);
        break;
      default:
        // Every other key is left alone, including Enter and Space, which the
        // focused tab still owes its own button semantics.
        return;
    }
    event.preventDefault();
  };

  return (
    // `className` is appended, never substituted, so a caller's class ADDS to
    // the track rather than replacing it — and `undefined` leaves the attribute
    // byte-identical to what every existing call site already renders.
    <div
      role="tablist"
      aria-label={ariaLabel}
      ref={fade ? edgesRef : undefined}
      className={[
        'gn-segmented',
        ...(className === undefined ? [] : [className]),
        ...(fade ? ['gn-scroll-fade'] : []),
      ].join(' ')}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={index === tabStopIndex ? 0 : -1}
            className={on ? 'gn-segmented__item gn-segmented__item--on' : 'gn-segmented__item'}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
