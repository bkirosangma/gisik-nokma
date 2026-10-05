import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import { readTools } from '../src/tools/read-tools.js';
import { recordingSession, type Route } from './fixtures/recording-session.js';

/**
 * MCP sweep 2 T3, cases 14.605, 14.606 and 14.609 (the hosted cases 14.607 and 14.608 are
 * `apps/server/test/mcp/mcp-ticket-notes.test.ts`). `get_ticket` reads the ticket, then its typed links
 * (typed-links T4), then the notes attached to it.
 */
const WS = 'W1';
const T = 'T1';
const TICKET = `/v1/workspaces/${WS}/tickets/${T}`;
const LINKS = `${TICKET}/links`;
const NOTES = `${TICKET}/notes`;
const DETAIL = { key: 'CCSO-4', title: 'Chiller', ticketState: { kind: 'ticket', id: T, fields: {} }, rollup: null };
/** What the notes route answers per note (`NoteSummary`, `packages/domain/src/read-models.ts:906-917`): more than `get_ticket` shows. */
const note = (n: number) => ({
  noteId: `N${n}`, workspaceId: WS, homeProjectId: '', authorId: `U${n}`, title: `Note ${n}`, scope: { mode: 'workspace' },
  attachedTickets: [{ ticketId: T, projectId: 'P', key: 'CCSO-4', title: 'Chiller' }], deleted: false,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: `2026-10-02T00:00:${String(59 - (n % 60)).padStart(2, '0')}.000Z`,
});
/** A visible ticket with no links whose notes route answers `notes`. */
const world = (notes: Route) => recordingSession({ routes: { [`GET ${TICKET}`]: DETAIL, [`GET ${LINKS}`]: { links: [] }, [`GET ${NOTES}`]: notes } });
const tool = (session: ReturnType<typeof recordingSession>['session']) => {
  const found = readTools(session).find((t) => t.name === 'get_ticket');
  if (found === undefined) throw new Error('no get_ticket');
  return found;
};
const paths = (requests: ReturnType<typeof recordingSession>['requests']) => requests.map((r) => `${r.method} ${r.path}`);
const unread = (why: string) => new Error(`The ticket was read but the notes attached to it could not be (${why}), so nothing is returned: an empty list would read as "no notes".`);

describe('get_ticket and the notes attached to the ticket', () => {
  it('14.605 reads the notes only after the ticket read succeeded: a ticket the caller cannot see answers the uniform sentence and the notes route is never called', async () => {
    const hidden = recordingSession({
      routes: { [`GET ${TICKET}`]: () => { throw new HttpError(404, { error: 'not_found' }); }, [`GET ${LINKS}`]: { links: [] }, [`GET ${NOTES}`]: { notes: [note(1)] } },
    });
    await expect(tool(hidden.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(/^ticket not found or not visible to you$/);
    expect(paths(hidden.requests)).toEqual([`GET ${TICKET}`]);
    // CONTROL, same `it`: a visible ticket makes every read, the ticket FIRST and the notes after the links.
    const visible = world({ notes: [note(1)] });
    await tool(visible.session).handler({ workspaceId: WS, ticketId: T });
    expect(paths(visible.requests)).toEqual([`GET ${TICKET}`, `GET ${LINKS}`, `GET ${NOTES}`]);
  });

  it('14.606 answers the route\'s notes trimmed to noteId, title, authorId and updatedAt, cut at 50 with notesTotal counting them all; the description says what notes is and where the rest is read', async () => {
    const many = Array.from({ length: 60 }, (_, i) => note(i + 1));
    const s = world({ notes: many });
    const out = (await tool(s.session).handler({ workspaceId: WS, ticketId: T })) as { notes: Array<Record<string, unknown>>; notesTotal: number };
    expect(out.notes).toHaveLength(50);
    expect(out.notesTotal).toBe(60);
    expect(Object.keys(out.notes[0]!).sort()).toEqual(['authorId', 'noteId', 'title', 'updatedAt']);
    expect(out.notes[0]).toEqual({ noteId: 'N1', title: 'Note 1', authorId: 'U1', updatedAt: '2026-10-02T00:00:58.000Z' });
    expect(out.notes.map((n) => n['noteId'])).toEqual(many.slice(0, 50).map((n) => n.noteId)); // the route's order is kept
    // The cut, both sides of it: 50 notes are all shown, 51 show 50 and count 51.
    const fifty = (await tool(world({ notes: many.slice(0, 50) }).session).handler({ workspaceId: WS, ticketId: T })) as typeof out;
    expect([fifty.notes.length, fifty.notesTotal]).toEqual([50, 50]);
    const fiftyOne = (await tool(world({ notes: many.slice(0, 51) }).session).handler({ workspaceId: WS, ticketId: T })) as typeof out;
    expect([fiftyOne.notes.length, fiftyOne.notesTotal]).toEqual([50, 51]);
    // CONTROL, same `it`: a short list is whole, and the ticket's own members are still there.
    const few = world({ notes: [note(1), note(2)] });
    const small = (await tool(few.session).handler({ workspaceId: WS, ticketId: T })) as Record<string, unknown> & { notes: unknown[] };
    expect(small.notes).toHaveLength(2);
    expect(small['notesTotal']).toBe(2);
    expect(small['key']).toBe('CCSO-4');
    expect(small['links']).toEqual([]);
    const description = tool(s.session).description;
    // Each leg on its own clause: a bare `toContain('notes')` passes on `notesTotal` alone, and `/can read/` on the same clause.
    expect(description).toContain('`notes` lists the notes attached to it that you can read');
    expect(description).toContain('`notesTotal` counts them all');
    expect(description).toContain('read one in full with get_note');
    // And the whole of it, exactly: a changed limit or a dropped member name is a different description.
    expect(description).toBe(
      'Read one ticket in full: its visibility row, its folded state (assignee, collaborators, ' +
      'custom fields, transition history), its title, who last moved it, its parent, its rollup and its typed links ' +
      '(`links`: kind, direction "out"/"in" and the other ticket, visible ends only). ' +
      '`notes` lists the notes attached to it that you can read (noteId, title, authorId, updatedAt; newest first, at most 50) and ' +
      '`notesTotal` counts them all; read one in full with get_note. ' +
      'A ticket you cannot see is indistinguishable from one that does not exist — both answer not_found. ' +
      // the flow facts sentence (Graph Part 5 T2, 29.381)
      'Also: for a Decision its `passes`; for a ticket in its second round or later, `round` and `periods`; for a ticket closed as Not taken, ' +
      'its `resolution` (the Decision is named only if you can read it); `leads_to` links carry their `label`.',
    );
  });

  it('14.609 a failure of the notes read fails the whole call; the ticket is never returned with notes: [] standing for "no notes"', async () => {
    const broken = world(() => { throw new HttpError(500, { error: 'boom' }); });
    await expect(tool(broken.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(/notes attached to it could not be \(gisik-nokma answered 500\).*nothing is returned/);
    await expect(tool(broken.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(unread('gisik-nokma answered 500'));
    const odd = world({ nope: true });
    await expect(tool(odd.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(/not a list of notes/);
    await expect(tool(odd.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(unread('the answer was not a list of notes'));
    // An empty (null) body is not a list either, and is said so (not a TypeError).
    await expect(tool(world(null).session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(unread('the answer was not a list of notes'));
    // `notes` present but not a list (an object, a string) is refused with the same sentence, not a TypeError from `.map`.
    for (const notes of [{}, 'x']) {
      await expect(tool(world({ notes }).session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(unread('the answer was not a list of notes'));
    }
    // A failure that is not an Error is still named.
    await expect(tool(world(() => { throw 'socket hang up'; }).session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(unread('socket hang up'));
    // CONTROL, same `it`: an honest empty list is answered as one.
    const none = world({ notes: [] });
    expect(await tool(none.session).handler({ workspaceId: WS, ticketId: T })).toMatchObject({ notes: [], notesTotal: 0 });
  });
});
