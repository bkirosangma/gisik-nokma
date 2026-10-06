/**
 * The paper pin (Workflow and Timeline graphs, TG-11): the small mark on a timeline bar that says "this ticket has a note or an
 * attachment". The owner's word is "paper pin"; the glyph is a paper clip. Same precedent as `pencil-icon.tsx` and
 * `plus-icon.tsx` — 24x24 viewBox, `fill="none"`, `stroke="currentColor"`, `aria-hidden="true"` — so it takes the ink of the
 * bar around it and never speaks: the bar's own description carries the counts ("2 notes, 1 attachment"). It is not a button,
 * and `focusable="false"` keeps an old engine from giving the svg a tab stop. 12 px is the timeline's size (ui.css reserves
 * room for exactly that, 29.117); the stroke is heavier than the 18 px icons' 2 so the clip still reads at 12 px. The
 * Timeline graph (Part 4) draws the same glyph from here.
 */
export function PaperPinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
