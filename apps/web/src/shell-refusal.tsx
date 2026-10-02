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
 * 2026-09-19, and `SERVING_GAPS` is empty.
 *
 * **⚠ AND THAT EMPTINESS IS NOT WHAT THIS SENTENCE USED TO SAY IT WAS (E2-54).**
 * It read: *"`SERVING_GAPS` is empty — so NO read in this shell refuses for a
 * serving reason."* The register's own docblock denies exactly that inference
 * (`online/mappers.ts`, beside the record: *"This record being empty is NOT a
 * claim that no read is missing: it means no mapper in this file refuses
 * outright."*), and the denial is not academic — `online/online-data-source.ts`
 * still refuses for a serving reason, conditionally: its `getTickets` throws
 * `ServingGapError('getTickets', [LIST_TOO_LARGE_ABSENCE])` when a cursor is still
 * outstanding past the pages this client will fetch. So what the register
 * establishes is narrower and is what is claimed here now: **no read refuses
 * OUTRIGHT.** A read can still refuse conditionally, and such a refusal reaches
 * this component like any other.
 *
 * The paragraph below is the half this file can actually support, and it never
 * depended on the register at all: **a read that ANSWERS can still fail** — a
 * transport error, a 404 turned back into an exception, a `MappingError` — and
 * every such failure lands here for the same reason. Every refusing read is
 * called by a page in this
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
/**
 * What the panel SAYS, for a read that would not answer.
 *
 * **⚠ IT READ `"{what} cannot be shown yet."` UNTIL 2026-09-21 (E5-30)**, with
 * the transport's raw string spliced straight after it. That sentence reported
 * the failure and stopped: it never said a RELOAD is the way out, which is the
 * one thing a person looking at this panel can actually do, and the string it
 * carried is a status code addressed to somebody who cannot act on one.
 *
 * It names the action now — *"reload to try again"* — which is the same advice the
 * sibling load-error sentences in `packages/app-core` already give
 * (`Could not load workflows. Reload to try again.`). Hoisted to a function so a
 * caller's spec asserts the string that RENDERS rather than re-typing it.
 */
export function shellRefusalCopy(what: string): string {
  return `${what} could not be loaded. Reload to try again.`;
}

export function ShellRefusal({ what, message }: { what: string; message: string }) {
  return (
    <p role="status" className="gn-shell__refusal">
      <span className="gn-shell__refusal-what">{shellRefusalCopy(what)}</span>
      {/* The wire string on its OWN LINE, in its own element — `LiveQueryResult.
          error`, the stringified cause. It is the authority's own words and is
          carried without paraphrase; what changed (E5-30, 2026-09-21) is that it
          is no longer spliced into a sentence designed to be read, because
          "… cannot be shown yet. HTTP 500 for /v1/me/notifications" is a status
          code addressed to a person who cannot act on one. `expired-session.tsx`
          routes the 401 arm elsewhere, deliberately untouched. */}
      <span className="gn-shell__refusal-wire">{message}</span>
    </p>
  );
}
