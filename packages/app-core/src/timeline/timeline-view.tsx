import {
  MIN_BAR_PX,
  ScrollAdapter,
  ZOOM_PRESETS,
  axisLevels,
  barPx,
  crossFade,
  isMonday,
  isWeekend,
  keyOutside,
  mondayOnOrBefore,
  mountRange,
  panLimits,
  presetOf,
  type DayRange,
  type Frame,
  type ZoomPreset,
} from '@gisik-nokma/viewport';
import { SegmentedControl } from '@gisik-nokma/ui';
import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { UserNameFn } from '../claims/claim-labels.js';
import type { TicketDatesInput } from '../claims/ticket-dates.js';
import type { IsEpicType } from '../hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../view-types.js';
import { isoDayOf } from './timeline-days.js';
import { barsInRange, layoutLanes, type KeyMeasure, type LayoutLane } from './timeline-layout.js';
import {
  buildTimelineModel,
  type TimelineCustomClaim,
  type TimelineRow,
  type TimelineSideReason,
} from './timeline-model.js';

/**
 * The continuous timeline (spec 2026-10-03, Part 1, TV-1 to TV-11).
 *
 * One axis, no pages. The surface is a native scroll container (`ScrollAdapter`, `@gisik-nokma/viewport`) holding one tall
 * element; every bar is placed by CSS from three custom properties (`--d0`, `--dn`, `--row`) and ONE scale property
 * (`--tl-ppd`, px per day), so a zoom frame is a property write and a scroll write and never a React render. React re-renders
 * on three slow events only: the data changes, the zoom SETTLES (rows may re-pack, PK-4), or the view nears the edge of the
 * mounted band (PR-5).
 *
 * Everything this component decides is ARRANGEMENT. What a claim is, what it says, which lane a ticket sits in, why the
 * timeline is empty and which heading the side list carries are the model's answers, rendered verbatim.
 *
 * ## No colour literal
 *
 * Classes here, CSS in `packages/ui/src/ui.css`. The only inline styles are the computed numbers: a bar's day offset, length
 * and row, a lane's offset and extent, and the surface's length.
 *
 * ## No clock
 *
 * `today` is a prop, converted to a day number by the model. The engine's clock reads (`requestAnimationFrame`,
 * `performance.now`) live in `packages/viewport/src/dom/`, outside the clock-free roots, so
 * `test/calendar/clock-free.test.ts` still scans this file's source for device getters and finds none.
 *
 * ## jsdom has no layout
 *
 * A container 0 px wide (jsdom, or a hidden tab) has no viewport to virtualise against, so the view mounts every bar then;
 * with a real width it mounts the band `[visible - V, visible + V]` (PR-5).
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
   * WHAT THIS WORKSPACE CALLS AN EPIC — forwarded UNCHANGED, never defaulted here: `buildTimelineModel` states the default
   * (`isBuiltinEpicType`) and `epic-ancestor.ts` states why it is deliberately narrower than the server's rank-1 rule. It
   * reaches two answers in the model: `epicAncestorOf` (the lane filter and the grouping) and the undated-epic arm that
   * decides an undated epic's side-list entry.
   */
  isEpicType?: IsEpicType;
  /**
   * THE OWNER'S RULING (2026-09-20): an epic draws a row in the List and nowhere else, so this view does not draw the
   * epic's OWN bar. A lane that still holds a dated child keeps its heading, titled with the epic's name: the epic stays
   * visible as a NAME and goes absent as a ticket. Forwarded unchanged; see `calendar-model.ts`'s `hideEpicRows`.
   */
  hideEpicRows?: boolean;
};

/** The default zoom on open: the Week preset, 24 px per day (the Home mockup's scale). */
const DEFAULT_PPD: number = ZOOM_PRESETS.week;
/** The margin on each side of the drawn days is one viewport at the default zoom; this is its width before it is measured. */
const FALLBACK_WIDTH_PX = 960;
/** A key inside a bar needs its text plus the bar's padding on both sides, which is the narrowest bar (`MIN_BAR_PX`, pack.ts). */
const KEY_PADDING_PX = MIN_BAR_PX;
/** TG-13: the panel fills the height under the filters, but never less than this. */
const MIN_PANEL_PX = 320;
const PANEL_BOTTOM_GAP_PX = 16;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

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


type MeasureContext = { font: string; measureText(text: string): { width: number } };

/**
 * The width of a key on a bar, in px. A cached canvas measurement where the browser has one (`OffscreenCanvas`); a 6.5 px
 * per character estimate where it does not (jsdom). The estimate only decides whether a label is drawn outside its bar.
 */
function useKeyMeasure(): KeyMeasure {
  return useMemo(() => {
    const cache = new Map<string, number>();
    let context: MeasureContext | null | undefined;
    const measureWithCanvas = (text: string): number | null => {
      if (context === undefined) {
        context = typeof OffscreenCanvas === 'function' ? (new OffscreenCanvas(1, 1).getContext('2d') as MeasureContext | null) : null;
        if (context) context.font = '600 11px system-ui, sans-serif';
      }
      return context ? context.measureText(text).width : null;
    };
    return (key) => {
      if (key === null || key === '') return 0;
      const held = cache.get(key);
      if (held !== undefined) return held;
      const width = Math.ceil((measureWithCanvas(key) ?? key.length * 6.5) + KEY_PADDING_PX);
      cache.set(key, width);
      return width;
    };
  }, []);
}

/**
 * TV-11: the panel fills the height under the filters. Measured, not guessed: the panel's top edge to the bottom of the window,
 * re-read when the window resizes (a phone rotating, a keyboard opening). A flex parent cannot do this alone because the
 * project page's filter bar and the panel are siblings of unknown heights inside a scrolling page. The height it sets holds in
 * any flex parent: `.gn-timeline` is `flex-shrink: 0` (ui.css; a fixed-height flex column shrank it, T10's 29.040).
 */
function useFillHeight(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const fit = (): void => {
      const available = window.innerHeight - el.getBoundingClientRect().top - PANEL_BOTTOM_GAP_PX;
      el.style.height = `${Math.max(MIN_PANEL_PX, Math.floor(available))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [ref]);
}

/** Month and week labels for the days in [first, last]: `month` marks the 1st, `week` marks each Monday ("W 28 Sep"). */
function axisLabels(first: number, last: number): Array<{ day: number; month: string | null; week: string | null; number: string }> {
  const out: Array<{ day: number; month: string | null; week: string | null; number: string }> = [];
  for (let day = first; day <= last; day += 1) {
    const iso = isoDayOf(day);
    const dom = Number(iso.slice(8, 10));
    const monthName = MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
    out.push({
      day,
      month: dom === 1 ? `${monthName} ${iso.slice(0, 4)}` : null,
      week: isMonday(day) ? `W ${dom} ${monthName}` : null,
      number: String(dom),
    });
  }
  return out;
}

/** TG-14: status is never colour alone. A finished bar carries a check, one in progress a play mark, a not-started one nothing. */
function stateMark(category: string): { glyph: string; word: string } | null {
  if (category === 'terminal') return { glyph: '✓', word: 'Done' };
  if (category === 'active') return { glyph: '▶', word: 'In progress' };
  return null;
}

type TimelineBarProps = {
  row: TimelineRow;
  /** The packed row (PK-1). */
  layoutRow: number;
  firstDay: number;
  ppd: number;
  category: string;
  measure: KeyMeasure;
  detailId: string;
  onOpen: (ticketId: string) => void;
};

/**
 * One bar and everything that travels with it. MEMOISED: the mounted band refreshes at the quarter-edge (PR-5) and almost every bar
 * in it is the same bar as a frame ago, so a refresh renders only the bars that are new. Every prop is a primitive or a value
 * that is stable between refreshes (`row` comes from the model's memo, `measure` from `useKeyMeasure`, `onOpen` from a ref).
 */
const TimelineBar = memo(function TimelineBar(props: TimelineBarProps) {
  const { row, layoutRow, firstDay, ppd, category, measure, detailId, onOpen } = props;
  const mark = stateMark(category);
  const detail = [row.key, mark?.word, row.provenance, ...row.customClaims.map((entry) => entry.label)]
    .filter((part): part is string => part !== null && part !== undefined && part !== '')
    .join('; ');
  // E11: decided on the DRAWN width (never under MIN_BAR_PX), the width the packer reserved and ui.css draws.
  const drawnPx = barPx(row.endDay - row.startDay + 1, ppd);
  const outside = row.key !== null && keyOutside(drawnPx, measure(row.key));
  const vars = {
    ['--d0' as string]: row.startDay - firstDay,
    ['--dn' as string]: row.endDay - row.startDay + 1,
    ['--row' as string]: layoutRow,
  } as CSSProperties;
  return (
    <div className="gn-timeline__row" data-ticket-id={row.ticketId} style={vars}>
      <button
        type="button"
        className="gn-timeline__bar"
        data-day-from={row.startDay}
        data-day-to={row.endDay}
        data-pending={row.pending ? 'true' : undefined}
        data-state={mark === null ? undefined : mark.word === 'Done' ? 'done' : 'active'}
        aria-label={row.title}
        aria-describedby={detailId}
        title={detail}
        onClick={() => onOpen(row.ticketId)}
      >
        {mark !== null && (
          <span className="gn-timeline__mark" aria-hidden="true">
            {mark.glyph}
          </span>
        )}
        {!outside && row.key !== null && <span className="gn-timeline__key">{row.key}</span>}
        <span className="gn-timeline__title-text">{row.title}</span>
      </button>
      {outside && (
        <span className="gn-timeline__key gn-timeline__key--outside" aria-hidden="true">
          {row.key}
        </span>
      )}
      {/* TV-2: custom date claims stay beside the ticket. A bar row has no room for a list, so it is a callout that opens on
          hover or focus (CSS); the labels are also in the bar's hover and description. */}
      {row.customClaims.length > 0 && <CustomClaimList claims={row.customClaims} />}
      <span id={detailId} className="gn-visually-hidden">
        {detail}
      </span>
    </div>
  );
});

export function TimelineView(props: TimelineViewProps) {
  const idPrefix = useId();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFillHeight(panelRef);
  const adapterRef = useRef<ScrollAdapter | null>(null);
  const measure = useKeyMeasure();
  const openRef = useRef(props.onOpenTicket);
  openRef.current = props.onOpenTicket;
  const openTicket = useCallback((ticketId: string): void => openRef.current(ticketId), []);

  const model = useMemo(
    () =>
      buildTimelineModel(props.tickets, {
        today: props.today,
        userName: props.userName,
        ...(props.filter === undefined ? {} : { filter: props.filter }),
        ...(props.laneEpicId === undefined ? {} : { laneEpicId: props.laneEpicId }),
        ...(props.isEpicType === undefined ? {} : { isEpicType: props.isEpicType }),
        ...(props.hideEpicRows === undefined ? {} : { hideEpicRows: props.hideEpicRows }),
      }),
    [props.tickets, props.today, props.userName, props.filter, props.laneEpicId, props.isEpicType, props.hideEpicRows],
  );

  // ---- what is drawn: the pan range (TV-3) ----
  const [widthPx, setWidthPx] = useState(FALLBACK_WIDTH_PX);
  const anchorDay = model.todayDay ?? model.firstDay ?? 0;
  const drawn: DayRange | null = model.firstDay === null || model.lastDay === null ? null : { start: model.firstDay, end: model.lastDay };
  const limits = panLimits(drawn, anchorDay, Math.ceil(widthPx / DEFAULT_PPD));
  const firstDay = mondayOnOrBefore(limits.start);
  const extentDays = limits.end - firstDay + 1;

  // ---- the motion state React needs to hear about (slow) ----
  const [ppd, setPpd] = useState(DEFAULT_PPD);
  const [moving, setMoving] = useState(false);
  const [band, setBand] = useState<DayRange>(() => mountRange({ start: anchorDay - 27, end: anchorDay + 26 }));
  const [unmeasured, setUnmeasured] = useState(false);
  const bandRef = useRef(band);
  bandRef.current = band;
  const stateRef = useRef({ firstDay, extentDays, anchorDay });
  stateRef.current = { firstDay, extentDays, anchorDay };

  // ---- the layout: packed once per lane, re-packed only when the zoom SETTLES in another bucket ----
  const layout = useMemo(() => {
    const lanes: LayoutLane[] = model.groups.map((group) => ({
      laneId: group.epicId ?? 'no-epic',
      items: group.rows.map((row) => ({ id: row.ticketId, key: row.key, startDay: row.startDay, endDay: row.endDay })),
    }));
    return layoutLanes(lanes, { ppd, measure });
  }, [model.groups, ppd, measure]);
  const rowById = useMemo(() => {
    const byId = new Map<string, TimelineRow>();
    for (const group of model.groups) for (const row of group.rows) byId.set(row.ticketId, row);
    return byId;
  }, [model.groups]);
  const categoryById = useMemo(() => new Map(props.tickets.map((t) => [t.state.id, t.state.stateCategory])), [props.tickets]);

  // ---- the adapter ----
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const width = canvas.clientWidth;
    setUnmeasured(width === 0);
    if (width > 0) setWidthPx(width);
    const adapter = new ScrollAdapter({
      element: canvas,
      axis: 'x',
      firstDay: stateRef.current.firstDay,
      scale: DEFAULT_PPD,
      extentDays: () => stateRef.current.extentDays,
      todayDay: () => stateRef.current.anchorDay,
    });
    adapterRef.current = adapter;
    adapter.animateTo({ offset: stateRef.current.anchorDay + 0.5 - adapter.viewportDays() / 2 }, { instant: true });
    // Only the scale and the moving flag are this view's business; the first call below builds just those two (a whole
    // Frame literal would name the motion fields, and 11.180's reporting-scope guard scans this file for that vocabulary).
    const refresh = (frame: Pick<Frame, 'scale' | 'moving'>): void => {
      const levels = axisLevels(frame.scale);
      canvas.style.setProperty('--tl-fade-days', String(levels.dayNumbers));
      canvas.style.setProperty('--tl-fade-weeks', String(crossFade(frame.scale, 16)));
      canvas.dataset['weekend'] = levels.weekendTint ? 'on' : 'off';
      const range = adapter.visibleRange();
      const held = bandRef.current;
      const days = range.end - range.start + 1;
      if (range.start < held.start + days / 4 || range.end > held.end - days / 4) setBand(mountRange(range));
      if (!frame.moving) {
        setPpd((current) => (Math.abs(current - frame.scale) < 1e-6 ? current : frame.scale));
      }
      setMoving((current) => (current === frame.moving ? current : frame.moving));
    };
    const off = adapter.onFrame(refresh);
    if (width > 0) setBand(mountRange(adapter.visibleRange())); // PR-5 from the first measured frame; the 54-day guess is only transitional (planner ruling 2026-10-04)
    refresh({ scale: adapter.scale(), moving: false });
    return () => {
      off();
      adapter.destroy();
      adapterRef.current = null;
    };
  }, []);

  // The first day of the surface moved (data arrived to the left): keep the same day at the viewport edge.
  useLayoutEffect(() => {
    adapterRef.current?.rebase(firstDay);
  }, [firstDay]);

  // ---- toolbar ----
  const preset = presetOf(ppd);
  const zoomTo = (next: ZoomPreset): void => adapterRef.current?.animateTo({ scale: ZOOM_PRESETS[next] });
  const goToday = (): void => {
    const adapter = adapterRef.current;
    if (adapter !== null) adapter.animateTo({ offset: anchorDay + 0.5 - adapter.viewportDays() / 2 });
  };

  // ---- what to mount ----
  const range: DayRange = unmeasured ? { start: firstDay, end: firstDay + extentDays - 1 } : band;
  const labelDays = useMemo(() => axisLabels(Math.max(firstDay, range.start), Math.min(firstDay + extentDays - 1, range.end)), [firstDay, extentDays, range.start, range.end]);
  const surfaceStyle = {
    width: `calc(var(--tl-ppd) * ${extentDays} * 1px)`,
    height: `calc(var(--tl-axis-height) + ${layout.extent}px)`,
  } as CSSProperties;

  return (
    <div ref={panelRef} className="gn-timeline" data-zooming={moving ? 'true' : undefined}>
      <header className="gn-timeline__toolbar">
        <button type="button" className="gn-timeline__nav" onClick={goToday}>
          Today
        </button>
        <SegmentedControl<ZoomPreset | 'free'>
          variant="radio"
          aria-label="Timeline zoom"
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={preset ?? 'free'}
          onChange={(next) => {
            if (next !== 'free') zoomTo(next);
          }}
        />
      </header>

      {/* The model chose the sentence and it is rendered VERBATIM. ONE arm since 2026-10-03: nothing claimed, or a
          narrowing emptied it. "Dated work sits outside these weeks" is gone with the weeks. */}
      {model.emptyCopy !== null && (
        <p role="note" className="gn-timeline__empty">
          {model.emptyCopy}
        </p>
      )}

      <div className="gn-timeline__stage">
      <div ref={canvasRef} className="gn-timeline__canvas" role="group" aria-label="Timeline" tabIndex={0} style={{ ['--tl-ppd' as string]: DEFAULT_PPD }}>
        <div className="gn-timeline__surface" style={surfaceStyle}>
          <div className="gn-timeline__axis" aria-hidden="true">
            <div className="gn-timeline__axis-row gn-timeline__axis-row--period">
              {labelDays.map((d) =>
                d.month !== null ? (
                  <span key={`m${d.day}`} className="gn-timeline__axis-label gn-timeline__axis-label--month" style={{ ['--d0' as string]: d.day - firstDay } as CSSProperties}>
                    {d.month}
                  </span>
                ) : d.week !== null ? (
                  <span key={`w${d.day}`} className="gn-timeline__axis-label gn-timeline__axis-label--week" style={{ ['--d0' as string]: d.day - firstDay } as CSSProperties}>
                    {d.week}
                  </span>
                ) : null,
              )}
            </div>
            <div className="gn-timeline__axis-row gn-timeline__axis-row--days">
              {labelDays.map((d) => (
                <span
                  key={d.day}
                  className="gn-timeline__axis-day"
                  data-weekend={isWeekend(d.day) ? 'true' : undefined}
                  style={{ ['--d0' as string]: d.day - firstDay } as CSSProperties}
                >
                  {d.number}
                </span>
              ))}
            </div>
          </div>

          {model.todayDay !== null && (
            <span className="gn-timeline__today" aria-hidden="true" data-day={model.todayDay} style={{ ['--d0' as string]: model.todayDay - firstDay } as CSSProperties} />
          )}

          {model.groups.map((group, index) => {
            const lane = layout.lanes[index];
            if (lane === undefined) return null;
            return (
              <section
                key={group.epicId ?? 'no-epic'}
                className="gn-timeline__lane gn-timeline__group"
                style={{ ['--lane-offset' as string]: `${lane.offset}px`, ['--lane-extent' as string]: `${lane.extent}px` } as CSSProperties}
              >
                <h3 className="gn-timeline__group-heading">{group.epicTitle}</h3>
                {barsInRange(lane, range).map((placed) => {
                  const row = rowById.get(placed.id);
                  if (row === undefined) return null;
                  return (
                    <TimelineBar
                      key={row.ticketId}
                      row={row}
                      layoutRow={placed.row}
                      firstDay={firstDay}
                      ppd={ppd}
                      category={categoryById.get(row.ticketId) ?? 'open'}
                      measure={measure}
                      detailId={`${idPrefix}-detail-${row.ticketId}`}
                      onOpen={openTicket}
                    />
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
      </div>

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
          {/* The heading is a counted one, and the sentence under it is the model's
              choice among THREE (23.143): "no dates yet" (only undated work), the
              leaving-condition sentence (only work missing a claim, one of which
              has a date) and the mixed-list sentence. Verbatim. */}
          <h3 className="gn-timeline__side-heading">Not on the timeline yet ({model.sideList.length})</h3>
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
                {/* "Add dates" (UX fixes T8, 23.143, audit PV-11): the way forward the list never offered. It opens
                    the ticket's sheet, where the dates are set — there is no scroll-to-field door to open it at. */}
                <button
                  type="button"
                  className="gn-button gn-button--ghost gn-timeline__add-dates"
                  aria-label={`Add dates to ${entry.title}`}
                  onClick={() => props.onOpenTicket(entry.ticketId)}
                >
                  Add dates
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
