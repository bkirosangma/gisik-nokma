import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { domainRegistry, linkReading, TICKET_EVENT_TYPES, TICKET_LINK_KINDS, type EventTypeRegistration } from '@gisik-nokma/domain';
import { REFUSALS } from '@gisik-nokma/rule-engine';
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

describe('29.137 the decision census', () => {
  it('29.137 ticket.decided is folded and in no backfill list; payloadIds names every closeStarted id and nothing else', () => {
    const folded = (TICKET_EVENT_TYPES as readonly string[]).includes('ticket.decided');
    const backfilled = (BOOTSTRAP_BACKFILL_TYPES as readonly string[]).includes('ticket.decided');
    expect([folded, backfilled]).toEqual([true, false]);
    const [a, b] = ['01J9GTKB000000000000000000', '01J9GTKC000000000000000000'];
    expect(payloadIds('ticket.decided', { outcome: 'Yes', closeStarted: [a, b] })).toEqual([['ticket', a], ['ticket', b]]);
    expect(payloadIds('ticket.decided', { outcome: 'Yes' })).toEqual([]); // control: no request, no ids
  });
});

describe('29.209 the flow-cause census', () => {
  it('29.209 cause.forged is a refusal; each flow cause rides exactly its event types in the registry; payloadIds names the cause ids; the mobile bundle carries the new payloads', () => {
    expect(REFUSALS['cause.forged']).toBe('Only the flow can record that a ticket was led here, reopened or passed over by a decision.');
    const [D, S, U, E] = ['01J9GDEC000000000000000000', '01J9GSRC000000000000000000', '01J9GACT000000000000000001', '01J9GEVT000000000000000001'];
    const causes = {
      'led-to': { kind: 'led-to', sourceTicketId: S, triggeredBy: U },
      'reopened-by-flow': { kind: 'reopened-by-flow', decisionTicketId: D, outcome: 'No', pass: 1, decidedBy: U, decisionEventId: E },
      'branch-not-taken': { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'No', pass: 1, decidedBy: U, decisionEventId: E },
    } as const;
    // Read through the REGISTRY's own payload schemas, never a retyped list: which kinds each type accepts.
    const schemaOf = (type: string) => {
      const registration = domainRegistry.registrations().find((r) => r.type === type);
      if (registration === undefined) throw new Error(`${type} is not registered`);
      return registration.payloadSchema;
    };
    const accepted = (type: string, extra: Record<string, unknown>) =>
      Object.entries(causes).filter(([, cause]) => schemaOf(type).safeParse({ ...extra, cause }).success).map(([kind]) => kind);
    expect(accepted('ticket.transitioned', { to: 'todo' })).toEqual(['led-to', 'reopened-by-flow', 'branch-not-taken']);
    expect(accepted('ticket.closed', {})).toEqual(['branch-not-taken']);
    expect(accepted('ticket.reopened', {})).toEqual(['reopened-by-flow']);
    // The purge door names the cause's ticket, on each type that may carry one, and never the person.
    expect(payloadIds('ticket.transitioned', { to: 'todo', cause: causes['led-to'] })).toEqual([['ticket', S]]);
    expect(payloadIds('ticket.closed', { cause: causes['branch-not-taken'] })).toEqual([['ticket', D]]);
    expect(payloadIds('ticket.reopened', { cause: causes['reopened-by-flow'] })).toEqual([['ticket', D]]);
    expect(payloadIds('ticket.transitioned', { to: 'todo' })).toEqual([]); // control: an uncaused move names nothing
    // The mobile editor bundle embeds the domain registry, so it is rebuilt with the new payloads (read here, not by
    // `generate:editor-html --check`, which warns and passes when the webview is unbuilt).
    const bundle = readFileSync(resolve(import.meta.dirname, '../../../mobile/src/editor/editor-html.generated.ts'), 'utf8');
    expect(bundle).toContain('branch-not-taken');
    // control: the 27.004 census still fires on a planted registration
    const planted = { type: 'ticket.planted_for_census', version: 1, entityKind: 'ticket', payloadSchema: undefined as never } as EventTypeRegistration;
    expect(unaccounted([...domainRegistry.registrations(), planted])).toEqual(['ticket.planted_for_census']);
  });
});
