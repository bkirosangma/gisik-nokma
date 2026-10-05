import { describe, expect, it } from 'vitest';
import { readTools } from '../src/tools/read-tools.js';
import { ticketTools } from '../src/tools/ticket-tools.js';
import { COMMITTED, ME, WS, detail, fakeFlow, ulid } from './fixtures/flow-fixtures.js';

/** Graph Part 5 T1: `link_tickets` takes `leads_to` with a label, relabels it and files draft ends on the draft (29.375, 29.376). */
const A = ulid('AAA');
const B = ulid('BBB');
const D = ulid('DEC'); // a Decision
const DR = ulid('DRF'); // a draft
const DR2 = ulid('DR2'); // another of my drafts
const tw = `/v1/workspaces/${WS}/tickets`;
// The links route writes no `label` key when a row has none (29.126), so neither does this fixture.
const row = (kind: string, direction: 'out' | 'in', id: string, label: string | null = null) => ({
  kind, direction, ...(label === null ? {} : { label }), ticket: { id, key: 'GN-9', title: 'T' },
});
const ENDS = {
  [`${tw}/${A}`]: detail({ key: 'GN-1' }), [`${tw}/${B}`]: detail({ key: 'GN-2' }), [`${tw}/${D}`]: detail({ key: 'GN-3', typeId: 'decision' }),
  [`${tw}/${DR}`]: detail({ key: null, draft: true }), [`${tw}/${DR2}`]: detail({ key: null, draft: true }),
};
const tool = (s: Parameters<typeof ticketTools>[0]) => ticketTools(s).find((t) => t.name === 'link_tickets')!;
const base = { workspaceId: WS, kind: 'leads_to', action: 'add' } as const;
const payload = (e: Record<string, unknown> | undefined) => e?.['payload'] as Record<string, unknown>;

describe('29.375 link_tickets: leads_to, label, draft ends', () => {
  it('29.375 files one link_added with the trimmed label; a Decision without a label is the server refusal verbatim; label on blocks is refused unsent', async () => {
    const f = fakeFlow(ENDS);
    await tool(f.session).handler({ ...base, ticketId: D, targetId: A, label: '  Yes  ' });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]).toHaveLength(1);
    expect(f.batches[0]![0]).toMatchObject({ type: 'ticket.link_added', origin: 'mcp', actorId: ME, entity: { kind: 'ticket', id: D }, payload: { kind: 'leads_to', targetId: A, label: 'Yes' } });

    await expect(tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: B, label: 'x' })).rejects.toThrow(/^label only applies to "leads_to" links$/);
    expect(f.batches, 'refused before anything was sent').toHaveLength(1);
    await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: B }); // control: blocks without a label
    expect(payload(f.batches[1]![0])).toEqual({ kind: 'blocks', targetId: B }); // no `label`, no `from`

    const refused = fakeFlow(ENDS, { results: () => [{ status: 'refused', eventId: 'e', rule: 'link.label-required', reason: 'A link from a Decision needs a label.' }] });
    await expect(tool(refused.session).handler({ ...base, ticketId: D, targetId: A })).rejects.toThrow(/^refused by link\.label-required: A link from a Decision needs a label\.$/);
  });

  it('29.375 the label is 1 to 60 characters after trimming: blank and 61 are refused unsent, 60 is sent; remove takes no label', async () => {
    const f = fakeFlow(ENDS);
    await expect(tool(f.session).handler({ ...base, ticketId: D, targetId: A, label: '   ' })).rejects.toThrow(/"label"/);
    await expect(tool(f.session).handler({ ...base, ticketId: D, targetId: A, label: 'x'.repeat(61) })).rejects.toThrow(/"label"/);
    await expect(tool(f.session).handler({ workspaceId: WS, kind: 'leads_to', action: 'remove', ticketId: D, targetId: A, label: 'Yes' }))
      .rejects.toThrow(/^remove takes no label: it removes the link between the two tickets$/);
    expect(f.batches, 'nothing sent').toHaveLength(0);
    expect(f.gets, 'the remove was refused before any read').toEqual([]);
    await tool(f.session).handler({ ...base, ticketId: D, targetId: A, label: ` ${'x'.repeat(60)} ` }); // control: 60 after the trim
    expect(payload(f.batches[0]![0])['label']).toBe('x'.repeat(60));
    await tool(f.session).handler({ ...base, ticketId: D, targetId: B, label: 'Y' }); // control: one character
    expect(payload(f.batches[1]![0])['label']).toBe('Y');
  });

  it('29.375 a draft end files on the draft stream: from-form when the source is published, plain when the source is a draft', async () => {
    const f = fakeFlow(ENDS);
    await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: DR }); // published -> draft
    expect(f.batches[0]![0]).toMatchObject({ entity: { id: DR }, payload: { kind: 'blocks', targetId: DR, from: A } });
    await tool(f.session).handler({ ...base, ticketId: DR, targetId: A, label: 'Next' }); // draft -> published
    expect(f.batches[1]![0]).toMatchObject({ entity: { id: DR }, payload: { kind: 'leads_to', targetId: A, label: 'Next' } });
    expect(payload(f.batches[1]![0])['from']).toBeUndefined();
    await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: B }); // control: published -> published, plain on A
    expect(f.batches[2]![0]).toMatchObject({ entity: { id: A }, payload: { kind: 'blocks', targetId: B } });
    expect(payload(f.batches[2]![0])['from']).toBeUndefined();
    // an end the caller cannot read is the uniform sentence, and nothing is sent
    await expect(tool(f.session).handler({ ...base, kind: 'blocks', ticketId: A, targetId: ulid('HID') })).rejects.toThrow(/^ticket not found or not visible to you$/);
    expect(f.batches).toHaveLength(3);
    // draft -> draft: plain on the SOURCE draft (a draft source files as always, R42), never on the target draft with `from`
    await tool(f.session).handler({ ...base, kind: 'blocks', ticketId: DR, targetId: DR2 });
    expect(f.batches[3]![0]).toMatchObject({ entity: { id: DR }, payload: { kind: 'blocks', targetId: DR2 } });
    expect(payload(f.batches[3]![0])['from']).toBeUndefined();
  });

  it('29.375 the description an assistant reads, word for word', () => {
    expect(tool(fakeFlow().session).description).toBe(
      'Add, remove or relabel a typed link between two tickets: kind "blocks" (ticketId blocks targetId), "relates" (either way), "duplicates" ' +
        '(ticketId duplicates the original, targetId) or "leads_to" (ticketId leads to targetId: an arrow in the flow; a Decision\'s arrows each need a `label`, ' +
        'the outcome that sends the flow that way, 1–60 characters). action "add", "remove" or "relabel" (leads_to only, with the new `label`). ' +
        'Removing works from either end; if a loop stores both directions between two tickets, the one leaving ticketId is removed. ' +
        'A link to or from one of your drafts lives on the draft and is private to you until it is published. Every rule is the product\'s.',
    );
    expect((tool(fakeFlow().session).inputSchema['kind'] as { options?: unknown }).options).toEqual(['blocks', 'relates', 'duplicates', 'leads_to']);
  });
});

describe('29.375 get_ticket.links carries the label', () => {
  it('29.375 a leads_to row keeps its label; a blocks row has none', async () => {
    const f = fakeFlow({
      [`${tw}/${D}`]: detail({ typeId: 'decision' }), [`${tw}/${D}/links`]: { links: [row('leads_to', 'out', A, 'Yes'), row('blocks', 'out', B)] },
      [`${tw}/${D}/notes`]: { notes: [] },
    });
    const getTicket = readTools(f.session).find((t) => t.name === 'get_ticket')!;
    const out = (await getTicket.handler({ workspaceId: WS, ticketId: D })) as { links: Array<{ kind: string; label?: string }> };
    expect(out.links.find((l) => l.kind === 'leads_to')?.label).toBe('Yes');
    expect('label' in out.links.find((l) => l.kind === 'blocks')!).toBe(false); // control
  });
});

describe('29.376 link_tickets: remove and relabel file on the stored source', () => {
  // A -> B and B -> A. The INCOMING row is listed first in both, so a pickLink that takes the first match picks the wrong edge
  const LOOP_A = { links: [row('leads_to', 'in', B), row('leads_to', 'out', B, 'Yes')] };
  const LOOP_B = { links: [row('leads_to', 'in', A, 'Yes'), row('leads_to', 'out', A)] };
  const remove = { workspaceId: WS, kind: 'leads_to', action: 'remove' } as const;

  it('29.376 a two-ticket loop: remove (A, B) files on A, (B, A) on B; an incoming-only link is removed from the other stream', async () => {
    const f = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: LOOP_A, [`${tw}/${B}/links`]: LOOP_B });
    await tool(f.session).handler({ ...remove, ticketId: A, targetId: B });
    expect(f.batches[0]![0]).toMatchObject({ type: 'ticket.link_removed', entity: { id: A }, payload: { kind: 'leads_to', targetId: B } });
    await tool(f.session).handler({ ...remove, ticketId: B, targetId: A });
    expect(f.batches[1]![0]).toMatchObject({ type: 'ticket.link_removed', entity: { id: B }, payload: { kind: 'leads_to', targetId: A } });
    for (const b of f.batches) expect('label' in payload(b[0]), 'link_removed carries no label').toBe(false);
    const incoming = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: { links: [row('leads_to', 'in', B)] } });
    await tool(incoming.session).handler({ ...remove, ticketId: A, targetId: B }); // stored B -> A
    expect(incoming.batches[0]![0]).toMatchObject({ entity: { id: B }, payload: { kind: 'leads_to', targetId: A } });
    const none = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: { links: [] } });
    await expect(tool(none.session).handler({ ...remove, ticketId: A, targetId: B })).rejects.toThrow(`no "leads_to" link between ${A} and ${B} that you can see`);
    expect(none.batches).toHaveLength(0);
  });

  it('29.376 a link stored on a draft is removed on the draft stream with `from`', async () => {
    const f = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: { links: [row('blocks', 'out', DR)] } });
    await tool(f.session).handler({ ...remove, kind: 'blocks', ticketId: A, targetId: DR });
    expect(f.batches[0]![0]).toMatchObject({ type: 'ticket.link_removed', entity: { id: DR }, payload: { kind: 'blocks', targetId: DR, from: A } });
  });

  const relabel = { workspaceId: WS, kind: 'leads_to', action: 'relabel' } as const;
  // D's own two branches, an arrow INTO D whose label is another ticket's branch (it does not block D's labels), and an
  // unlabelled outgoing link (no label to compare)
  const DEC_LINKS = { links: [row('leads_to', 'in', ulid('UPS'), 'Later'), row('leads_to', 'out', A, 'Yes'), row('relates', 'out', ulid('REL')), row('leads_to', 'out', B, 'No')] };

  it('29.376 relabel is one batch [link_removed, link_added] after its pre-checks; control: a free label commits both', async () => {
    const f = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS });
    await expect(tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' })).resolves.toEqual({ results: [COMMITTED, COMMITTED] });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]!.map((e) => [e['type'], payload(e)['label'] ?? null])).toEqual([['ticket.link_removed', null], ['ticket.link_added', 'Approved']]);
    for (const e of f.batches[0]!) expect(e).toMatchObject({ origin: 'mcp', entity: { id: D }, payload: { kind: 'leads_to', targetId: A } });
    // pre-checks send nothing
    await expect(tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Yes' })).rejects.toThrow(/^the link already has this label$/);
    await expect(tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label: ' no ' })).rejects.toThrow(/^another branch of this ticket is already labelled "no"$/);
    expect(f.batches, 'pre-checks sent nothing').toHaveLength(1);
    await expect(tool(f.session).handler({ ...relabel, kind: 'blocks', ticketId: D, targetId: A, label: 'x' })).rejects.toThrow('label only applies');
    await expect(tool(f.session).handler({ ...relabel, ticketId: D, targetId: A })).rejects.toThrow(/^relabel needs kind "leads_to" and the new label$/);
    await expect(tool(f.session).handler({ ...relabel, kind: 'blocks', ticketId: D, targetId: A })).rejects.toThrow(/^relabel needs kind "leads_to" and the new label$/);
    expect(f.batches, 'nothing sent').toHaveLength(1);
    // a change of case only is a new label (the current-label check is exact); it differs from no OTHER branch either
    await tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'yes' });
    expect(f.batches).toHaveLength(2);
    expect(payload(f.batches[1]![1])['label']).toBe('yes');
    // an incoming arrow's label is not one of D's branches
    await tool(f.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Later' });
    expect(f.batches).toHaveLength(3);
    // from the TARGET end: the stored source (D) files, and the other branches are D's own, read from D's links (A's list has none)
    const fromEnd = fakeFlow({ ...ENDS, [`${tw}/${A}/links`]: { links: [row('leads_to', 'in', D, 'Yes')] }, [`${tw}/${D}/links`]: DEC_LINKS });
    await expect(tool(fromEnd.session).handler({ ...relabel, ticketId: A, targetId: D, label: 'NO' })).rejects.toThrow('already labelled "NO"');
    await tool(fromEnd.session).handler({ ...relabel, ticketId: A, targetId: D, label: 'Approved' });
    expect(fromEnd.batches).toHaveLength(1);
    expect(fromEnd.batches[0]!.map((e) => [(e['entity'] as { id: string }).id, payload(e)['targetId']])).toEqual([[D, A], [D, A]]);
  });

  const refuse = { status: 'refused', eventId: 'e', rule: 'link.label-duplicate', reason: 'Another branch already has this label.' };

  it('29.376 a refused add after a committed remove puts the old link back; if that is refused too, the error names the label to re-add', async () => {
    const putBack = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: (i) => (i === 0 ? [COMMITTED, refuse] : undefined) });
    await expect(tool(putBack.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
      .rejects.toThrow(/^event 1 refused by link\.label-duplicate: Another branch already has this label\. The previous link was put back, so nothing changed\.$/);
    expect(putBack.batches).toHaveLength(2);
    expect(putBack.batches[1]).toHaveLength(1);
    expect(putBack.batches[1]![0]).toMatchObject({ type: 'ticket.link_added', entity: { id: D }, payload: { kind: 'leads_to', targetId: A, label: 'Yes' } });

    const stuck = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: (i) => (i === 0 ? [COMMITTED, refuse] : [refuse]) });
    await expect(tool(stuck.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
      .rejects.toThrow(/^event 1 refused by link\.label-duplicate: Another branch already has this label\. The previous link could NOT be put back: add it again with link_tickets \(action "add", label "Yes"\)\.$/);
    // a put-back whose answer cannot be trusted is not claimed as put back
    const unsure = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: (i) => (i === 0 ? [COMMITTED, refuse] : []) });
    await expect(tool(unsure.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' })).rejects.toThrow('could NOT be put back');
    expect(unsure.batches).toHaveLength(2);
    // an invalid add is spelled in its own words too
    const invalid = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: (i) => (i === 0 ? [COMMITTED, { status: 'invalid', eventId: null, code: 'payload_invalid', message: 'label is too long' }] : undefined) });
    await expect(tool(invalid.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
      .rejects.toThrow(/^event 1 payload_invalid: label is too long\. The previous link was put back, so nothing changed\.$/);
  });

  it('29.376 a refused remove is said in its own words and nothing is put back; an answer that cannot be trusted claims nothing', async () => {
    const both = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: () => [refuse, refuse] });
    await expect(tool(both.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
      .rejects.toThrow(/^event 0 refused by link\.label-duplicate: Another branch already has this label\.$/);
    expect(both.batches).toHaveLength(1);
    const addOnly = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: () => [refuse, COMMITTED] });
    await expect(tool(addOnly.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
      .rejects.toThrow(/^event 0 refused by link\.label-duplicate: Another branch already has this label\. The link with the new label was added\.$/);
    expect(addOnly.batches).toHaveLength(1);
    const short = fakeFlow({ ...ENDS, [`${tw}/${D}/links`]: DEC_LINKS }, { results: () => [COMMITTED] });
    await expect(tool(short.session).handler({ ...relabel, ticketId: D, targetId: A, label: 'Approved' }))
      .rejects.toThrow(/^gisik-nokma did not report whether the relabel happened, so the link may be gone or relabelled: read it again with get_ticket before doing anything else \(the answer did not carry one result for each of the 2 events\)$/);
    expect(short.batches, 'nothing is put back on an answer that cannot be trusted').toHaveLength(1);
  });
});
