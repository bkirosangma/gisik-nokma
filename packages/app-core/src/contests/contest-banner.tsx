import { IST_CLOCK_NOTE, renderContestedClaimText } from '@gisik-nokma/domain';
import type { ContestLike, ResolveContestInput } from './contest-view-model.js';

/**
 * The ticket banner: every open contested claim, verbatim — what was claimed,
 * by whom, when, which rule now refuses it — with the three resolutions.
 * BEM classes under the package's `gn-` prefix; every colour comes from
 * `packages/ui`'s token variables (amendment 11), never from this file.
 *
 * The "when" is India time, because `renderContestedClaimText` formats it there
 * through `formatIstInstant` (owner decision 2026-08-20) — the same date the
 * calendar, the timeline and the inbox give the same instant. `IST_CLOCK_NOTE`
 * says so out loud, since a collaborator working from another timezone is
 * reading their own action rendered in IST: the same instant, correctly
 * labelled, and labelled is the part that makes it honest rather than
 * confusing.
 *
 * The banner is DUMB by construction — it holds no state, builds no envelope
 * and calls nothing but its two props. "Redo legally" calls `onRedo`, never
 * `onResolve`, because a redo needs a FRESH envelope and `resolveContest`
 * throws when handed the contested claim back as `replacementEvent`. The host
 * opens its edit affordance seeded from `contest.originalEvent`, builds a new
 * envelope with `newSubmittedEvent`, and only then resolves.
 */
export function ContestBanner(props: {
  contests: ContestLike[];
  onResolve(contest: ContestLike, input: ResolveContestInput): void;
  onRedo(contest: ContestLike): void;
}) {
  const open = props.contests.filter((c) => !c.resolved);
  if (open.length === 0) return null;
  return (
    <div className="gn-contest-banner" role="alert">
      {open.map((c) => (
        <div className="gn-contest-banner__item" key={c.contestedEventId}>
          <p className="gn-contest-banner__claim" title={IST_CLOCK_NOTE}>
            {renderContestedClaimText({ originalEvent: c.originalEvent, rule: c.rule, reason: c.reason })}
          </p>
          <div className="gn-contest-banner__actions">
            <button
              className="gn-contest-banner__action"
              type="button"
              onClick={() => props.onRedo(c)}
            >
              Redo legally
            </button>
            <button
              className="gn-contest-banner__action"
              type="button"
              onClick={() => props.onResolve(c, { resolution: 'converted-to-comment' })}
            >
              Convert to comment
            </button>
            <button
              className="gn-contest-banner__action gn-contest-banner__action--discard"
              type="button"
              onClick={() => props.onResolve(c, { resolution: 'discarded' })}
            >
              Discard
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
