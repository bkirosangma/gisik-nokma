/** Content-space pixels. `y` grows downward, `x` with the day axis. */
export type Bounds = { x0: number; x1: number; y0: number; y1: number };
export type View = Bounds;

/**
 * A ticket's note and attachment counts, for the paper pin and its tooltip (D-W4-2: "2 notes, 1 attachment" without a second
 * request). The same shape as the index entry's `TimelinePin` that Part 4 T1 adds to `@gisik-nokma/domain`; T1 is not on this
 * task's base, so the draw list declares it here.
 */
export type PinCounts = { notes: number; attachments: number };

export type BarStyle = 'done' | 'active' | 'planned' | 'ghost';
/** `dim`: drawn at the emphasis opacity (Home's lit set, HM-2, and the selected flow, HM-4). Never set on text that must keep 4.5:1 by itself (ghosts, Not taken). */
type Base = { id: string; b: Bounds; z: number; dim?: boolean };

/** A 28 px bar (TG-1, TG-2). `passRank` 0 for the first pass, 1, 2 for later ones (T6). */
export type DrawBar = Base & {
  kind: 'bar';
  ticketId: string;
  style: BarStyle;
  key: string | null;
  title: string;
  /** A bar of 150 px or more shows the title on a second line (§13). */
  long: boolean;
  /** ✓ on done, ▶ on active (TG-4); null on planned and ghost. */
  mark: 'done' | 'active' | null;
  passRank: 0 | 1 | 2;
  pass: number;
  pin: PinCounts | null;
  /** `Not taken (pass 2)` and similar chips. */
  chip: string | null;
  draft: boolean;
  /** `labelPx` that packing reserved to the right of a short bar (key, plus 14 px when the pin follows it, PK-4). */
  labelPx: number;
  /** A bar too narrow for its key shows the key AFTER the bar; a pin that does not fit inside the bar's end follows the key (TG-11). */
  keyOutside: boolean;
  pinAt: 'inside' | 'after-key' | null;
  ariaLabel: string;
};
export type DrawDiamond = Base & {
  kind: 'diamond';
  ticketId: string;
  style: BarStyle;
  key: string | null;
  title: string;
  mark: 'done' | 'active' | null;
  revised: boolean;
  pin: PinCounts | null;
  draft: boolean;
  ariaLabel: string;
};
/** The thin line across a gap between two work periods of one ticket (TG-9). */
export type DrawConnector = Base & { kind: 'connector'; ticketId: string; dashed: boolean };
export type DrawEdge = Base & {
  kind: 'edge';
  from: string;
  to: string;
  d: string;
  label: { x: number; y: number; text: string } | null;
  edgeKind: 'leads_to' | 'blocks';
  loop: boolean;
  taken: boolean | null;
};
export type DrawHeading = Base & { kind: 'heading'; text: string; sticky: boolean };
export type DrawStrip = Base & { kind: 'strip'; text: string };
export type DrawToday = Base & { kind: 'today'; text: string };
export type DrawWeekend = Base & { kind: 'weekend' };
export type Draw = DrawBar | DrawDiamond | DrawConnector | DrawEdge | DrawHeading | DrawStrip | DrawToday | DrawWeekend;
