import { z } from 'zod';
import { submittedEventSchema } from '../envelope.js';
import type { SubmittedEvent } from '../envelope.js';
import { formatIstInstant } from '../clock-skew.js';

/**
 * A sync-time refusal is never a silent drop: the server appends the refused
 * claim to the ledger as a contested claim on the ticket it touched
 * (spec honesty invariant 5, coordination amendment 16). The contest is
 * history, visible to everyone who can see the ticket.
 *
 * Registration lives in `../vocabulary.ts` beside every other event type, not
 * here as an import side-effect: the registry throws on a duplicate key, so
 * one file has to own the call, and this package has already chosen which one
 * — `events/*.ts` states schemas, `vocabulary.ts` binds them to types and
 * entity kinds.
 */
/**
 * `submittedEventSchema.payload` is `z.unknown()`, and zod makes an unknown key
 * OPTIONAL at both type and runtime — so the bare schema admits an original
 * claim with no payload at all. That is precisely the contest this event type
 * exists to prevent: `JSON.stringify` drops keys whose value is `undefined`, so
 * `renderContestedClaimText` would write `ticket.transitioned undefined` into a
 * comment body that lives in an append-only table forever, recording THAT
 * something was claimed but not WHAT.
 *
 * SUPERSEDED 2026-08-31, and deliberately not re-stated here. This module once
 * carried its own `.refine` asserting `payload !== undefined` on the embedded
 * event. `submittedEventSchema` now enforces exactly that at the door (Plan 4's
 * envelope amendment): absent and present-but-undefined are refused, `null` and
 * `{}` accepted — an empty claim is a claim, an absent one is not.
 *
 * The refine was removed rather than kept as belt-and-braces. Two schemas
 * stating one rule is a second definition that drifts silently the moment the
 * door's rule moves, which is the failure this series keeps finding. The TEST
 * stays: it pins the guarantee at the level that matters — a contest cannot
 * carry a payload-less claim — and now guards the door's behaviour from here,
 * rather than re-implementing it.
 */
export const claimContestedPayloadSchema = z
  .object({
    originalEvent: submittedEventSchema,
    rule: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

/**
 * Stated by hand rather than `z.infer`, for the same zod quirk: inference would
 * yield `originalEvent.payload?: unknown`, which is NOT assignable to
 * `SubmittedEvent`, and every consumer reaching for a cast to bridge that gap
 * would silently erase the guarantee the door enforces. The repo
 * already handles this quirk by hand at `parse-event.ts:99`; same precedent.
 */
export type ClaimContestedPayload = { originalEvent: SubmittedEvent; rule: string; reason: string };

const RESOLUTIONS = ['redone', 'converted-to-comment', 'discarded'] as const;

/**
 * Resolution is human: redo it legally, convert it to a comment, or discard —
 * and the discard is itself a recorded event (spec §5). The redo links its
 * replacement; the conversion links its comment. Nothing silently vanishes.
 *
 * The three id fields are deliberately `z.string().min(1)` and NOT `ulidString`,
 * despite every id in this package otherwise being a ULID: this door is entered
 * by the fixture harness (`fx_evt_N` ids) and by the offline replica, neither of
 * which speaks ULIDs. Do not "fix" this to `ulidString` — it is a widening the
 * callers depend on, not an oversight.
 */
export const claimContestedResolvedPayloadSchema = z
  .object({
    contestedEventId: z.string().min(1),
    resolution: z.enum(RESOLUTIONS),
    replacementEventId: z.string().min(1).optional(),
    commentEventId: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.resolution === 'redone' && v.replacementEventId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'redone requires replacementEventId' });
    }
    if (v.resolution === 'converted-to-comment' && v.commentEventId === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'converted-to-comment requires commentEventId' });
    }
  });

export type ClaimContestedResolvedPayload = z.infer<typeof claimContestedResolvedPayloadSchema>;

export const CONTEST_EVENT_TYPES = ['claim.contested', 'claim.contested_resolved'] as const;

/**
 * The banner line and the comment a conversion carries — attributed, dated,
 * rule named.
 *
 * The time is the claimant's own `clientTime`, printed in India time through
 * the one formatter (owner decision: time is Asia/Kolkata). Not the raw ISO
 * string: this text is read by a person — it goes on a ticket banner and,
 * on "convert to comment", into a comment body that stays in the ledger
 * forever — and a bare `2026-08-20T18:30:00.000Z` would be the only place in
 * the product showing a claimant a UTC timestamp, one IST day off from the
 * date the same claim wears everywhere else.
 */
export function renderContestedClaimText(payload: ClaimContestedPayload): string {
  const { originalEvent, rule, reason } = payload;
  return (
    `Contested claim by ${originalEvent.actorId} at ${formatIstInstant(originalEvent.clientTime)}: ` +
    `${originalEvent.type} ${JSON.stringify(originalEvent.payload)} — refused by rule "${rule}": ${reason}`
  );
}

/**
 * The attribution line for a contested claim on a surface that holds the
 * SUMMARY rather than the envelope — the My Work row (`ContestedClaim`) and the
 * attention strip.
 *
 * ## A sibling of `renderContestedClaimText`, not a change to it (ruling P39)
 *
 * P39 said to extend this module rather than replace that function, and the
 * reason is above its own signature: its output goes into a comment body on
 * "convert to comment", and a comment body lives in an append-only table
 * forever. Re-wording it would re-word nothing already written and every future
 * one — two spellings of one sentence in the ledger, distinguishable only by
 * date. So the treatment is extended and the existing text is untouched.
 *
 * ## Two instants, both named for what they are
 *
 * A contested claim has no server instant of its own — it was refused at the
 * door and never stamped — so this line shows the two instants that ARE
 * recorded and labels each:
 *
 * - `clientTime` is the claimant's DEVICE clock, exactly as
 *   `renderContestedClaimText` prints it. It is marked "by their clock" because
 *   it is the one moment this product shows that no server vouches for.
 * - `contestedAt` is the SERVER's instant for the `claim.contested` event —
 *   when the refusal was filed, which is a real recorded fact about a real
 *   event, and is never presented as when the claim was made.
 *
 * Both go through `formatIstInstant`, so a moment is printed one way across the
 * server, the web client, the desktop client and the offline replica.
 *
 * The actor is named by the CALLER's `actorLabel` (R3 N4, owner 2026-09-29; it
 * used to be rendered by RAW ID). `ContestedClaimProvenance` carries no
 * `actorName` and this package has no roster, so the client resolves the label
 * (`useActorLabels`) and hands it in; with none it reads `Unknown person`,
 * never the ULID.
 */
export function renderContestedClaimAttribution(
  claim: {
    actorId: string;
    clientTime: string;
    contestedAt: string;
  },
  actorLabel?: string,
): string {
  return (
    `claimed by ${actorLabel ?? 'Unknown person'} at ${formatIstInstant(claim.clientTime)} by their clock, ` +
    `refused ${formatIstInstant(claim.contestedAt)}`
  );
}

/** Minimal ProseMirror doc for plain text (amendment 12: bodies are PM JSON). */
export function plainTextToDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [text === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}
