import type { EventEnvelope } from '@gisik-nokma/domain';
import { claimContestedResolvedPayloadSchema } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from './engine.js';

/**
 * Opaque, module-scoped rule ids. Deliberately dotted where `REFUSAL_RULES` is
 * bare: a rule id is a string a refusal carries, not a namespace anyone parses,
 * and harmonising the two spellings would silently change values that fixtures,
 * the server's error surface and both clients compare character for character.
 */
export const CONTEST_RULES = {
  serverOnly: 'contest.server-only',
  unknown: 'contest.unknown',
  alreadyResolved: 'contest.already-resolved',
  wrongTicket: 'contest.wrong-ticket',
} as const;

const ACCEPT: Accept = { refused: false };

function refuse(rule: string, reason: string): Refusal {
  return { refused: true, rule, reason };
}

/**
 * `claim.contested` — only the server records contests. The payload's SHAPE is
 * parse-time (`claimContestedPayloadSchema`, domain), so this rule asks only who
 * is allowed to say it.
 *
 * What it does NOT ask, stated because the sentence above used to imply
 * otherwise: nothing binds the embedded `originalEvent` to the outer envelope.
 * The schema validates the embedded event's internal shape; `parseEvent` reads
 * the outer envelope; this evaluator reads `origin`. So a contest filed on one
 * ticket may embed a refused claim naming a different ticket — or a different
 * workspace — and every layer accepts it. Proven end to end over the shipped
 * door during this branch's final review. Enforcing that coherence belongs to
 * the constructor that builds contests server-side (Plan 10 Task 4); it is
 * recorded in the coordination doc rather than left here as a surprise.
 */
export async function evaluateClaimContested(
  env: EventEnvelope,
  _ctx: EngineContext,
): Promise<Accept | Refusal> {
  if (env.origin !== 'server') {
    return refuse(
      CONTEST_RULES.serverOnly,
      'A contested claim is the system’s record of a refusal; only the server may append one.',
    );
  }
  return ACCEPT;
}

/**
 * `claim.contested_resolved` — a resolution must aim at exactly one open contest
 * on this ticket.
 *
 * There is deliberately NO role gate here. Resolving a contest is open to anyone
 * who can submit on the ticket: restricting it to the claimant or to an admin
 * would leave contests rotting on tickets whose own collaborators could settle
 * them, and the resolution is itself a recorded, attributed event.
 */
export async function evaluateClaimContestedResolved(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  if (ctx.getContest === undefined) {
    // Not a refusal: a refusal is a claim about the world, and this context has
    // made none. Evaluating a contest against a context that cannot see
    // contests is a wiring bug, and it fails loudly rather than answering.
    throw new Error('EngineContext.getContest is required to evaluate claim.contested_resolved');
  }
  const payload = claimContestedResolvedPayloadSchema.parse(env.payload); // parse-time revalidation is cheap and loud
  const contest = await ctx.getContest(payload.contestedEventId);
  if (contest === null) {
    return refuse(CONTEST_RULES.unknown, `No contested claim ${payload.contestedEventId} is recorded.`);
  }
  if (contest.ticketId !== env.entity.id) {
    return refuse(CONTEST_RULES.wrongTicket, 'This contested claim belongs to a different ticket.');
  }
  if (contest.resolved) {
    return refuse(
      CONTEST_RULES.alreadyResolved,
      'This contested claim is already resolved; a second resolution would rewrite history.',
    );
  }
  return ACCEPT;
}
