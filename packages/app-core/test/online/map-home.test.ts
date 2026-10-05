import { describe, expect, it } from 'vitest';
import { HOME_NUMBER_KEYS, type HomeResponse } from '@gisik-nokma/domain';
import { MappingError, mapHome } from '../../src/online/mappers.js';
import { createOnlineDataSource } from '../../src/online/online-data-source.js';

const WS = '01J9GWS0000000000000000000';
// Six DISTINCT counts and six DISJOINT, non-empty id lists, so a field swap in the mapper cannot map to an equal object.
const BODY: HomeResponse = {
  workspaceId: WS,
  generatedAt: '2026-10-05T04:30:00.000Z',
  dueSoonDays: 3,
  counts: { tickets: 12, open: 9, pastDue: 3, dueSoon: 2, members: 5, notes: 4 },
  ids: { tickets: ['t_all'], open: ['t_open'], pastDue: ['t_pd'], dueSoon: ['t_ds'], members: ['u_1'], notes: ['n_1'] },
};

describe('27.632 mapHome: the home body, every field checked (Knowledge Graph spec E)', () => {
  it('27.632 a well-formed body maps unchanged and members: null stays null; control: a wrong type, a missing key and a bad element each throw naming their path', () => {
    expect(mapHome(BODY)).toEqual(BODY);
    const guest = { ...BODY, counts: { ...BODY.counts, members: null }, ids: { ...BODY.ids, members: [] } };
    expect(mapHome(guest).counts.members).toBeNull();
    expect(mapHome(guest)).toEqual(guest);

    expect(() => mapHome({ ...BODY, counts: { ...BODY.counts, open: '3' } })).toThrow(MappingError);
    expect(() => mapHome({ ...BODY, counts: { ...BODY.counts, open: '3' } })).toThrow(/home\.counts\.open/);
    const { notes: _notes, ...idsWithoutNotes } = BODY.ids;
    expect(() => mapHome({ ...BODY, ids: idsWithoutNotes })).toThrow(/home\.ids\.notes/);
    // Missing key ≠ null: a missing number must not render as "Restricted".
    const { members: _members, ...countsWithoutMembers } = BODY.counts;
    expect(() => mapHome({ ...BODY, counts: countsWithoutMembers })).toThrow(/home\.counts\.members/);
    expect(() => mapHome({ ...BODY, ids: { ...BODY.ids, open: [7] } })).toThrow(/home\.ids\.open\[0\]/);

    // H1 (p11): class (vi). Every BODY list holds one id, so a first-element-only idList passes everything above.
    const TWO = { ...BODY, ids: { ...BODY.ids, open: ['t_open', 't_open_2'] } };
    expect(mapHome(TWO)).toEqual(TWO);
    expect(() => mapHome({ ...BODY, ids: { ...BODY.ids, open: ['t_open', 7] } })).toThrow(/home\.ids\.open\[1\]/);

    // H2 (p11): each path literal, one bad value per field.
    for (const key of HOME_NUMBER_KEYS) {
      expect(() => mapHome({ ...BODY, counts: { ...BODY.counts, [key]: 'x' } }), key).toThrow(new RegExp(`home\\.counts\\.${key}`));
    }
    for (const key of ['workspaceId', 'generatedAt'] as const) {
      expect(() => mapHome({ ...BODY, [key]: 1 }), key).toThrow(new RegExp(`home\\.${key}`));
    }
    expect(() => mapHome({ ...BODY, dueSoonDays: '7' })).toThrow(/home\.dueSoonDays/);
  });

  it('27.632 getHome reads /v1/workspaces/:ws/home and maps it; control: another path is not asked', async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string) => {
      calls.push(input);
      const ok = input === `http://server.test/v1/workspaces/${WS}/home`;
      return { ok, status: ok ? 200 : 404, json: async () => BODY } as Response;
    };
    const source = createOnlineDataSource({ baseUrl: 'http://server.test', fetchImpl });
    expect(await source.query.getHome(WS)).toEqual(BODY);
    expect(calls).toEqual([`http://server.test/v1/workspaces/${WS}/home`]);
  });
});
