import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * THE PHONE TICKET-SHEET HEADER THAT COMPACTS WITH THE SCROLL (smoothness G-8, owner 2026-10-02).
 *
 * ## The shape, and why it cannot jitter
 *
 * The scroller is `.gn-sheet__body`; the header is an in-flow flex sibling ABOVE it, so a header that
 * shrank would reflow the body under the reader's thumb — the jitter the owner ruled out. So on a
 * phone this hook takes the header OUT of the flow:
 *
 *   - the header becomes an `absolute` overlay whose height is the ONLY thing besides `transform`
 *     that changes with the scroll (nothing it owns is in the body's flow);
 *   - the body reserves the header's FULL height once, as `padding-top` (`--gh-h0`), so the content
 *     starts exactly where it did and moves by exactly the scroll delta;
 *   - every child (crumb parts, title, ✕, Move) is `position: absolute` at the origin and carries a
 *     `transform` of `translate(from + (to − from) × --p)`, where the FROM and TO points are MEASURED
 *     ONCE here and written as custom properties — the per-frame work is ONE `--p` write.
 *
 * `--p` is the eased scroll progress `clamp(scrollTop / range)`. It is written from a passive scroll
 * listener through `requestAnimationFrame`, so a frame costs one style write and no layout read of
 * anything the header owns.
 *
 * ## Phones only
 *
 * Everything is gated on `(max-width: 40rem)` here AND in the CSS (`[data-compact]` is only ever set
 * on a phone), so a desktop, a server render and every existing test see no change at all.
 */

export const SHEET_COMPACT_QUERY = '(max-width: 40rem)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Compact geometry, in px (the 13px/18px crumb line of `.gn-ticket-sheet__crumbs`). */
export const COMPACT_PAD_X = 16;
export const COMPACT_PAD_TOP = 8;
export const COMPACT_PAD_BOTTOM = 8;
export const COMPACT_CRUMB_H = 18;
export const COMPACT_ROW_GAP = 2;
/** 13px title over the full 26px one. */
export const COMPACT_TITLE_SCALE = 0.5;
/** The title's own line box before scaling (`2rem`). */
export const COMPACT_TITLE_LINE = 32;
export const COMPACT_CLOSE_BOX = 44;
export const COMPACT_CLOSE_SCALE = 28 / 44;
const COMPACT_CLOSE_RIGHT = 4;
/** Room the ✕ takes from the line's right end. */
const COMPACT_LINE_RESERVE = COMPACT_CLOSE_BOX + COMPACT_CLOSE_RIGHT + 4;
/** Width of a lone "…" at the crumb size. */
export const COMPACT_ELLIPSIS_W = 14;
export const COMPACT_RANGE_MIN = 120;
export const COMPACT_RANGE_MAX = 240;
export const PEEK_CLOSE_MS = 140;

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Smoothstep: eased, continuous, no snap. */
export function easeProgress(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * `p` for a scroll offset. Reduced motion switches full ↔ compact at the half-way point with NO
 * interpolation (a step of 0 or 1).
 */
export function progressFor(scrollTop: number, range: number, reducedMotion: boolean): number {
  const raw = clamp01(range > 0 ? scrollTop / range : 0);
  if (reducedMotion) return raw >= 0.5 ? 1 : 0;
  return easeProgress(raw);
}

export function rangeFor(fullHeight: number, compactHeight: number): number {
  const span = fullHeight - compactHeight;
  return span < COMPACT_RANGE_MIN ? COMPACT_RANGE_MIN : span > COMPACT_RANGE_MAX ? COMPACT_RANGE_MAX : span;
}

export interface CompactLinePlan {
  /** Compact width of each breadcrumb part (crumbs and separators, in order). */
  readonly widths: readonly number[];
  /** Compact x of each part, from the line's left edge. */
  readonly x: readonly number[];
  /** Whether the middle was folded to "…". */
  readonly folded: boolean;
}

function lineWidth(widths: readonly number[], gap: number): number {
  let visible = 0;
  let sum = 0;
  for (const w of widths) {
    if (w > 0) {
      visible += 1;
      sum += w;
    }
  }
  return visible === 0 ? 0 : sum + gap * (visible - 1);
}

/**
 * Lay the breadcrumb out on ONE line, folding only if it does not fit.
 *
 * `widths` are the natural widths of every direct child of the nav: crumb, separator, crumb, …, the
 * ticket key last. The FIRST crumb (workspace) and the LAST (ticket key) are kept; the MIDDLE — the
 * project and any epic / parent with their separators — narrows until only "…" remains: the project
 * part keeps its place and shrinks to the ellipsis, the rest collapse to nothing.
 */
export function planCompactLine(
  widths: readonly number[],
  gap: number,
  available: number,
  ellipsisW: number = COMPACT_ELLIPSIS_W,
): CompactLinePlan {
  const n = widths.length;
  const next = widths.slice();
  let folded = false;
  if (lineWidth(next, gap) > available + 0.5 && n >= 5) {
    folded = true;
    next[2] = Math.min(next[2] ?? 0, ellipsisW);
    for (let i = 3; i <= n - 3; i += 1) next[i] = 0;
    const over = lineWidth(next, gap) - available;
    if (over > 0.5) {
      // Still too long: the workspace gives way first, then the key, never below the ellipsis.
      next[0] = Math.max(ellipsisW, (next[0] ?? 0) - over);
      const over2 = lineWidth(next, gap) - available;
      if (over2 > 0.5) next[n - 1] = Math.max(ellipsisW, (next[n - 1] ?? 0) - over2);
    }
  }
  const x: number[] = [];
  let cursor = 0;
  for (const w of next) {
    x.push(cursor);
    if (w > 0) cursor += w + gap;
  }
  return { widths: next, x, folded };
}

export type PeekKind = 'crumbs' | 'title';
export interface PeekState {
  readonly kind: PeekKind;
  readonly closing: boolean;
}

export interface SheetHeaderCompact {
  /** The phone arm is on (matchMedia at ≤40rem) and this hook owns the header. */
  readonly enabled: boolean;
  readonly mode: 'full' | 'compact';
  /** The breadcrumb did not fit on one line, so its middle folded to "…". */
  readonly folded: boolean;
  readonly peek: PeekState | null;
  /** Move is in the header's corner (gone) while compact, unless the title peek brings it back. */
  readonly moveInert: boolean;
  readonly togglePeek: (kind: PeekKind) => void;
  readonly closePeek: () => void;
}

const px = (n: number): string => String(Math.round(n * 100) / 100);

interface Parts {
  panel: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  nav: HTMLElement | null;
  title: HTMLElement | null;
  close: HTMLElement | null;
  move: HTMLElement | null;
}

function partsOf(heading: HTMLElement | null): Parts | null {
  if (heading === null) return null;
  const panel = heading.closest<HTMLElement>('.gn-sheet');
  if (panel === null) return null;
  const header = panel.querySelector<HTMLElement>('.gn-sheet__header');
  const body = panel.querySelector<HTMLElement>('.gn-sheet__body');
  if (header === null || body === null) return null;
  return {
    panel,
    header,
    body,
    nav: heading.querySelector<HTMLElement>('.gn-ticket-sheet__crumbs'),
    title: heading.querySelector<HTMLElement>('.gn-ticket-sheet__title-input'),
    close: header.querySelector<HTMLElement>('.gn-sheet__close'),
    move: header.querySelector<HTMLElement>('.gn-sheet__move'),
  };
}

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/**
 * @param headingRef the `.gn-sheet__heading` the ticket sheet passes as `titleSlot` (the hook finds
 *   the sheet panel, header, scroller, close and Move from it).
 * @param layoutKey changes whenever something that moves the header's natural geometry changes (a
 *   title edit, a crumb label, the mode) — a change re-measures.
 */
export function useSheetHeaderCompact(
  headingRef: RefObject<HTMLElement | null>,
  layoutKey: string,
): SheetHeaderCompact {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'full' | 'compact'>('full');
  const [folded, setFolded] = useState(false);
  const [peek, setPeek] = useState<PeekState | null>(null);
  const modeRef = useRef<'full' | 'compact'>('full');
  const peekRef = useRef<PeekState | null>(null);
  const rangeRef = useRef(COMPACT_RANGE_MIN);
  const reducedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  peekRef.current = peek;

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(SHEET_COMPACT_QUERY);
    const sync = (): void => setEnabled(list.matches);
    sync();
    list.addEventListener?.('change', sync);
    return () => list.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    reducedRef.current = matches(REDUCED_MOTION_QUERY);
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = (): void => {
      reducedRef.current = list.matches;
    };
    list.addEventListener?.('change', sync);
    return () => list.removeEventListener?.('change', sync);
  }, []);

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const closePeek = useCallback((): void => {
    const current = peekRef.current;
    if (current === null || current.closing) return;
    clearTimer();
    if (reducedRef.current) {
      setPeek(null);
      return;
    }
    setPeek({ kind: current.kind, closing: true });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPeek(null);
    }, PEEK_CLOSE_MS);
  }, []);

  const togglePeek = useCallback(
    (kind: PeekKind): void => {
      const current = peekRef.current;
      if (current !== null && current.kind === kind && !current.closing) {
        closePeek();
        return;
      }
      clearTimer();
      setPeek({ kind, closing: false });
    },
    [closePeek],
  );

  useEffect(() => clearTimer, []);

  /** One `--p` write: reads the scroller, writes the panel. */
  const applyProgress = useCallback((): void => {
    const parts = partsOf(headingRef.current);
    if (parts === null) return;
    const p = progressFor(parts.body.scrollTop, rangeRef.current, reducedRef.current);
    parts.panel.style.setProperty('--p', px(p));
    if (p >= 0.999) parts.panel.setAttribute('data-settled', '');
    else parts.panel.removeAttribute('data-settled');
    const next = p >= 0.5 ? 'compact' : 'full';
    if (next !== modeRef.current) {
      modeRef.current = next;
      parts.panel.setAttribute('data-compact', next);
      setMode(next);
    }
  }, [headingRef]);

  /** Measure the natural (full) geometry ONCE and write every from/to point as a custom property. */
  const measure = useCallback((): void => {
    const parts = partsOf(headingRef.current);
    if (parts === null) return;
    const { panel, header, nav, title, close, move } = parts;
    // The natural flow: take the header's absolute layout away for the reads, put it back below.
    // Both happen inside this one task, so no frame paints between them.
    panel.removeAttribute('data-compact');
    // A button's own `transform` transition would keep the OLD compact transform alive for the reads below (a re-measure would
    // count it twice), so the movers are read with the transition and the transform both off.
    const movers = [...(nav === null ? [] : (Array.from(nav.children) as HTMLElement[])), title, close, move].filter(
      (el): el is HTMLElement => el !== null,
    );
    for (const el of movers) {
      el.style.transition = 'none';
      el.style.transform = 'none';
    }
    if (title !== null) {
      title.style.height = 'auto';
      if (title.scrollHeight > 0) title.style.height = `${title.scrollHeight}px`;
    }
    const hr = header.getBoundingClientRect();
    const W = hr.width;
    const rel = (el: Element): { x: number; y: number; w: number; h: number } => {
      const r = el.getBoundingClientRect();
      return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
    };
    const set = (name: string, value: number): void => panel.style.setProperty(name, px(value));

    const hasNav = nav !== null && nav.children.length > 0;
    const titleY1 = COMPACT_PAD_TOP + (hasNav ? COMPACT_CRUMB_H + COMPACT_ROW_GAP : 0);
    const titleLine = COMPACT_TITLE_LINE * COMPACT_TITLE_SCALE;
    const hFull = hr.height;
    const hCompact = titleY1 + titleLine + COMPACT_PAD_BOTTOM;
    const available = Math.max(0, W - COMPACT_PAD_X - COMPACT_LINE_RESERVE);
    set('--gh-h0', hFull);
    set('--gh-h1', hCompact);
    set('--gts', COMPACT_TITLE_SCALE);
    rangeRef.current = rangeFor(hFull, hCompact);

    let isFolded = false;
    if (hasNav && nav !== null) {
      const items = Array.from(nav.children) as HTMLElement[];
      const rects = items.map(rel);
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 6;
      const plan = planCompactLine(
        rects.map((r) => r.w),
        gap,
        available,
      );
      isFolded = plan.folded;
      items.forEach((item, i) => {
        const r = rects[i]!;
        const w1 = plan.widths[i] ?? r.w;
        item.style.setProperty('--gx0', px(r.x));
        item.style.setProperty('--gy0', px(r.y));
        item.style.setProperty('--gw0', px(r.w));
        item.style.setProperty('--gx1', px(COMPACT_PAD_X + (plan.x[i] ?? 0)));
        item.style.setProperty('--gy1', px(COMPACT_PAD_TOP));
        // A collapsed part keeps its width (it only fades and slides), so its text never re-wraps mid-tween.
        item.style.setProperty('--gw1', px(w1 === 0 ? r.w : w1));
        item.style.setProperty('--gfade', w1 === 0 ? '1' : '0');
        if (w1 === 0) item.setAttribute('data-collapsed', '');
        else item.removeAttribute('data-collapsed');
      });
    }

    if (title !== null) {
      const t = rel(title);
      set('--gtx0', t.x);
      set('--gty0', t.y);
      set('--gtw0', t.w);
      set('--gth0', t.h);
      set('--gtx1', COMPACT_PAD_X);
      set('--gty1', titleY1);
      set('--gtw1', Math.max(0, available));
      set('--gth1', COMPACT_TITLE_LINE);
    }
    const cx1 = W - COMPACT_CLOSE_BOX - COMPACT_CLOSE_RIGHT;
    const cy1 = (hCompact - COMPACT_CLOSE_BOX) / 2;
    if (close !== null) {
      const c = rel(close);
      set('--gcx0', c.x);
      set('--gcy0', c.y);
      set('--gcx1', cx1);
      set('--gcy1', cy1);
      set('--gcs', COMPACT_CLOSE_SCALE);
    }
    if (move !== null) {
      const m = rel(move);
      set('--gmx0', m.x);
      set('--gmy0', m.y);
      set('--gmw', m.w);
      set('--gmx1', cx1 + COMPACT_CLOSE_BOX / 2 - m.w / 2);
      set('--gmy1', cy1 + COMPACT_CLOSE_BOX / 2 - m.h / 2);
      set('--gmx2', W - COMPACT_PAD_X / 2 - 12 - m.w);
      set('--gmy2', hCompact + 6 + 12);
    }
    panel.setAttribute('data-compact', modeRef.current);
    // Put the transform back and let it land with the transition still off, THEN give the transition back: no tween starts.
    for (const el of movers) el.style.removeProperty('transform');
    void header.offsetWidth;
    for (const el of movers) el.style.removeProperty('transition');
    setFolded(isFolded);
    applyProgress();
  }, [headingRef, applyProgress]);

  // Measure after every commit that changes the natural geometry, before paint.
  useLayoutEffect(() => {
    if (!enabled) return;
    measure();
  }, [enabled, layoutKey, mode, folded, measure]);

  // Leaving the phone arm (a rotation past 40rem) puts the header back to its natural layout.
  useLayoutEffect(
    () => () => {
      const parts = partsOf(headingRef.current);
      if (parts !== null) {
        parts.panel.removeAttribute('data-compact');
        parts.panel.removeAttribute('data-settled');
        parts.panel.removeAttribute('data-peek');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );

  // The scroll: one passive listener, one rAF per burst.
  useEffect(() => {
    if (!enabled) return undefined;
    const parts = partsOf(headingRef.current);
    if (parts === null) return undefined;
    const { body, panel } = parts;
    let frame: number | null = null;
    let scheduled = false;
    let lastTop = body.scrollTop;
    const run = (): void => {
      scheduled = false;
      applyProgress();
    };
    const onScroll = (): void => {
      if (body.scrollTop !== lastTop) {
        lastTop = body.scrollTop;
        // ANY scroll collapses an open overlay.
        if (peekRef.current !== null) closePeek();
      }
      if (!scheduled) {
        scheduled = true;
        frame = requestAnimationFrame(run);
      }
    };
    body.addEventListener('scroll', onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      let width = panel.clientWidth;
      observer = new ResizeObserver(() => {
        if (panel.clientWidth === width) return;
        width = panel.clientWidth;
        measure();
      });
      observer.observe(panel);
    }
    applyProgress();
    return () => {
      body.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  // `layoutKey` re-runs it once the read lands: while the sheet is a "Loading…" there is no heading yet.
  }, [enabled, layoutKey, headingRef, applyProgress, closePeek, measure]);

  // An overlay closes on an outside tap and on Escape. Capture phase: `Sheet`'s own document Escape
  // listener honours `defaultPrevented`, so this one runs first and consumes the key.
  useEffect(() => {
    if (peek === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePeek();
    };
    const onPointer = (event: Event): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('.gn-sheet__peek, [data-peek-opener]') !== null) return;
      // The title overlay exists to bring Move back: pressing Move is not an outside tap. Closing here would turn Move
      // inert (`moveInert`) before the click that follows the press lands, so a finger or a mouse could never use it.
      // The overlay stays open under the Move dialog (so focus returns to a live Move); it is not an opener, so the
      // press never opens or toggles anything.
      if (peekRef.current?.kind === 'title' && target instanceof Element && target.closest('.gn-sheet__move') !== null) return;
      closePeek();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [peek === null, closePeek]); // eslint-disable-line react-hooks/exhaustive-deps

  // The overlay kind on the panel (CSS places Move beside the full title while it is open) and the
  // collapsed middle crumbs, which are out of the tab order while compact.
  useLayoutEffect(() => {
    const parts = partsOf(headingRef.current);
    if (parts === null) return;
    if (peek === null) {
      parts.panel.removeAttribute('data-peek');
      parts.panel.removeAttribute('data-peek-state');
    } else {
      parts.panel.setAttribute('data-peek', peek.kind);
      parts.panel.setAttribute('data-peek-state', peek.closing ? 'closing' : 'open');
    }
    parts.nav?.querySelectorAll<HTMLElement>('[data-collapsed]').forEach((item) => {
      if (enabled && mode === 'compact') item.setAttribute('inert', '');
      else item.removeAttribute('inert');
    });
  }, [peek, enabled, mode, folded, layoutKey, headingRef]);

  // Back at the top of the sheet with an overlay open (only possible by another route): close it.
  useEffect(() => {
    if (mode === 'full' && peekRef.current !== null) closePeek();
  }, [mode, closePeek]);

  const effectiveMode = enabled ? mode : 'full';
  const titlePeekOpen = peek !== null && peek.kind === 'title' && !peek.closing;
  return {
    enabled,
    mode: effectiveMode,
    folded: enabled && folded,
    peek,
    moveInert: enabled && effectiveMode === 'compact' && !titlePeekOpen,
    togglePeek,
    closePeek,
  };
}
