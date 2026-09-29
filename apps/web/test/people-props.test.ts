import { describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { peopleProps } from '../src/people-props.js';

describe('3.998 peopleProps binds the workspace', () => {
  it('3.998 both functions carry the workspace id; CONTROL: a second workspace binds its own', async () => {
    const lookup = vi.fn(async () => null);
    const assignOutsider = vi.fn(async () => ({ status: 'committed', eventId: 'e', seq: 1, serverTime: 't' }) as const);
    const people = { lookup, assignOutsider };
    const event = { id: 'e' } as unknown as SubmittedEvent;
    await peopleProps(people, 'ws_1').lookupPerson('a@b.test');
    await peopleProps(people, 'ws_1').assignOutsider('u_1', event);
    await peopleProps(people, 'ws_2').lookupPerson('c@d.test');
    expect(lookup.mock.calls).toEqual([['ws_1', 'a@b.test'], ['ws_2', 'c@d.test']]);
    expect(assignOutsider.mock.calls).toEqual([['ws_1', 'u_1', event]]);
  });
});
