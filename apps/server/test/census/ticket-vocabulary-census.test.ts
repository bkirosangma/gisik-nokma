import { describe, expect, it } from 'vitest';
import { domainRegistry, TICKET_EVENT_TYPES, type EventTypeRegistration } from '@gisik-nokma/domain';
import { payloadIds } from '../../src/purge/check-purged.js';
import { BOOTSTRAP_BACKFILL_TYPES } from '../../src/sync/sync-routes.js';

/** 27.004: the census the sync-routes docblock named as missing. Reads the REGISTRY, never a retyped list. */
const onTicket = (r: EventTypeRegistration) =>
  r.entityKind === 'ticket' || (Array.isArray(r.entityKind) && r.entityKind.includes('ticket'));

/**
 * The purge lifecycle is registered against four kinds at once (`vocabulary.ts`), `ticket` among them, but it is no
 * ticket-stream fact: the purge pass owns it (`purge.completed` is refused from a client, `check-purged.ts`), and no
 * replay reader folds or backfills it. Named, not inferred, so a NEW multi-kind type is still reported.
 */
const PURGE_LIFECYCLE: readonly string[] = ['purge.marked', 'purge.unmarked', 'purge.completed'];

function unaccounted(registrations: readonly EventTypeRegistration[]): string[] {
  const folded = new Set<string>(TICKET_EVENT_TYPES);
  const backfilled = new Set<string>(BOOTSTRAP_BACKFILL_TYPES);
  return registrations
    .filter((r) => !PURGE_LIFECYCLE.includes(r.type))
    .filter((r) => onTicket(r) || r.type.startsWith('ticket.'))
    .filter((r) => !(folded.has(r.type) || (!r.type.startsWith('ticket.') && backfilled.has(r.type))))
    .map((r) => r.type);
}

describe('27.004 ticket vocabulary census', () => {
  it('27.004 every ticket-entity type is folded or backfilled; ticket.* always folds; payloadIds names link targets', () => {
    // control first: a planted registration is reported, so the census can fail
    const planted = { type: 'ticket.planted_for_census', version: 1, entityKind: 'ticket', payloadSchema: undefined as never } as EventTypeRegistration;
    expect(unaccounted([...domainRegistry.registrations(), planted])).toEqual(['ticket.planted_for_census']);
    // control: a multi-kind type that is not the purge lifecycle is reported too
    const plantedMulti = { type: 'thing.planted_for_census', version: 1, entityKind: ['ticket', 'note'], payloadSchema: undefined as never } as EventTypeRegistration;
    expect(unaccounted([plantedMulti])).toEqual(['thing.planted_for_census']);
    expect(unaccounted(domainRegistry.registrations())).toEqual([]);
    for (const type of ['ticket.link_added', 'ticket.link_removed']) {
      expect(payloadIds(type, { kind: 'blocks', targetId: '01J9GTKB000000000000000000' })).toEqual([['ticket', '01J9GTKB000000000000000000']]);
    }
  });
});
