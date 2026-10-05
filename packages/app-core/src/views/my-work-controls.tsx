import { useId, useRef, type KeyboardEvent } from 'react';
import type { AttentionShow, MyWorkPreferences } from '../my-work-global-contract.js';

/**
 * The two controls above the global My work page (my-work-global T3, spec D4): the
 * multiselect "Show" chips that narrow "Needs your attention", and the "Group" pair that
 * arranges both sections.
 */

/** The chips' words, verbatim from the plan's Global Constraints — and the empty state's (T4). */
export const SHOW_LABELS: Record<AttentionShow, string> = {
  created: 'Created by me',
  assigned: 'Assigned to me',
  'ws-admin': 'Workspaces I own or run',
  'project-admin': 'Projects I run',
};

export type MyWorkGrouping = MyWorkPreferences['grouping'];

const GROUPING_OPTIONS: ReadonlyArray<{ value: MyWorkGrouping; label: string }> = [
  { value: 'workspace-project', label: 'By workspace and project' },
  { value: 'flat', label: 'Flat' },
];

export type ShowFilterProps = {
  /** What this viewer is offered (`showOptionsFor`), in the order the chips are drawn. */
  options: readonly AttentionShow[];
  value: readonly AttentionShow[];
  onChange: (next: AttentionShow[]) => void;
};

/**
 * "Show": one toggle button per offered option, `aria-pressed` for its state — a multiselect,
 * so a radio group's one-of semantics would be false here.
 *
 * - **The last selected chip cannot be cleared** (spec D4). Pressing it does nothing: an
 *   empty selection is a request the route refuses, and a strip filtered to nothing would
 *   read as an all-clear. It stays pressed, and `onChange` is not called.
 * - **Only OFFERED selections count.** A value saved while the viewer held a role they no
 *   longer hold is neither drawn nor counted toward "the last chip", and the next change
 *   drops it, so the selection on screen is the selection sent.
 * - **The answer is written in the options' order**, whatever was pressed first, so one
 *   selection is always one request.
 */
export function ShowFilter({ options, value, onChange }: ShowFilterProps) {
  const labelId = useId();
  const selected = options.filter((option) => value.includes(option));
  const toggle = (option: AttentionShow): void => {
    const on = selected.includes(option);
    if (on && selected.length === 1) return;
    onChange(options.filter((candidate) => (candidate === option ? !on : selected.includes(candidate))));
  };
  return (
    <div className="gn-my-work-control">
      <span id={labelId} className="gn-my-work-control__label">
        Show
      </span>
      <div role="group" aria-labelledby={labelId} className="gn-show-filter">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              className={on ? 'gn-show-filter__chip gn-show-filter__chip--on' : 'gn-show-filter__chip'}
              onClick={() => toggle(option)}
            >
              {/* The pressed state is a SHAPE as well as a shadow, so it survives `minimal`
                  (no shadows) and a viewer who cannot tell the two depths apart. Decorative:
                  `aria-pressed` already says it. */}
              {on ? (
                <svg
                  className="gn-show-filter__check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12.5 10 17.5 19 7" />
                </svg>
              ) : null}
              {SHOW_LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type GroupToggleProps = {
  value: MyWorkGrouping;
  onChange: (next: MyWorkGrouping) => void;
};

/**
 * "Group": "By workspace and project" or "Flat", as a radio group — one of two, and the
 * arrow keys move the selection with the focus, the APG radio pattern. One tab stop: the
 * checked radio.
 *
 * It wears the shared segmented track (`.gn-segmented*`) rather than `SegmentedControl`
 * itself, because that component is a `tablist` — the right role for switching what a
 * region SHOWS, the wrong one for a setting that arranges it (case 30.035 pins the radio
 * group).
 */
export function GroupToggle({ value, onChange }: GroupToggleProps) {
  const labelId = useId();
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const moveTo = (index: number): void => {
    const option = GROUPING_OPTIONS[index];
    if (option === undefined) return;
    radios.current[index]?.focus();
    onChange(option.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = GROUPING_OPTIONS.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') moveTo(index === last ? 0 : index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') moveTo(index === 0 ? last : index - 1);
    else return;
    event.preventDefault();
  };
  return (
    <div className="gn-my-work-control">
      <span id={labelId} className="gn-my-work-control__label">
        Group
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="gn-segmented gn-group-toggle">
        {GROUPING_OPTIONS.map((option, index) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                radios.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={on ? 'gn-segmented__item gn-segmented__item--on' : 'gn-segmented__item'}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
