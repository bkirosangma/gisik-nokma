import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeEnvelope, plainTextToDoc, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketLive } from '../src/checks/deletion.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, STORY, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

/**
 * E6-2 — the live-ticket gate. Every ordinary write against a ticket that is
 * already soft-deleted is refused `deleted-ticket`, and the SAME write against
 * its live twin is accepted in the same case — so a refusal here is the flag
 * answering, never a door that refuses the type outright.
 *
 * The gated set is ENUMERATED rather than described: the finding measured six
 * types committing, five of them with no dispatch arm at all, so a guard
 * inside any one check could not have reached them. The table below is every
 * ticket-scoped type the vocabulary registers, each with the payload its
 * schema accepts, partitioned into the gated and the exempt — and the two
 * halves are asserted to be the WHOLE registry, so a type added later fails
 * here until somebody decides which half it belongs to.
 */

const LIVE = '01J9GLIV000000000000000000';
const DOOMED = '01J9GDOM000000000000000000';
const PEER = '01J9GPER000000000000000000';
const CONTEST = '01J9GCON000000000000000000';
const COMMENT = '01J9GCMT000000000000000000';

const on = (id: string, type: string, payload: unknown, origin: EventEnvelope['origin'] = 'web'): EventEnvelope =>
  makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload, origin });

const world = (...after: EventEnvelope[]) =>
  buildMemoryContext(
    [WF],
    [
      typeDefined(STORY),
      typeDefined(TASK),
      created(LIVE, 'story', null, PROJECT),
      created(DOOMED, 'story', null, PROJECT),
      on(DOOMED, 'ticket.deleted', {}),
      ...after,
    ],
  );

/** The refused claim a contest embeds — shape only; the evaluator reads `origin`. */
const refusedClaim = (id: string) => ({
  id: '01J9GCLM000000000000000000',
  workspaceId: WS,
  entity: { kind: 'ticket', id },
  type: 'ticket.transitioned',
  version: 1,
  payload: { to: 'doing' },
  actorId: '01J9GACT000000000000000000',
  origin: 'web',
  clientTime: '2026-08-20T09:00:00.000Z',
});

/**
 * Every ticket-scoped type that must be REFUSED on a deleted ticket, with a
 * payload its schema accepts. The `id` each payload names is filled per twin.
 */
const GATED: ReadonlyArray<[type: string, payloadFor: (id: string) => unknown]> = [
  ['ticket.transitioned', () => ({ to: 'doing' })],
  ['ticket.assigned', () => ({ assigneeId: PEER })],
  ['ticket.collaborator_added', () => ({ userId: PEER })],
  ['ticket.collaborator_removed', () => ({ userId: PEER })],
  ['ticket.field_set', () => ({ fieldId: 'title', value: 'renamed' })],
  ['ticket.reparented', () => ({ newParentId: null })],
  ['ticket.workflow_rebound', () => ({ toWorkflowId: WF.id, toStateId: 'todo' })],
  ['ticket.closed', () => ({})],
  ['ticket.reopened', () => ({})],
  ['ticket.ranked', () => ({ rank: 'a1' })],
  ['comment.added', () => ({ body: plainTextToDoc('a comment') })],
  // MCP-everything T2 (plan Review Focus 4, case 26.052): editing or deleting a comment is an ordinary write
  // against the ticket, so a deleted ticket refuses it `deleted-ticket`, exactly as it refuses `comment.added`.
  ['comment.edited', () => ({ commentId: COMMENT, body: plainTextToDoc('an edited comment') })],
  ['comment.deleted', () => ({ commentId: COMMENT })],
  // Typed-links T1 (27.004's census sibling): a link is filed on the SOURCE's stream, so a deleted source refuses it
  // `deleted-ticket`, the existing rule (spec A §2.3 rule 2); a deleted TARGET is T3's `link.target-deleted`.
  ['ticket.link_added', () => ({ kind: 'blocks', targetId: '01J9GTKB000000000000000000' })],
  ['ticket.link_removed', () => ({ kind: 'blocks', targetId: '01J9GTKB000000000000000000' })],
  // Drafts T1 (28.008): both are acts on a ticket. A draft cannot be deleted (R7), so a deleted ticket
  // refuses them like the rest; the draft gate (T5) is a different, earlier question.
  ['ticket.published', () => ({ projectId: PROJECT })],
  ['ticket.discarded', () => ({})],
  ['attachment.added', () => ({ attachmentId: '01J9GATT000000000000000000', filename: 'a.txt', mime: 'text/plain', size: 1, sha256: 'ab' })],
  ['visibility.set', (id) => ({ ticketId: id, mode: 'explicit', userIds: [PEER] })],
];

/** The types the gate must let THROUGH on a deleted ticket, each with the reason it is exempt. */
const EXEMPT: ReadonlyArray<[type: string, payloadFor: (id: string) => unknown, why: string]> = [
  ['ticket.deleted', () => ({}), 'its own check answers `already-deleted`, the better sentence'],
  ['ticket.restored', () => ({}), 'the undo — it REQUIRES the flag to be set'],
  ['ticket.created', () => ({ typeId: 'task', projectId: PROJECT, parentId: null, title: 't' }), 'an id that resolves is `ticket.already-exists`, not this'],
  ['claim.contested', (id) => ({ originalEvent: refusedClaim(id), rule: 'deleted-ticket', reason: 'x' }), 'the server\'s record of a refusal — including THIS one'],
  ['claim.contested_resolved', () => ({ contestedEventId: CONTEST, resolution: 'withdrawn' }), 'bookkeeping about a contest, not a write to the ticket'],
  // Trash series, Plan 1 (spec §4): `purge.marked` REFUSES a ticket that is
  // NOT deleted ("Delete it first" — Task 4's checkLifecycle), so marking one
  // for permanent deletion is exactly the act this gate would otherwise turn
  // away.
  ['purge.marked', () => ({}), 'marks a DELETED ticket for permanent deletion — the gate would make the feature unreachable'],
  ['purge.unmarked', () => ({}), 'its undo — it requires the ticket to still be marked, which requires it to still be deleted'],
  // Trash series, Plan 2: the tombstone the purge appends to a deleted item.
  ['purge.completed', () => ({ kind: 'ticket', markedBy: 'u', markedAt: '2026-09-13T10:00:00.000Z' }), 'the purge\'s own tombstone on an item that is deleted by definition'],
];

describe('17.121 E6-2 — the live-ticket gate refuses every ordinary write against a soft-deleted ticket', () => {
  it('E6-2 (28.008 covers the draft pair): the two tables together are the WHOLE ticket-scoped vocabulary — a new type must pick a side', () => {
    // The registry exposes no enumeration, so the universe is the source that
    // REGISTERS it, read as text — the same set-difference the finding ran by
    // hand. Each `domainRegistry.register({ … })` block yields its `type` and
    // its `entityKind`; the two tables above must be exactly the ticket-scoped
    // ones. The two controls beside the equality say the parse found the
    // registrations at all (MEASURED at the commit that added `comment.edited` and `comment.deleted`: 60 blocks, 23 of them
    // ticket-scoped) rather than matching an empty file against an empty table.
    //
    // ⚠ **A block counts as ticket-scoped when its `entityKind` expression
    // NAMES `'ticket'`, not when it EQUALS it**, and the widening is the notes
    // series' doing rather than a loosening for its own sake. Until Plan 1 of 6
    // every registration spelled one kind — `entityKind: 'ticket'` — so a
    // single-quote-only regex was exactly right. `comment.added` now declares
    // `entityKind: ['ticket', 'note']`, and the narrow pattern silently dropped
    // it from the universe: the case then failed with 18 covered against 17
    // scoped, and a looser fix — deleting `comment.added` from `GATED` — would
    // have removed a REAL ticket-scoped write from the gate's coverage. The
    // pattern reads the whole expression for the word, so `comment.added` stays
    // in the universe and still has to pick a side.
    const source = readFileSync(new URL('../../domain/src/vocabulary.ts', import.meta.url), 'utf8');
    const blocks = source.split('domainRegistry.register({').slice(1);
    const ticketScoped = blocks
      .filter((block) => /entityKind: [^\n]*'ticket'/.test(block))
      .map((block) => /\btype: '([^']+)'/.exec(block)?.[1])
      .sort();
    expect(blocks.length).toBeGreaterThan(20);
    expect(ticketScoped.length).toBeGreaterThan(10);
    const covered = [...GATED.map(([type]) => type), ...EXEMPT.map(([type]) => type)].sort();
    expect(covered).toEqual(ticketScoped);
  });

  it.each(GATED)('E6-2: %s is refused deleted-ticket on the deleted twin and passes the gate on the live one', async (type, payloadFor) => {
    const ctx = world();
    const refused = await checkTicketLive(on(DOOMED, type, payloadFor(DOOMED)), ctx);
    expect(refused).toEqual({
      refused: true,
      rule: 'deleted-ticket',
      reason: 'This ticket is deleted; restore it first.',
    });
    // The live twin, same type, same payload, same context: the gate itself
    // accepts — whatever the per-type check says afterwards is that check's
    // business, and it is asked through `evaluateEvent` below.
    expect(await checkTicketLive(on(LIVE, type, payloadFor(LIVE)), ctx)).toEqual({ refused: false });
  });

  it.each(EXEMPT)('E6-2: %s passes the gate on a deleted ticket — %s', async (type, payloadFor) => {
    expect(await checkTicketLive(on(DOOMED, type, payloadFor(DOOMED), 'server'), world())).toEqual({ refused: false });
  });

  it('E6-2: reachable through evaluateEvent, for a type WITH a dispatch arm and one WITHOUT', async () => {
    const ctx = world();
    // `ticket.assigned` has no case in the switch — it was the finding's first
    // measured commit and the one that manufactured an inbox notification.
    expect(await evaluateEvent(on(DOOMED, 'ticket.assigned', { assigneeId: PEER }), ctx)).toMatchObject({ rule: 'deleted-ticket' });
    expect(await evaluateEvent(on(LIVE, 'ticket.assigned', { assigneeId: PEER }), ctx)).toEqual({ refused: false });
    // `ticket.transitioned` has one, and the gate answers BEFORE it.
    expect(await evaluateEvent(on(DOOMED, 'ticket.transitioned', { to: 'doing' }), ctx)).toMatchObject({ rule: 'deleted-ticket' });
    expect(await evaluateEvent(on(LIVE, 'ticket.transitioned', { to: 'doing' }), ctx)).toEqual({ refused: false });
  });

  it('E6-2: a restore re-opens the door — the gate reads the flag, not the history', async () => {
    const ctx = world(on(DOOMED, 'ticket.restored', {}));
    expect(await checkTicketLive(on(DOOMED, 'ticket.assigned', { assigneeId: PEER }), ctx)).toEqual({ refused: false });
    expect(await evaluateEvent(on(DOOMED, 'ticket.transitioned', { to: 'doing' }), ctx)).toEqual({ refused: false });
  });

  it('E6-2: a ticket that does not resolve passes through UNCHANGED — the gate is not an existence check', async () => {
    // `ticket.assigned` for a never-created ticket is committed by the server
    // today (`apps/server/src/projections/tickets.ts` records it, and
    // `test/permissions/check-role-permission.test.ts` pins it). Deciding
    // otherwise is a different ruling, and this gate does not make it.
    const UNKNOWN = '01J9GONE000000000000000000';
    expect(await checkTicketLive(on(UNKNOWN, 'ticket.assigned', { assigneeId: PEER }), world())).toEqual({ refused: false });
    expect(await evaluateEvent(on(UNKNOWN, 'ticket.assigned', { assigneeId: PEER }), world())).toEqual({ refused: false });
  });

  it('E6-2: an event filed against another entity kind is not this gate\'s to refuse', async () => {
    const stranger = makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: DOOMED }, workspaceId: WS, payload: TASK });
    expect(await checkTicketLive(stranger, world())).toEqual({ refused: false });
  });
});
