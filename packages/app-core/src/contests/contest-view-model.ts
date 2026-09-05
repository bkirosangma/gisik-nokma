import {
  newSubmittedEvent,
  plainTextToDoc,
  renderContestedClaimText,
  type Origin,
  type SubmittedEvent,
} from '@gisik-nokma/domain';

/**
 * A contested claim, as the banner and the resolutions need it.
 *
 * ## This is NOT `ContestedClaim` (`../view-types.ts:165`), and the names are close enough to hurt
 *
 * `ContestedClaim` is the `MyWorkView` ROW — `{ ticketId, title, rule, reason,
 * claim }` — a rendered summary for the my-work list, carrying a title and a
 * `ClaimProvenance` and no envelope at all. `ContestLike` is the RESOLUTION
 * input: it carries the original `SubmittedEvent` verbatim, because every one
 * of the three resolutions needs the envelope itself (the comment quotes it,
 * the redo must be proved not to reuse its id, the discard names it).
 *
 * It is declared structurally here rather than imported from
 * `@gisik-nokma/sync-client` on purpose (Plan 10 Task 13's Interfaces block):
 * app-core states the minimum shape it needs, which keeps these functions
 * usable against the ONLINE `DataSource` too, not only the replica.
 */
export type ContestLike = {
  contestedEventId: string;
  ticketId: string;
  claimantId: string;
  rule: string;
  reason: string;
  originalEvent: SubmittedEvent;
  contestedAt: string;
  resolved: boolean;
  resolution: string | null;
};

/**
 * The door, structurally.
 *
 * Deliberately not `DataSource['ingest']`: that would bind these functions to
 * the online result union, and the replica's `ingest` answers
 * `LocalIngestResult` (`../replica/replica-data-source.ts:96`) — `IngestResult`
 * plus a `pending` arm. Both satisfy this shape; neither is imported. Verified
 * assignable with a real `tsc` probe rather than by reading the types, because
 * `& Record<string, unknown>` turns on implicit index signatures and every test
 * in this file passes a `vi.fn()`, which could not have detected a failure.
 */
export type IngestFn = (
  events: SubmittedEvent[],
) => Promise<Array<{ status: string; eventId: string | null } & Record<string, unknown>>>;

export type ResolveContestInput =
  | { resolution: 'discarded'; note?: string }
  | { resolution: 'converted-to-comment' }
  | { resolution: 'redone'; replacementEvent: SubmittedEvent };

/**
 * The three human resolutions (spec §5). Each is events, in one ordered ingest
 * call: nothing here mutates anything — it appends attributed claims, and a
 * refusal comes back named instead of being swallowed.
 *
 * ## What `ok: true` means, and the one thing it is NOT
 *
 * `ok: true` is "no arm of the answer refused it". Against the ONLINE source
 * that is the server's acceptance. Against the REPLICA source it is not
 * reached at all: `createReplicaDataSource(...).ingest` THROWS
 * `OfflineAcceptError` for a queued claim rather than returning a fourth
 * status, and its own docblock gives the reason — every arm of `IngestResult`
 * is false of a claim in transit, `committed` most dangerously so.
 *
 * That throw is deliberately NOT caught here. Catching it and answering
 * `ok: true` would put "the server accepted your discard" on screen for a
 * discard the server has never seen, which is the exact laundering the replica
 * refuses to do one layer down. The caller renders "queued" from the thrown
 * error's own `queuedEventIds`; `test/contests.test.tsx` pins the propagation.
 */
export async function resolveContest(
  ingest: IngestFn,
  contest: ContestLike,
  input: ResolveContestInput,
  actor: { userId: string; origin: Origin },
): Promise<{ ok: boolean; refused?: { rule: string; reason: string } }> {
  const entity = { kind: 'ticket' as const, id: contest.ticketId };
  const resolutionEvent = (payload: Record<string, unknown>): SubmittedEvent =>
    newSubmittedEvent({
      workspaceId: contest.originalEvent.workspaceId,
      entity,
      type: 'claim.contested_resolved',
      payload,
      actorId: actor.userId,
      origin: actor.origin,
    });

  if (input.resolution === 'redone' && input.replacementEvent.id === contest.originalEvent.id) {
    // The original id is already contested — re-sending it would idempotently
    // re-answer 'contested'. A redo is a FRESH claim: fail loudly, not quietly.
    throw new Error('redone requires a fresh envelope: the replacement must not reuse the contested claim id');
  }

  let events: SubmittedEvent[];
  if (input.resolution === 'discarded') {
    events = [
      resolutionEvent({
        contestedEventId: contest.contestedEventId,
        resolution: 'discarded',
        ...(input.note === undefined ? {} : { note: input.note }),
      }),
    ];
  } else if (input.resolution === 'converted-to-comment') {
    const comment = newSubmittedEvent({
      workspaceId: contest.originalEvent.workspaceId,
      entity,
      type: 'comment.added',
      payload: {
        body: plainTextToDoc(
          renderContestedClaimText({
            originalEvent: contest.originalEvent,
            rule: contest.rule,
            reason: contest.reason,
          }),
        ),
      },
      actorId: actor.userId,
      origin: actor.origin,
    });
    events = [
      comment,
      resolutionEvent({
        contestedEventId: contest.contestedEventId,
        resolution: 'converted-to-comment',
        commentEventId: comment.id,
      }),
    ];
  } else {
    events = [
      input.replacementEvent,
      resolutionEvent({
        contestedEventId: contest.contestedEventId,
        resolution: 'redone',
        replacementEventId: input.replacementEvent.id,
      }),
    ];
  }

  const results = await ingest(events);
  const refused = results.find((r) => r.status === 'refused' || r.status === 'invalid');
  if (refused !== undefined) {
    return {
      ok: false,
      refused: {
        rule: String(refused['rule'] ?? refused['code'] ?? 'invalid'),
        reason: String(refused['reason'] ?? refused['message'] ?? ''),
      },
    };
  }
  return { ok: true };
}
