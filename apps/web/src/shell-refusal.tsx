'use client';

/**
 * What this shell puts on screen when a read REFUSES.
 *
 * ## Why this component exists, and why the plan has no line for it
 *
 * **⚠ CORRECTED 2026-09-20.** This read *"FOUR of the THIRTEEN `DataSourceQuery`
 * methods throw a `ServingGapError` rather than invent a fact — `getMyWorkspaces`,
 * `search`, `getMyWork` and `getAttention`. It was six: `getTickets` and
 * `getTicket` refused too until ruling P25 clause 1 served their gaps…"*. **The
 * number is now ZERO** — it fell 6 → 4 (ruling P25 clause 1, `c86c4b5c`,
 * 2026-09-06) → 3 (P32/P38) → 1 (P39/P40) → 0 when `search` was served on
 * 2026-09-19, and `SERVING_GAPS` is empty — so NO read in this shell refuses for
 * a serving reason. **This component is not narrower for it, and that half was
 * true all along:** a read that ANSWERS can still fail (a transport error, a 404
 * turned back into an exception, a `MappingError`), and every such failure lands
 * here for the same reason. Every refusing read is called by a page in this
 * shell, and the plan text (written before those refusals existed) renders each
 * of them as `data === null ? <p>Loading…</p> : …`, or, for the attention
 * strip, as `items={attention.data ?? []}`. Both of those are false claims:
 *
 * - a spinner that never stops says "the answer is coming"; it is not;
 * - `AttentionStrip` returns `null` for an empty list, so `?? []` renders a
 *   page with no strip at all — indistinguishable from "nothing needs your
 *   attention", which is exactly the invented fact the refusals exist to
 *   prevent.
 *
 * So every read in this shell checks `error` BEFORE it checks `data`, and shows
 * this. `message` is the authority's own words carried without paraphrase — the
 * `ServingGapError` enumerates each missing field, why the shipped route does
 * not serve it, and which plan owns closing it — because a refusal restated in
 * the shell's voice is the shell making a claim about someone else's code.
 *
 * `what` names the read that refused, because the message alone does not say
 * which part of the page went missing.
 */
export function ShellRefusal({ what, message }: { what: string; message: string }) {
  return (
    <p role="status" className="gn-shell__refusal">
      <span className="gn-shell__refusal-what">{what} cannot be shown yet.</span>
      {message}
    </p>
  );
}
