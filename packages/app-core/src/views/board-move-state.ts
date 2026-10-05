import { createContext, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { BoardCard, BoardColumn, BoardGroup, BoardView, Priority } from '../view-types.js';

/**
 * Optimistic board moves (owner, 2026-10-01) — the state a move keeps while its write is in flight.
 *
 * ## Why this lives in `Board` and not in the card
 *
 * A card that moves is a DIFFERENT `<li>` in a different column's `<ul>`: React unmounts the one and
 * mounts the other. Everything a move accumulates — the dialog it opened, the refusal it earned, the
 * `submitting` latch that stops a double submit — used to live in `MoveArrows`, inside that card, and
 * would have died with it the instant the card was shown in its target. So the lifecycle is held HERE,
 * keyed by ticket id, and the card only renders it.
 *
 * ## The overlay is view state, never data
 *
 * `applyPendingMoves` is a pure function over the board view. Nothing is written to the live query's
 * cache, so nothing can persist after a failure: drop the entry and the card is back where the data says it is.
 */

/**
 * `awaiting` — a required comment/field is being asked for in the dialog (the card waits, faded).
 * `writing` — the ingest is in flight. `committed` — the server said yes; the entry stays until a read AGREES.
 */
export type PendingPhase = 'awaiting' | 'writing' | 'committed';

export type PendingMove = {
  ticketId: string;
  workflowId: string;
  /** Where the data says the card is. The transition dialog and `moveOutcome` are asked from HERE, not from the column the card is drawn in. */
  fromStateId: string;
  toStateId: string;
  phase: PendingPhase;
  /** `Date.now()` when the server committed; the clock `retireAgreed`'s TTL reads. */
  settledAt?: number;
  /**
   * A CLOSE, not a move (smoothness T7; spec `:66`: "optimistic through `beginPending` with the card dimmed"). The
   * card sits in a terminal column and closing it takes it off the board (the server's `getBoard` excludes closed
   * tickets, spec §3.2), so the overlay never relocates it: while the write is open (`awaiting` / `writing`) the card
   * STAYS where it is and the slot dims it (`BoardCardSlot`); once the server has committed (`committed`) the overlay
   * HIDES it, and the entry retires when the read no longer holds the card (or after the TTL). A refusal drops the
   * entry, which undims the card. `toStateId` is the card's own state, so nothing that reads it as a target sees a move.
   */
  closes?: true;
};

export type PendingMoves = Readonly<Record<string, PendingMove>>;

/**
 * How long a COMMITTED entry may wait for a read that agrees. A committed move whose read never shows the
 * card in the target (someone moved it on, the ticket left the filtered view) must not pin the card forever.
 */
export const PENDING_TTL_MS = 20_000;

/**
 * Where a card WILL sit once it lands in `cards` (a target column's cards, not
 * containing it): the number of cards ahead of it. A board column is ordered by
 * `ticket_id`, text order — the server read (`apps/server/src/routes/board.ts:120`,
 * `ORDER BY t.ticket_id`), the offline replica's enumeration
 * (`packages/sync-client/src/replica/replica.ts:1883`, `ORDER BY ticket_id`,
 * pushed into columns in that order at `replica-data-source.ts:1659`) and the
 * client mapper (`online/mappers.ts:718`, `.map` — order kept) all agree, and the
 * board renders `column.cards` as given, so a live-query repaint after the move
 * puts the card exactly here. The optimistic overlay (`applyPendingMoves`) uses THIS
 * function, so the slot the drop placeholder showed, the slot the card is drawn in
 * while its write is open, and the slot the refetch puts it in are one slot. A ticket's entity id must match `ULID_REGEX`
 * (`packages/domain/src/envelope.ts:120`, pattern at `ids.ts:9`) — 26 characters
 * of `[0-9A-Z]` — so JS `<` gives the same order as Postgres's default collation
 * (`ticket_id text`, `proj-tickets.sql:74`, no `COLLATE`) and SQLite's binary
 * one. NOT arrival order and NOT age: a card created earlier lands ABOVE a
 * later one because its id sorts first.
 */
export function landingIndex(cards: readonly BoardCard[], ticketId: string): number {
  const ahead = cards.findIndex((card) => card.ticketId > ticketId);
  return ahead === -1 ? cards.length : ahead;
}

/**
 * The view with every pending move laid over it. An entry is ignored (not an error) when its ticket is not
 * in the view, its target column is not in that ticket's group, or the card already sits in its target —
 * in all three there is nothing to lay over. Returns the SAME `view` when nothing applies.
 */
export function applyPendingMoves(view: BoardView, pending: PendingMoves): BoardView {
  const entries = Object.values(pending);
  if (entries.length === 0) return view;
  let groups: BoardGroup[] | null = null;
  for (const entry of entries) {
    const current: BoardGroup[] = groups ?? view.groups;
    const groupIndex = current.findIndex(
      (group) =>
        group.workflowId === entry.workflowId &&
        group.columns.some((column) => column.cards.some((candidate) => candidate.ticketId === entry.ticketId)),
    );
    if (groupIndex === -1) continue;
    const group = current[groupIndex]!;
    const source = group.columns.find((column) => column.cards.some((candidate) => candidate.ticketId === entry.ticketId))!;
    if (entry.closes === true) {
      // Open: the card stays, dimmed by its slot. Only a COMMITTED close takes it off the board.
      if (entry.phase !== 'committed') continue;
      const columns = group.columns.map(
        (column): BoardColumn =>
          column.stateId === source.stateId
            ? { ...column, cards: column.cards.filter((candidate) => candidate.ticketId !== entry.ticketId) }
            : column,
      );
      const next = [...current];
      next[groupIndex] = { ...group, columns };
      groups = next;
      continue;
    }
    const target = group.columns.find((column) => column.stateId === entry.toStateId);
    if (target === undefined || target.stateId === source.stateId) continue;
    const moved = source.cards.find((candidate) => candidate.ticketId === entry.ticketId)!;
    const columns = group.columns.map((column): BoardColumn => {
      if (column.stateId === source.stateId) {
        return { ...column, cards: column.cards.filter((candidate) => candidate.ticketId !== entry.ticketId) };
      }
      if (column.stateId === target.stateId) {
        const cards = [...column.cards];
        cards.splice(landingIndex(cards, entry.ticketId), 0, moved);
        return { ...column, cards };
      }
      return column;
    });
    const next = [...current];
    next[groupIndex] = { ...group, columns };
    groups = next;
  }
  return groups === null ? view : { ...view, groups };
}

/**
 * The entries still worth keeping after `view` (the REAL read) arrived. An entry is retired when the read
 * shows its card in the target state — and ONLY then (or, for a committed entry, after the TTL). A read
 * that merely arrived and still shows the old state retires nothing: that is the stale refetch that would
 * otherwise flash the card back to its source. Returns the SAME `pending` when nothing retires.
 */
export function retireAgreed(view: BoardView, pending: PendingMoves, now: number, ttlMs: number = PENDING_TTL_MS): PendingMoves {
  let kept: Record<string, PendingMove> | null = null;
  for (const entry of Object.values(pending)) {
    const stateNow = view.groups
      .filter((group) => group.workflowId === entry.workflowId)
      .flatMap((group) => group.columns)
      .find((column) => column.cards.some((candidate) => candidate.ticketId === entry.ticketId))?.stateId;
    // A close agrees when the read no longer holds the card at all; a move, when it shows the card in its target.
    const agreed = entry.closes === true ? stateNow === undefined : stateNow === entry.toStateId;
    const expired = entry.phase === 'committed' && entry.settledAt !== undefined && now - entry.settledAt >= ttlMs;
    if (agreed || expired) {
      kept ??= { ...pending };
      delete kept[entry.ticketId];
    }
  }
  return kept ?? pending;
}

/**
 * A ticket whose `ticket.created` is in flight (smoothness T7, spec S5, audit SM-03): drawn on the board at once as
 * a dimmed ghost card, with the key `…` (the real key is composed by the server), at the END of its state's column.
 * The page holds the list; an entry retires when the read shows the id (`applyPendingCreates` ignores it then) or
 * when the write is refused. `priority` is the level the person chose in the dialog, so the ghost's badge says
 * what they asked for; the ghost has no assignee, no provenance and no arrows.
 */
export type PendingCreate = { ticketId: string; workflowId: string; stateId: string; title: string; typeId: string; priority: Priority };

const GHOST_KEY = '…';

function ghostCard(create: PendingCreate): BoardCard {
  const none = { actorId: '', actorName: null, clientTime: '', serverTime: '' };
  return {
    ticketId: create.ticketId,
    title: create.title,
    typeId: create.typeId,
    assignee: null,
    stateProvenance: none,
    cause: null,
    rollup: null,
    dueDate: null,
    priority: { value: create.priority, claim: none },
    key: GHOST_KEY,
    pending: false,
    parent: null,
    epic: null,
    pendingCreate: true,
  };
}

/**
 * The view with every in-flight create laid over it. An entry is ignored (not an error) when its workflow is not
 * drawn, its column is not in that group, or the read ALREADY shows the ticket (it landed: the real card wins).
 * Returns the SAME `view` when nothing applies.
 */
export function applyPendingCreates(view: BoardView, creates: readonly PendingCreate[]): BoardView {
  if (creates.length === 0) return view;
  let changed = false;
  const groups = view.groups.map((group) => {
    const mine = creates.filter(
      (create) =>
        create.workflowId === group.workflowId &&
        !view.groups.some((other) => other.columns.some((column) => column.cards.some((card) => card.ticketId === create.ticketId))),
    );
    if (mine.length === 0) return group;
    let touched = false;
    const columns = group.columns.map((column): BoardColumn => {
      const here = mine.filter((create) => create.stateId === column.stateId);
      if (here.length === 0) return column;
      touched = true;
      return { ...column, cards: [...column.cards, ...here.map(ghostCard)] };
    });
    if (!touched) return group;
    changed = true;
    return { ...group, columns };
  });
  return changed ? { ...view, groups } : view;
}

/** How long a COMMITTED create may wait for a read that shows its id before its ghost is withdrawn (`PENDING_TTL_MS`'s sibling). */
export const CREATE_TTL_MS = 20_000;

type HeldCreate = PendingCreate & { settledAt?: number };

/**
 * The shell's list of creates in flight. `add` when the write goes out, `settle` when the server commits it (the
 * ghost stays until a read SHOWS the id, so the card never blinks out between the answer and the reload),
 * `remove` when it is refused. `realView` is the UN-narrowed read: an entry retires when it holds the id, and a
 * committed entry the read never shows (the ticket sits behind a filter the shell applies, or someone moved it
 * out of sight) is withdrawn after `CREATE_TTL_MS` so a ghost can never outlive its write.
 */
export function usePendingCreates(realView: BoardView | null) {
  const [held, setHeld] = useState<readonly HeldCreate[]>([]);

  const add = useCallback((create: PendingCreate) => {
    setHeld((current) => [...current.filter((entry) => entry.ticketId !== create.ticketId), create]);
  }, []);
  const settle = useCallback((ticketId: string) => {
    setHeld((current) => current.map((entry) => (entry.ticketId === ticketId ? { ...entry, settledAt: Date.now() } : entry)));
  }, []);
  const remove = useCallback((ticketId: string) => {
    setHeld((current) => (current.some((entry) => entry.ticketId === ticketId) ? current.filter((entry) => entry.ticketId !== ticketId) : current));
  }, []);

  useEffect(() => {
    if (realView === null) return;
    const shown = new Set(realView.groups.flatMap((group) => group.columns.flatMap((column) => column.cards.map((card) => card.ticketId))));
    setHeld((current) => (current.some((entry) => shown.has(entry.ticketId)) ? current.filter((entry) => !shown.has(entry.ticketId)) : current));
  }, [realView]);

  useEffect(() => {
    const settled = held.flatMap((entry) => (entry.settledAt === undefined ? [] : [entry.settledAt]));
    if (settled.length === 0) return;
    const wait = Math.max(0, Math.min(...settled) + CREATE_TTL_MS - Date.now());
    const timer = setTimeout(() => {
      const now = Date.now();
      setHeld((current) => current.filter((entry) => entry.settledAt === undefined || now - entry.settledAt < CREATE_TTL_MS));
    }, wait);
    return () => clearTimeout(timer);
  }, [held]);

  return { creates: held as readonly PendingCreate[], add, settle, remove };
}

/** What one card's move has accumulated while it is (or was) being attempted — formerly `MoveArrows`' own state. */
export type MoveSession = {
  refusal: { available: string[] } | null;
  serverRefusal: { rule: string; reason: string } | null;
  transportError: string | null;
  dialog: { offer: string[]; preselect: string | null; markRules?: boolean } | null;
  submitting: boolean;
  /** How the attempt began; a DROP's refusal scrolls itself into view, an arrow's does not. */
  source: 'arrow' | 'drop';
};

export const EMPTY_SESSION: MoveSession = {
  refusal: null,
  serverRefusal: null,
  transportError: null,
  dialog: null,
  submitting: false,
  source: 'arrow',
};

/** Where a card flies FROM (its top-left corner, viewport coordinates); `at` is when it was taken, so a flight nobody claimed goes stale. */
export type FlightRect = {
  left: number;
  top: number;
  at: number;
  /**
   * Set on a card that does NOT change column but is shifted by one that does (a card below a mover in its source
   * column, closing the gap — or reopening it on a refusal). Such a card is already mounted, so it claims its
   * flight after the render that moved it (not at mount) and never scrolls itself into view. The cards of the TARGET
   * column below the landing slot are siblings too: noted at the start of an arrow move, and at the release of either gesture.
   */
  sibling?: true;
};

/** Where the pointer grabbed the dragged card — lets the drop point be turned back into a card rectangle. */
export type Grab = { ticketId: string; offsetX: number; offsetY: number };

export type MoveState = {
  sessions: Readonly<Record<string, MoveSession>>;
  pending: PendingMoves;
  patchSession: (ticketId: string, patch: Partial<MoveSession>) => void;
  /** The session as of the latest render — for an async continuation, whose own closure is from when the write began. */
  sessionOf: (ticketId: string) => MoveSession;
  /**
   * Lays a move over the board. `from` is the flight's start (the drop point); when absent the card's own slot is measured.
   * `byArrow` marks a move that no drop placeholder prepared: the target column's cards below the landing slot glide down
   * (a drag's placeholder had opened it). A release (refusal, Cancel) glides them back up for either.
   */
  beginPending: (move: PendingMove, from?: FlightRect, byArrow?: boolean) => void;
  setPhase: (ticketId: string, phase: PendingPhase) => void;
  /** Releases the overlay: the card glides back from where it is drawn now. */
  dropPending: (ticketId: string) => void;
  /** Every mounted card slot, for measuring where a card is right now. */
  slots: MutableRefObject<Map<string, HTMLElement>>;
  /** Flights waiting for their card to mount in its new column. */
  flights: MutableRefObject<Map<string, FlightRect>>;
  grab: MutableRefObject<Grab | null>;
};

export const MoveStateContext = createContext<MoveState | null>(null);

/**
 * The move lifecycle for ONE board. Call it unconditionally (Rule of Hooks) and lay `pending` over the
 * incoming view; `realView` is the un-overlaid read the retirement rule is asked against.
 */
export function useMoveState(realView: BoardView): MoveState {
  const [sessions, setSessions] = useState<Record<string, MoveSession>>({});
  const [pending, setPending] = useState<PendingMoves>({});
  const slots = useRef(new Map<string, HTMLElement>());
  const flights = useRef(new Map<string, FlightRect>());
  const grab = useRef<Grab | null>(null);
  // The list (a column's `<ul>`) each pending card was taken from: its other cards are what glide when the gap closes or reopens.
  const sourceLists = useRef(new Map<string, Element>());
  // The target column (a `<section>`) of a move: its cards below the landing slot glide back up when the move is released (and, for an arrow, down when it begins).
  const targetSections = useRef(new Map<string, Element>());

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const sessionOf = useCallback((ticketId: string): MoveSession => sessionsRef.current[ticketId] ?? EMPTY_SESSION, []);

  const patchSession = useCallback((ticketId: string, patch: Partial<MoveSession>) => {
    setSessions((current) => ({ ...current, [ticketId]: { ...(current[ticketId] ?? EMPTY_SESSION), ...patch } }));
  }, []);

  // The latest entries, readable from a callback without making it a new function every render.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const beginPending = useCallback((move: PendingMove, from?: FlightRect, byArrow = false) => {
    // A flight exists only for a card that is about to CHANGE COLUMN. Re-asserting an entry that already
    // shows the card in this target (a dialog confirming) must not leave a flight behind for its next mount.
    if (pendingRef.current[move.ticketId]?.toStateId !== move.toStateId) {
      const start = from ?? rectOf(slots.current.get(move.ticketId));
      if (start !== undefined) flights.current.set(move.ticketId, start);
      // The cards BELOW it in the source column close the gap: note where each is drawn now.
      const source = slots.current.get(move.ticketId);
      const list = source?.parentElement;
      if (source !== undefined && list != null) {
        sourceLists.current.set(move.ticketId, list);
        recordSiblings(slots.current, flights.current, list, move.ticketId, source);
      }
      // The target column is remembered for BOTH gestures, so a release can close its slot smoothly. Only an ARROW move
      // notes the cards below the landing slot now: a drag's drop placeholder had already opened it.
      const section = source !== undefined && move.closes !== true ? targetSectionOf(source, move.toStateId) : null;
      if (section !== null) {
        targetSections.current.set(move.ticketId, section);
        if (byArrow) recordBelow(slots.current, flights.current, section, move.ticketId);
      }
    }
    setPending((current) => ({ ...current, [move.ticketId]: move }));
  }, []);

  const setPhase = useCallback((ticketId: string, phase: PendingPhase) => {
    // A committed move is never glided back: its source list is no longer needed.
    if (phase === 'committed') {
      sourceLists.current.delete(ticketId);
      targetSections.current.delete(ticketId);
    }
    setPending((current) => {
      const entry = current[ticketId];
      if (entry === undefined) return current;
      return { ...current, [ticketId]: { ...entry, phase, ...(phase === 'committed' ? { settledAt: Date.now() } : {}) } };
    });
  }, []);

  const dropPending = useCallback((ticketId: string) => {
    // Only a card that is actually drawn in its target has anywhere to glide back from.
    if (pendingRef.current[ticketId] !== undefined) {
      const start = rectOf(slots.current.get(ticketId));
      if (start !== undefined) flights.current.set(ticketId, start);
      // The source column's cards (closed over the gap) slide back down to reopen the slot.
      const list = sourceLists.current.get(ticketId);
      if (list !== undefined && list.isConnected) recordSiblings(slots.current, flights.current, list, ticketId);
      // …and the target column's cards below the slot close it again.
      const section = targetSections.current.get(ticketId);
      if (section !== undefined && section.isConnected) recordBelow(slots.current, flights.current, section, ticketId);
    }
    sourceLists.current.delete(ticketId);
    targetSections.current.delete(ticketId);
    setPending((current) => {
      if (current[ticketId] === undefined) return current;
      const next = { ...current };
      delete next[ticketId];
      return next;
    });
  }, []);

  // Retire what the real read now confirms. Keyed on the read itself: a new read is the only thing that can agree.
  useEffect(() => {
    setPending((current) => retireAgreed(realView, current, Date.now()));
  }, [realView]);

  // A committed entry the read never confirms expires: wake exactly when the earliest one does.
  useEffect(() => {
    const settled = Object.values(pending).flatMap((entry) =>
      entry.phase === 'committed' && entry.settledAt !== undefined ? [entry.settledAt] : [],
    );
    if (settled.length === 0) return;
    const wait = Math.max(0, Math.min(...settled) + PENDING_TTL_MS - Date.now());
    const timer = setTimeout(() => setPending((current) => retireAgreed(realView, current, Date.now())), wait);
    return () => clearTimeout(timer);
  }, [pending, realView]);

  return useMemo(
    () => ({ sessions, pending, patchSession, sessionOf, beginPending, setPhase, dropPending, slots, flights, grab }),
    [sessions, pending, patchSession, sessionOf, beginPending, setPhase, dropPending],
  );
}

function rectOf(element: HTMLElement | undefined): FlightRect | undefined {
  if (element === undefined) return undefined;
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, at: Date.now() };
}

/**
 * Note where the cards of `list` other than `ticketId` are drawn now, as sibling flights. With `after` given only
 * the cards FOLLOWING that element are noted (the ones below a card that is leaving); without it, every card is,
 * and the ones that did not move are dropped by the claim (a displacement under a pixel flies nowhere).
 */
function recordSiblings(
  slots: Map<string, HTMLElement>,
  flights: Map<string, FlightRect>,
  list: Element,
  ticketId: string,
  after?: Element,
): void {
  for (const [id, element] of slots) {
    if (id === ticketId || element.parentElement !== list) continue;
    if (after !== undefined && !(after.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const start = rectOf(element);
    if (start !== undefined) flights.set(id, { ...start, sibling: true });
  }
}

/** The column `<section>` for `toStateId` beside the one `source` sits in (one group's columns share a rail), or null when it is not drawn. */
function targetSectionOf(source: Element, toStateId: string): Element | null {
  const rail = source.closest('[data-testid^="board-column-"]')?.parentElement;
  if (rail == null) return null;
  return [...rail.children].find((child) => child.getAttribute('data-testid') === `board-column-${toStateId}`) ?? null;
}

/**
 * Note where the cards of the column `section` that sort AFTER `ticketId` are drawn now, as sibling flights: a column is
 * ordered by ticket id (`landingIndex`), so those are exactly the cards below the mover's landing slot.
 */
function recordBelow(slots: Map<string, HTMLElement>, flights: Map<string, FlightRect>, section: Element, ticketId: string): void {
  for (const [id, element] of slots) {
    if (id <= ticketId || !section.contains(element)) continue;
    const start = rectOf(element);
    if (start !== undefined) flights.set(id, { ...start, sibling: true });
  }
}
