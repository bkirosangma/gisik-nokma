import { describe, expect, it } from 'vitest';
import { MappingError, mapLinkedFromPage } from '../../src/online/mappers.js';
import { createOnlineDataSource } from '../../src/online/online-data-source.js';

const WS = '01J9GWS0000000000000000000';
const T = '01J9GTKT000000000000000000';
const N = '01J9GNTE000000000000000000';
const ROW = {
  sourceKind: 'comment', sourceId: 'C1', authorId: 'u1', snippet: 'per [[X-1 Invoices]]', updatedAt: '2026-10-03T10:00:00.000Z',
  parent: { kind: 'ticket', ticketId: T, projectId: 'P', key: 'GN-1', title: 'Shared', stateCategory: 'active' },
};
// One row per source kind and per parent kind, so dropping any one clause of the
// `sourceKind` test, or the note arm of the parent, turns the positive leg red.
const TICKET_ROW = { ...ROW, sourceKind: 'ticket', sourceId: T };
const NOTE_ROW = { ...ROW, sourceKind: 'note', sourceId: N, parent: { kind: 'note', noteId: N, title: 'Phone pass rulings' } };

describe('27.140 the online source maps the page and folds a 404 to an empty page', () => {
  it('27.140 a page maps field by field; a malformed row is a MappingError; a 404 is EMPTY (control: 200 is not)', async () => {
    const page = { total: 3, items: [ROW, TICKET_ROW, NOTE_ROW], nextCursor: null };
    expect(mapLinkedFromPage(page)).toEqual(page);
    expect(mapLinkedFromPage({ total: 1, items: [ROW], nextCursor: '7' }).nextCursor).toBe('7');
    expect(() => mapLinkedFromPage({ total: 1, items: [{ ...ROW, parent: { kind: 'project' } }], nextCursor: null })).toThrow(MappingError);
    expect(() => mapLinkedFromPage({ total: 1, items: [{ ...ROW, sourceKind: 'project' }], nextCursor: null })).toThrow(MappingError);
    expect(() => mapLinkedFromPage({ total: 1, items: [{ ...ROW, parent: { ...ROW.parent, stateCategory: 'waiting' } }], nextCursor: null })).toThrow(MappingError);
    const calls: string[] = [];
    const fetchImpl = async (input: string) => {
      calls.push(input);
      const ok = input.includes(`target=ticket%3A${T}`);
      return { ok, status: ok ? 200 : 404, json: async () => ({ total: 1, items: [ROW], nextCursor: '42' }) } as Response;
    };
    const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
    expect((await source.query.getLinkedFrom(WS, { kind: 'ticket', id: T })).nextCursor).toBe('42');
    expect(await source.query.getLinkedFrom(WS, { kind: 'note', id: T })).toEqual({ total: 0, items: [], nextCursor: null });
    await source.query.getLinkedFrom(WS, { kind: 'ticket', id: T }, '42');
    expect(calls.at(-1)).toBe(`http://server.test/v1/workspaces/${WS}/references?target=ticket%3A${T}&cursor=42`);
  });
});
