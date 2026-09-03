import type { ReactElement } from 'react';
import type { NotificationKind } from '@gisik-nokma/domain';

/**
 * One glyph per notification kind.
 *
 * ## A RECORD, not a switch, and that is the whole safety argument
 *
 * `Record<NotificationKind, ReactElement>` is exhaustive by TYPE: a sixth kind
 * added to `NOTIFICATION_KINDS` makes this object literal fail to compile. A
 * switch — which is what the plan's draft is a hair away from — would fall
 * through for the new kind and render an EMPTY `<svg>`: an icon-shaped hole,
 * on screen, in a suite that only ever asked whether an svg appeared.
 *
 * The compiler cannot check what the arms CONTAIN, though, only that all five
 * exist. An entry left as an empty fragment, or one kind's paths pasted over
 * another's, compiles and renders. `test/inbox/icons.test.tsx` measures the
 * five rendered `innerHTML`s and asserts there are five DISTINCT ones — the one
 * assertion that catches an empty arm and a copy-paste at the same time.
 *
 * ## `currentColor` and nothing else
 *
 * No colour is named in this file. The stroke is the surrounding text colour,
 * which the inbox's own CSS sets from a token role — so an icon can never be a
 * hue the palette does not own, and `token-discipline.test.ts` has nothing to
 * find here. The kind's meaning is carried by the SHAPE; colour would be a
 * second channel saying the same thing, and one of the two would eventually
 * disagree.
 */
const PATHS: Record<NotificationKind, ReactElement> = {
  /** A person: somebody put this on your desk. */
  assignment: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  /** The at-sign, drawn: somebody named you. */
  mention: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </>
  ),
  /** A warning triangle: a claim of yours was refused, with a reason. */
  'contested-claim': (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  /** A calendar leaf — the same object the month grid is. */
  'date-approaching': (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  /** A clock: elapsed time, not a deadline. */
  'stale-ticket': (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
};

export type NotificationIconProps = { kind: NotificationKind };

/**
 * `aria-hidden`, and deliberately: the row's accessible name is the attributed
 * headline, which already says what kind of thing happened in words. A label
 * here would make every row announce its kind twice.
 *
 * `data-kind` is not decoration — it is how a test can tell WHICH glyph a row
 * drew, and the inbox suite reads it to prove that five kinds render five
 * different icons rather than five copies of one.
 *
 * NO CLASS, and that is a correction rather than an omission. This element
 * carried `gn-inbox__icon` and `ui.css` had NO RULE for it, at any point — the
 * class styled nothing, and the review that found it asked whether a rule had
 * been dropped or the class was vestigial. Vestigial: the stroke is
 * `currentColor`, which resolves from `.gn-inbox__glyph`'s `color` on the span
 * one level up (muted normally, `var(--gn-accent)` under `[data-unread]`), and
 * the box is the `width`/`height` attributes below. There was nothing for a
 * rule to say. Removing it is what lets
 * `test/inbox/inbox-css-binding.test.tsx` hold rendered classes and styled
 * classes to EQUALITY instead of a subset — and equality is the only form of
 * that check which also catches a rename made on the stylesheet's side.
 */
export function NotificationIcon({ kind }: NotificationIconProps) {
  return (
    <svg
      data-kind={kind}
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[kind]}
    </svg>
  );
}
