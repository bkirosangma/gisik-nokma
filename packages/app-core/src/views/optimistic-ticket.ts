import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldClaim, StateCategory } from '@gisik-nokma/domain';
import type { Priority, TicketRead } from '../view-types.js';
import type { LiveQueryResult } from './use-live-query.js';

/**
 * The sheet's writes, shown the moment they are made (smoothness T7, spec S5; audit SM-03; owner D2).
 *
 * ## The overlay is view state, never data
 *
 * The same idea as `board-move-state.ts`'s `applyPendingMoves`: a pure function lays the values over the READ,
 * and nothing is written to the live query's cache, so nothing can persist after a failure. Drop the entry and
 * the sheet is back where the data says it is.
 *
 * ## The values are written onto the REAL shapes
 *
 * `TicketRead` keeps the title at its top level, the state and the assignee on `ticket`, and the priority and
 * the two dates as CLAIMS in `ticket.fields` (`{value, actorId, clientTime, serverTime}`). A dates' claim value
 * is `{date}` (or `null` for a cleared one), so the overlay carries the bare day and wraps it the way the wire
 * does; `dateClaimOf` and the sheet's priority reader then read the overlay with no second code path.
 *
 * ## No claim is invented
 *
 * An overlaid claim keeps the PREVIOUS claim's provenance (or empty strings when the field had none). The
 * overlay never names an actor or a time that nobody stamped; the sheet prints "Saving…" in place of the claim
 * line for any field in `overlaidFields`, and the real line returns when the agreeing read retires the overlay.
 */
export type TicketOverlay = {
  title?: string;
  stateId?: string;
  /** Set WITH `stateId`: the category of the state the ticket is shown in (the chip's tone, and whether Close is offered). */
  stateCategory?: StateCategory;
  assigneeId?: string | null;
  priority?: Priority;
  /** The day, `YYYY-MM-DD`, or `null` for a cleared date. */
  startDate?: string | null;
  dueDate?: string | null;
};
export type OverlayField = keyof TicketOverlay;

/**
 * How long a SETTLED overlay may wait for a read that agrees. A committed write whose read never shows the value
 * (somebody else changed the field a second later) must not mask the server's newer answer for ever.
 */
export const OVERLAY_TTL_MS = 20_000;

const CLAIM_FIELDS = ['priority', 'startDate', 'dueDate'] as const;
type ClaimField = (typeof CLAIM_FIELDS)[number];
const isClaimField = (field: OverlayField): field is ClaimField => (CLAIM_FIELDS as readonly string[]).includes(field);

/** What the wire stores for an overlay value of a claim field: a priority is the bare level, a date is `{date}` or `null`. */
function claimValueOf(field: ClaimField, value: unknown): unknown {
  if (field === 'priority') return value;
  return value === null ? null : { date: value };
}

/** The value a read holds for an overlay field, in the overlay's OWN shape (a date is its day, never the `{date}` object). */
function readValueOf(read: TicketRead, field: OverlayField): unknown {
  switch (field) {
    case 'title':
      return read.title;
    case 'stateId':
      return read.ticket.stateId;
    case 'stateCategory':
      return read.ticket.stateCategory;
    case 'assigneeId':
      return read.ticket.assigneeId;
    case 'priority':
      return read.ticket.fields['priority']?.value;
    case 'startDate':
    case 'dueDate': {
      const value = read.ticket.fields[field]?.value;
      if (value === null || value === undefined) return null;
      return typeof value === 'object' && !Array.isArray(value) ? ((value as { date?: unknown }).date ?? null) : null;
    }
  }
}

/** Whether `read` already holds `value` for `field`. Compared by VALUE: a `{date}` claim object is never `===` to anything. */
export function overlayAgrees(read: TicketRead, field: OverlayField, value: unknown): boolean {
  return readValueOf(read, field) === value;
}

const NO_PROVENANCE = { actorId: '', clientTime: '', serverTime: '' } as const;

/** The read with the overlay laid over it. The SAME object when the overlay is empty; the input is never mutated. */
export function applyOverlay(read: TicketRead, overlay: TicketOverlay): TicketRead {
  const fields = (Object.keys(overlay) as OverlayField[]).filter((field) => overlay[field] !== undefined);
  if (fields.length === 0) return read;
  let title = read.title;
  const ticket = { ...read.ticket, fields: { ...read.ticket.fields } };
  for (const field of fields) {
    const value = overlay[field];
    if (field === 'title') title = value as string;
    else if (field === 'stateId') ticket.stateId = value as string;
    else if (field === 'stateCategory') ticket.stateCategory = value as StateCategory;
    else if (field === 'assigneeId') ticket.assigneeId = value as string | null;
    else if (isClaimField(field)) {
      const previous: FieldClaim | undefined = read.ticket.fields[field];
      ticket.fields[field] = { ...(previous ?? NO_PROVENANCE), value: claimValueOf(field, value) };
    }
  }
  return { ...read, title, ticket };
}

/**
 * `begin` lays values over the read the moment the write is made; `settle` keeps them until a read AGREES (so a
 * committed value never flickers back to the old one while the reload is in flight); `drop` removes them at
 * once — the refusal arm. **Fields are independent**: one refusal never drops another field's open overlay.
 *
 * `pendingFields` is the fields whose write is unanswered; `overlaidFields` is those PLUS the settled ones still
 * waiting for their agreeing read (the claim line says "Saving…" for all of them).
 */
export function useOptimisticTicket(read: LiveQueryResult<TicketRead | null>) {
  const [overlay, setOverlay] = useState<TicketOverlay>({});
  const [pending, setPending] = useState<ReadonlySet<OverlayField>>(new Set());
  const [settledAt, setSettledAt] = useState<Readonly<Partial<Record<OverlayField, number>>>>({});
  const data = read.data;

  const retire = useCallback((fields: readonly OverlayField[]) => {
    setOverlay((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
    setSettledAt((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }, []);

  // Retire every SETTLED field the read now agrees with. Keyed on the read AND on the settle itself: a stream
  // refetch can land before the write's answer does, and that agreeing read must retire the overlay at settle.
  useEffect(() => {
    if (data === null) return;
    const now = Date.now();
    const done = (Object.keys(settledAt) as OverlayField[]).filter(
      (field) => overlay[field] === undefined || overlayAgrees(data, field, overlay[field]) || now - (settledAt[field] ?? now) >= OVERLAY_TTL_MS,
    );
    if (done.length > 0) retire(done);
  }, [data, overlay, settledAt, retire]);

  // A settled overlay no read confirms expires: wake exactly when the earliest one does.
  useEffect(() => {
    const times = Object.values(settledAt).filter((at): at is number => at !== undefined);
    if (times.length === 0) return;
    const wait = Math.max(0, Math.min(...times) + OVERLAY_TTL_MS - Date.now());
    const timer = setTimeout(() => {
      const now = Date.now();
      retire((Object.keys(settledAt) as OverlayField[]).filter((field) => now - (settledAt[field] ?? now) >= OVERLAY_TTL_MS));
    }, wait);
    return () => clearTimeout(timer);
  }, [settledAt, retire]);

  const begin = useCallback((patch: TicketOverlay) => {
    const fields = (Object.keys(patch) as OverlayField[]).filter((field) => patch[field] !== undefined);
    setOverlay((current) => ({ ...current, ...patch }));
    setPending((current) => new Set([...current, ...fields]));
    // A field written again while its last write waits for a read starts over: it is pending, not settled.
    setSettledAt((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }, []);

  const settle = useCallback((...fields: OverlayField[]) => {
    setPending((current) => {
      const next = new Set(current);
      for (const field of fields) next.delete(field);
      return next;
    });
    setSettledAt((current) => {
      const next = { ...current };
      const now = Date.now();
      for (const field of fields) next[field] = now;
      return next;
    });
  }, []);

  const drop = useCallback(
    (...fields: OverlayField[]) => {
      retire(fields);
      setPending((current) => {
        const next = new Set(current);
        for (const field of fields) next.delete(field);
        return next;
      });
    },
    [retire],
  );

  const ticket = useMemo(() => (data === null ? null : applyOverlay(data, overlay)), [data, overlay]);
  const overlaidFields = useMemo<ReadonlySet<OverlayField>>(
    () => new Set((Object.keys(overlay) as OverlayField[]).filter((field) => overlay[field] !== undefined)),
    [overlay],
  );
  return { ticket, begin, settle, drop, pendingFields: pending, overlaidFields };
}
