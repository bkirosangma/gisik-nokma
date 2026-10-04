import { describe, expect, it } from 'vitest';
import { domainRegistry, linkReading, TICKET_EVENT_TYPES, TICKET_LINK_KINDS, type EventTypeRegistration } from '@gisik-nokma/domain';
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

describe('28.005 the census covers the draft pair', () => {
  it('28.005 both fold; published names its project, discarded names nothing', () => {
    for (const type of ['ticket.published', 'ticket.discarded']) {
      expect((TICKET_EVENT_TYPES as readonly string[]).includes(type), type).toBe(true);
    }
    const PROJECT = '01J9GPRJ000000000000000000';
    expect(payloadIds('ticket.published', { projectId: PROJECT })).toEqual([['project', PROJECT]]);
    expect(payloadIds('ticket.discarded', {})).toEqual([]);
    // control: the creation still names project and parent
    expect(payloadIds('ticket.created', { projectId: PROJECT, parentId: null })).toEqual([['project', PROJECT]]);
    // the 27.004 census must be empty over the real registry, and report a planted type
    const planted = { type: 'ticket.planted_for_census', version: 1, entityKind: 'ticket', payloadSchema: undefined as never } as EventTypeRegistration;
    expect(unaccounted([...domainRegistry.registrations(), planted])).toEqual(['ticket.planted_for_census']);
    expect(unaccounted(domainRegistry.registrations())).toEqual([]);
  });
});

describe('29.127 the link label census', () => {
  it('29.127 payloadIds names only the target of a labelled link; every kind reads both ways', () => {
    const T = '01J9GTKB000000000000000000';
    const lookalike = '01J9GTKC000000000000000000';
    expect(payloadIds('ticket.link_added', { kind: 'leads_to', targetId: T, label: lookalike })).toEqual([['ticket', T]]);
    expect(payloadIds('ticket.link_added', { kind: 'leads_to', targetId: T, label: 'Yes' })).toEqual([['ticket', T]]);
    for (const kind of TICKET_LINK_KINDS) for (const dir of ['out', 'in'] as const) expect(linkReading(kind, dir).length).toBeGreaterThan(0);
    expect(TICKET_LINK_KINDS).toContain('leads_to');
    // control: the 27.004 census still fires on a planted registration
    const planted = { type: 'ticket.planted_for_census', version: 1, entityKind: 'ticket', payloadSchema: undefined as never } as EventTypeRegistration;
    expect(unaccounted([...domainRegistry.registrations(), planted])).toEqual(['ticket.planted_for_census']);
  });
});
