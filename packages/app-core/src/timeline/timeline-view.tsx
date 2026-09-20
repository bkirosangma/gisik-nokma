import { useMemo, useState, type CSSProperties } from 'react';
import type { UserNameFn } from '../claims/claim-labels.js';
import { addDays, mondayOnOrBefore } from '../claims/dates.js';
import type { TicketDatesInput } from '../claims/ticket-dates.js';
import type { IsEpicType } from '../hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../view-types.js';
import {
  buildTimelineModel,
  type TimelineCustomClaim,
  type TimelineSideReason,
} from './timeline-model.js';

/**
 * The week columns, over Task 10's landed model. Everything this component
 * owns is ARRANGEMENT: which four-week step the window sits on. Nothing here
 * decides what a claim is, what it says, which week it falls in, why the
 * timeline is empty, or which heading the side list carries — those are the
 * model's answers and they are rendered VERBATIM.
 *
 * ## No colour literal, and no `tokens.color.*` either
 *
 * The plan writes `tokens.color.*`, `tokens.space.*`, `tokens.font.body` and
 * `tokens.radius.sm` throughout this file; `@gisik-nokma/ui` exports no
 * `tokens` object. It exports a ROLE system, and the way a shipped component
 * in this repo reaches it is a BEM class whose colours resolve to
 * `var(--gn-…)` in `packages/ui/src/ui.css` (see `.gn-state-node`,
 * `.gn-board`, `.gn-calendar`). So: classes here, CSS there. Task 9 answered
 * the same question for the sibling grid and found five of the plan's six
 * colour names were existing roles under new words; this file needed no new
 * role at all — a bar is `accent`, an in-transit claim is `pending`, a custom
 * date claim is `customMarker`, the grid lines are `border`.
 *
 * The only inline styles are the two COMPUTED numbers: the bar's
 * `grid-column`, and the column count below.
 *
 * ## The column count is stated ONCE
 *
 * The plan writes `gridTemplateColumns` twice — once on the week header, once
 * on every ticket row — from the same expression. Two statements of one
 * layout, free to disagree, and a disagreement would silently slide every bar
 * off the column it names without failing anything. Here the week TRACK LIST
 * is set once on the root as a custom property and both grids read it from
 * CSS, which keeps the title column's width in the stylesheet with the rest of
 * the layout.
 *
 * It carries `repeat(n, 1fr)` rather than the bare `n`, and that is the whole
 * point of the shape: `grid-template-columns: 12rem var(--timeline-week-columns)`
 * substitutes a var as a plain COMPONENT of the value, while
 * `repeat(var(--n), 1fr)` would substitute one into a function's argument. No
 * test in this repo could tell the difference — jsdom computes no layout — and
 * if that second form failed to parse the whole declaration would become
 * `none`, every row would fall back to implicit auto-placed tracks, and the
 * bar's `grid-column` would index into them. A silently broken timeline behind
 * a green suite is exactly what this file is not allowed to ship.
 *
 * It is deliberately NOT `--gn-`-prefixed. That namespace belongs to the token
 * origin, and `packages/ui/test/tokens.test.ts` asserts that every
 * `var(--gn-…)` in `ui.css` names a declared colour ROLE — a track list is not
 * a colour, and borrowing the prefix would either redden that guard or force
 * it to grow an exception.
 *
 * ## NO CLOCK IS READ HERE
 *
 * `today` is a prop. The mounting shell reads the device's INSTANT and hands
 * it to the domain's `istDayOf`, the one place in the product that turns an
 * instant into a day. This surface is the one that turns a claimed day into a
 * NUMBER — a week index — so a device getter here would not merely mislabel a
 * column: it would file the same claim in a different week from the calendar's
 * answer about that same claim. One product, two answers.
 * `test/calendar/clock-free.test.ts` scans this file's source to keep it out.
 */

export type TimelineViewProps = {
  tickets: TicketDatesInput[];
  /** The IST day, injected by the shell. See the clock note above. */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /**
   * WHAT THIS WORKSPACE CALLS AN EPIC — forwarded UNCHANGED, never defaulted
   * here, for the same reason `weeksCount` below is: `buildTimelineModel` states
   * the default (`isBuiltinEpicType`) and `epic-ancestor.ts` states why that
   * default is deliberately narrower than the server's rank-1 rule.
   *
   * It reaches TWO answers in the model, not one: `epicAncestorOf` for the lane
   * filter and grouping, and the `isEpicType(input.state.typeId) && start ===
   * null && due === null` arm that decides an undated epic's side-list entry.
   * `CalendarView` gained the same prop in the same change — see its note for
   * why fixing one view alone would have been worse than fixing neither.
   */
  isEpicType?: IsEpicType;
  /**
   * Forwarded UNCHANGED, never defaulted here. `buildTimelineModel` states the
   * default (8) and refuses a count it cannot mean; a `?? 8` in this file
   * would be a second statement of the window's width, free to drift from the
   * model's, and a clamp would swallow the refusal.
   */
  weeksCount?: number;
};

/** Earlier/Later move four weeks. */
const SHIFT_DAYS = 28;

/**
 * A ticket's custom date claims, beside the ticket rather than across the
 * weeks — they are facts about the work, not spans of it. Each label is the
 * model's attributed rendering, printed verbatim.
 */
function CustomClaimList(props: { claims: readonly TimelineCustomClaim[] }) {
  return (
    <ul className="gn-timeline__claims" data-custom-claims="">
      {props.claims.map((entry) => (
        <li
          key={entry.claim.fieldId}
          className="gn-timeline__claim"
          data-field-id={entry.claim.fieldId}
          data-pending={entry.claim.pending ? 'true' : undefined}
        >
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * One modifier per reason, ONE-TO-ONE, and the `never` arm is the point.
 *
 * The plan's draft predates `unplaceable-day` and switches over four reasons;
 * a fifth falling through such a switch produces no class at all — a row that
 * renders, and says nothing about why it cannot be drawn, in a suite that
 * stays green. The exhaustive default makes a sixth reason a COMPILE error
 * rather than a silent blank.
 *
 * It is 1:1 rather than bucketed into "missing a claim" and "cannot be drawn"
 * even though only two treatments exist in `ui.css` today: the model already
 * owns that partition (`MISSING_CLAIM_REASONS`, which chooses the side-list
 * heading) and does not export it. A two-arm switch here would be a second
 * statement of the same grouping, free to disagree with the heading printed
 * directly above the rows it grouped. CSS decides which modifiers look alike.
 *
 * Today CSS gives the two undrawable reasons a treatment and the three
 * missing-claim ones none — deliberately, and documented at the rules in
 * `ui.css`. That is what makes the arms below dangerous: an arm returning the
 * wrong missing-claim class, or the empty string, changes nothing on screen
 * AND nothing in a suite that only asks whether a row was classed. The
 * compiler proves this switch is exhaustive; it proves nothing about what the
 * arms RETURN. All five VALUES are pinned by exact whole-class equality in
 * `test/timeline/timeline-view.test.tsx` 11.77.
 */
function sideEntryClassName(reason: TimelineSideReason): string {
  switch (reason) {
    case 'no-dates':
      return 'gn-timeline__side-entry gn-timeline__side-entry--no-dates';
    case 'start-only':
      return 'gn-timeline__side-entry gn-timeline__side-entry--start-only';
    case 'due-only':
      return 'gn-timeline__side-entry gn-timeline__side-entry--due-only';
    case 'start-after-due':
      return 'gn-timeline__side-entry gn-timeline__side-entry--start-after-due';
    case 'unplaceable-day':
      return 'gn-timeline__side-entry gn-timeline__side-entry--unplaceable-day';
    default: {
      const exhaustive: never = reason;
      throw new RangeError(`unknown side-list reason: ${String(exhaustive)}`);
    }
  }
}

export function TimelineView(props: TimelineViewProps) {
  /**
   * The window's first Monday. Seeded from the prop, and `Today` re-seeds from
   * the prop rather than from whatever it was mounted with — so a shell that
   * re-renders across midnight returns to the day it is now handing in.
   */
  const [anchor, setAnchor] = useState<string>(mondayOnOrBefore(props.today));

  const model = useMemo(
    () =>
      buildTimelineModel(props.tickets, {
        anchor,
        userName: props.userName,
        ...(props.filter === undefined ? {} : { filter: props.filter }),
        ...(props.laneEpicId === undefined ? {} : { laneEpicId: props.laneEpicId }),
        ...(props.isEpicType === undefined ? {} : { isEpicType: props.isEpicType }),
        ...(props.weeksCount === undefined ? {} : { weeksCount: props.weeksCount }),
      }),
    [
      props.tickets,
      props.userName,
      props.filter,
      props.laneEpicId,
      props.isEpicType,
      props.weeksCount,
      anchor,
    ],
  );

  /* Board prototype port Task 11 (2026-09-16), spec Timeline `:506-538`,
     "Header grid" row: `minmax(0, 1fr)` per week track, not a bare `1fr` —
     CSS Grid's implicit automatic minimum is `auto` (min-content) on a plain
     `1fr` track, so a long bar or title text can still push a week column
     wider than its share and defeat `.gn-timeline__bar`'s own
     `overflow:hidden; text-overflow:ellipsis`. `minmax(0, …)` is what lets a
     track actually shrink below its content's intrinsic size. Pinned by
     exact equality in `test/timeline/timeline-view.test.tsx` (11.82: the
     default-eight and the `weeksCount:2` cases), updated alongside this. */
  const layout = {
    '--timeline-week-columns': `repeat(${model.weeks.length}, minmax(0, 1fr))`,
  } as CSSProperties;

  return (
    <div className="gn-timeline" style={layout}>
      <header className="gn-timeline__header">
        <button
          type="button"
          className="gn-timeline__nav"
          onClick={() => setAnchor(addDays(anchor, -SHIFT_DAYS))}
        >
          {/* Decorative: the word carries the meaning, so the accessible name
              is the word and nothing else. */}
          <span className="gn-timeline__glyph" aria-hidden="true">
            ‹
          </span>
          Earlier
        </button>
        <button
          type="button"
          className="gn-timeline__nav"
          onClick={() => setAnchor(mondayOnOrBefore(props.today))}
        >
          Today
        </button>
        <button
          type="button"
          className="gn-timeline__nav"
          onClick={() => setAnchor(addDays(anchor, SHIFT_DAYS))}
        >
          Later
          <span className="gn-timeline__glyph" aria-hidden="true">
            ›
          </span>
        </button>
      </header>

      {/*
        The model chose the sentence and it is rendered VERBATIM. **TWO arms
        since 2026-09-20** — nothing claimed OR a narrowing emptied it (one
        sentence, which names the narrowing because the model cannot tell the
        two apart), and dated work scheduled outside these weeks — because they
        are different facts, and the second is the one this component CANNOT
        reconstruct: its props say nothing about where the window is. There is
        deliberately no bare "nothing here" branch.
      */}
      {model.emptyCopy !== null && (
        <p role="note" className="gn-timeline__empty">
          {model.emptyCopy}
        </p>
      )}

      <div className="gn-timeline__weeks">
        <div className="gn-timeline__corner" />
        {model.weeks.map((week) => (
          <div key={week.start} className="gn-timeline__week" data-week={week.start}>
            {week.label}
          </div>
        ))}
      </div>

      {model.groups.map((group) => (
        <section key={group.epicId ?? 'no-epic'} className="gn-timeline__group">
          <h3 className="gn-timeline__group-heading">{group.epicTitle}</h3>
          {group.rows.map((row) => (
            <div key={row.ticketId} className="gn-timeline__row" data-ticket-id={row.ticketId}>
              <div className="gn-timeline__title">
                <div className="gn-timeline__title-text">{row.title}</div>
                {row.customClaims.length > 0 && <CustomClaimList claims={row.customClaims} />}
              </div>
              <button
                type="button"
                className="gn-timeline__bar"
                data-pending={row.pending ? 'true' : undefined}
                data-clipped-start={row.bar.clippedStart ? 'true' : undefined}
                data-clipped-end={row.bar.clippedEnd ? 'true' : undefined}
                /* Column 1 is the title, so week `i` is column `i + 2`; the end
                   is exclusive, hence `+ 3`. The one genuinely computed style
                   in this file. */
                style={{ gridColumn: `${row.bar.fromWeek + 2} / ${row.bar.toWeek + 3}` }}
                title={[row.provenance, ...row.customClaims.map((entry) => entry.label)].join(' · ')}
                onClick={() => props.onOpenTicket(row.ticketId)}
              >
                {row.title}
              </button>
            </div>
          ))}
        </section>
      ))}

      {/*
        A VISIBLE aside, never a disclosure: partially dated work is honest
        information, not an error state to tuck away. Rendered only when it has
        a row, for the reason the calendar's legend is — its heading is a
        sentence ABOUT the entries under it, and a sentence over nothing is
        chrome that says nothing. This can never hide the empty copy: the model
        reaches `emptyCopy` only when the side list is empty too.
      */}
      {model.sideList.length > 0 && (
        <aside className="gn-timeline__side" aria-label="Undated or partially dated">
          {/* The model chose between two headings — one true only of entries
              waiting on a missing claim, one true of a mixed list. Verbatim. */}
          <p className="gn-timeline__side-copy">{model.sideListCopy}</p>
          <ul className="gn-timeline__side-list">
            {model.sideList.map((entry) => (
              <li
                key={entry.ticketId}
                className={sideEntryClassName(entry.reason)}
                data-reason={entry.reason}
              >
                <button
                  type="button"
                  className="gn-timeline__open"
                  onClick={() => props.onOpenTicket(entry.ticketId)}
                >
                  {entry.title}
                </button>
                {/* The model's note, verbatim — it already narrows to exactly
                    what is missing, and a ticket carrying a custom date claim
                    is not told it has "no claimed dates". */}
                <span className="gn-timeline__side-note">{entry.note}</span>
                {entry.customClaims.length > 0 && <CustomClaimList claims={entry.customClaims} />}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
