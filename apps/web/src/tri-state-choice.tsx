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
  /** The button decides nothing: the caller cycles the filter (`withCycledId`) and re-renders with the new mode. */
  onCycle: () => void;
  /**
   * A plain string, not `ReactNode`: the accessible name below is built by
   * string-concatenating this value, not by letting the browser compute a
   * name from rendered content. Widening this to `ReactNode` would silently
   * defeat that — see the docblock below.
   */
  children: string;
  className?: string;
};

/**
 * ONE control shape for every value in the Filters sheet (exclude-mode spec
 * §4): a cycling `<button>`. No `aria-pressed` — binary semantics would lie
 * for three states — so the state lives in the accessible NAME: "Uma One",
 * "Uma One, included", "Uma One, excluded".
 *
 * That name is set via `aria-label`, not via a visually-hidden suffix span
 * read alongside the visible label. A first draft tried the sibling-span
 * approach and it FAILED measured: the browser's accessible-name-from-content
 * algorithm inserts a separator space between each child node's contribution
 * (so screen readers don't run adjacent words together — the same reason
 * `<button>Save<span>Draft</span></button>` reads as "Save Draft", never
 * "SaveDraft"). Two sibling `<span>`s therefore compute to `"Uma One ,
 * included"` — a space before the comma — never the exact string the name
 * needs to be. `aria-label` is the only mechanism that yields an exact
 * string, which is why `children` is typed `string` above rather than
 * `ReactNode`: the label text has to exist as a string to build it.
 *
 * The visible label is still its own `<span className="gn-filters__choice-label">`
 * (the CSS strike-through in exclude mode targets it) — it just no longer
 * carries the name; `aria-label` on the button does, unconditionally, for
 * all three modes, so there is one naming mechanism rather than a branch
 * that only applies to include/exclude.
 *
 * `data-mode` is the ONLY styling hook, keyed off the real state rather than
 * a parallel class.
 */
export function TriStateChoice({ mode, onCycle, children, className }: TriStateChoiceProps) {
  const name =
    mode === 'off' ? children : `${children}, ${mode === 'include' ? 'included' : 'excluded'}`;
  return (
    <button
      type="button"
      className={['gn-filters__choice', className].filter(Boolean).join(' ')}
      data-mode={mode}
      onClick={onCycle}
      aria-label={name}
    >
      <ChoiceGlyph mode={mode} />
      <span className="gn-filters__choice-label">{children}</span>
    </button>
  );
}
