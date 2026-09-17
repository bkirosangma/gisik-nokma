import type { ReactNode } from 'react';
import type { ChoiceMode } from './filter-cycle.js';

/**
 * The glyph that carries the state alongside colour (ui-ux-pro-max: never
 * colour alone): an empty ring (off), a check (include), a circle-slash
 * (exclude). Inline SVG on `currentColor`, `aria-hidden` — the
 * `inbox/icons.tsx` idiom; decorative, because the state is already in the
 * button's accessible name. Exported so the strip's exclude chips (Task 10)
 * draw the SAME ⊘ rather than a second one.
 */
export function ChoiceGlyph({ mode }: { mode: ChoiceMode }) {
  return (
    <svg className="gn-filters__choice-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {mode === 'include' ? (
        <path d="M5 8.2 7.1 10.3 11.2 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {mode === 'exclude' ? (
        <path d="M4.2 11.8 11.8 4.2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export type TriStateChoiceProps = {
  mode: ChoiceMode;
  /** The plain-text name the accessible name is built from — "Uma One", "Bug", "Active". */
  label: string;
  /** The button decides nothing: the caller cycles the filter (`withCycledId`) and re-renders with the new mode. */
  onCycle: () => void;
  /**
   * What renders inside the button; defaults to `label`. A person row passes
   * its avatar plus name here (an `aria-hidden` avatar span beside a plain
   * name span). Never contributes to the accessible name — `aria-label`
   * (built from `label`, below) overrides content computation entirely, so
   * whatever markup `children` carries costs nothing on the name.
   */
  children?: ReactNode;
  className?: string;
};

/**
 * ONE control shape for every value in the Filters sheet (exclude-mode spec
 * §4, amended 2026-09-17 fix round 1): a cycling `<button>`. No
 * `aria-pressed` — binary semantics would lie for three states — so the
 * state lives in the accessible NAME: "Uma One", "Uma One, included", "Uma
 * One, excluded".
 *
 * That name is built from `label` (a required plain string) via `aria-label`
 * — never from rendered content. `label` and `children` are deliberately
 * separate: `children` is optional `ReactNode`, defaulting to `label` when
 * omitted, so a caller is free to render an avatar plus the name (Task 9's
 * person rows) without touching what the button is called. Fix round 1 split
 * these apart — the original Task 8 shape used one `string children` for
 * both the visible content and the name, which had nowhere to put a person
 * row's avatar.
 *
 * A first draft (before `aria-label` existed here at all) tried a visible
 * label span plus a *sibling* visually-hidden suffix span, relying on the
 * browser to concatenate them into the name. That measured RED: the
 * accessible-name-from-content algorithm inserts a synthetic separator space
 * between each child node's contribution (the same reason
 * `<button>Save<span>Draft</span></button>` reads "Save Draft", never
 * "SaveDraft" — verified with a scratch render), so two sibling spans
 * compute to `"Uma One , included"` — a space before the comma — never the
 * exact string required. `aria-label` sets the name to an exact string by
 * definition, bypassing content computation, which is why it is built here
 * unconditionally for all three modes rather than as a branch that only
 * applies to include/exclude.
 *
 * The visible content still renders inside its own
 * `<span className="gn-filters__choice-label">` (the CSS strike-through in
 * exclude mode targets it) — it is display only now; `aria-label` on the
 * button carries the name regardless of what that span contains.
 *
 * `data-mode` is the ONLY styling hook, keyed off the real state rather than
 * a parallel class.
 */
export function TriStateChoice({ mode, label, onCycle, children, className }: TriStateChoiceProps) {
  const name = mode === 'off' ? label : `${label}, ${mode === 'include' ? 'included' : 'excluded'}`;
  return (
    <button
      type="button"
      className={['gn-filters__choice', className].filter(Boolean).join(' ')}
      data-mode={mode}
      onClick={onCycle}
      aria-label={name}
    >
      <ChoiceGlyph mode={mode} />
      <span className="gn-filters__choice-label">{children ?? label}</span>
    </button>
  );
}
