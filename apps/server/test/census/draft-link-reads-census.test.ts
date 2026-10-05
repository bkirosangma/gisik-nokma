import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

/** Every file under `apps/server/src` that names the link table, and why it may. A reader of the table must answer for drafts (R41, R42). */
const READERS: Record<string, string> = {
  'flow/flow-view.ts': "the Workflow graph's blocks read (wtg3 T3, 29.243): both ends must be among the ids Part 2's walk already admitted for this viewer (LIVE_TICKET_WHERE and visibleTicketsWhere, or their own drafts), so no blocks link to a hole or to someone else's draft is read",
  'flow/read-flow.ts': "the flow read (wtg2 T12): the ring statement walks leads_to only, and an end is admitted through LIVE_TICKET_WHERE and visibleTicketsWhere or as the viewer's own draft (listMyDrafts); the closing statement keeps a link only when both ends were admitted, so no edge to someone else's draft (29.188)",
  'projections/ticket-links.ts': 'writes the table, keyed by from ?? entity (drafts R42)',
  'projections/tickets.ts': "a docblock naming the table as the queryable copy of TicketState.links; it reads nothing from it",
  'purge/erasure.ts': 'deletes the rows naming an erased ticket, either end (28.102)',
  'purge/table-rules.ts': 'declares the table erase-by-id for the purge registry',
  'read/graph-neighbours.ts': "the KG ring: an edge is shown only when both ends pass createGraphVisibility.resolve (LIVE_TICKET_WHERE and visibleTicketsWhere), so a draft end never shows, the author's included (28.117)",
  'read/ticket-links.ts': 'the links read: visible ends only, own drafts only on a draft sheet (28.117)',
};

export function filesNaming(table: string, root: string = SRC): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts') && readFileSync(full, 'utf8').includes(table)) out.push(relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

describe('28.127 the link-table census', () => {
  it('lists every file that names proj_ticket_links; a planted reader is reported', () => {
    const expected = Object.keys(READERS).sort();
    expect(filesNaming('proj_ticket_links')).toEqual(expected);
    // CONTROL: the machinery can fail. A planted reader is reported, and removed again.
    const planted = join(SRC, '__planted_link_reader.ts');
    writeFileSync(planted, "export const q = 'SELECT * FROM proj_ticket_links';\n");
    try {
      expect(filesNaming('proj_ticket_links')).toEqual([...expected, '__planted_link_reader.ts'].sort());
    } finally {
      rmSync(planted);
    }
    expect(filesNaming('proj_ticket_links')).toEqual(expected);
  });
});
