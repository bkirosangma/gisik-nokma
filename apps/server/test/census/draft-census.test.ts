import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Drafts T3, case 28.050 (spec §4.2): every `proj_tickets` / `proj_visibility` SQL literal and every `canSee(`,
 * `canSeeResolved(`, `getResolvedVisibility(` call in `apps/server/src` is accounted for, per file and per kind,
 * in groups A (the predicates), B (closed by A, no edit), C (edited: bypasses both), D (doors, T4) and E (no
 * viewer in scope). A new file, a moved count or a deleted site fails and prints the line to paste.
 */

type Group = 'A' | 'B' | 'C' | 'D' | 'E';
type Counts = { tickets: number; visibility: number; canSee: number; resolved: number; getResolved: number };
type Site = Counts & { groups: readonly Group[]; why: string };

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const SQL = (table: string): RegExp => new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+${table}\\b`, 'i');

/** The five counts of one source text. Template expressions are not descended into (a nested literal is one site). */
export function countSites(text: string, fileName = 'x.ts'): Counts {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const counts: Counts = { tickets: 0, visibility: 0, canSee: 0, resolved: 0, getResolved: 0 };
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const t = n.getText(sf);
      if (SQL('proj_tickets').test(t)) counts.tickets += 1;
      if (SQL('proj_visibility').test(t)) counts.visibility += 1;
      if (ts.isTemplateExpression(n)) return;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (n.expression.text === 'canSee') counts.canSee += 1;
      if (n.expression.text === 'canSeeResolved') counts.resolved += 1;
      if (n.expression.text === 'getResolvedVisibility') counts.getResolved += 1;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return counts;
}

const total = (c: Counts): number => c.tickets + c.visibility + c.canSee + c.resolved + c.getResolved;
const line = (file: string, c: Counts): string =>
  `'${file}': { tickets: ${c.tickets}, visibility: ${c.visibility}, canSee: ${c.canSee}, resolved: ${c.resolved}, getResolved: ${c.getResolved}, groups: [], why: '' },`;

function scanSource(): Record<string, Counts> {
  const out: Record<string, Counts> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) {
        const c = countSites(readFileSync(path, 'utf8'), path);
        if (total(c) > 0) out[relative(SRC, path)] = c;
      }
    }
  };
  walk(SRC);
  return out;
}

/** What is wrong between the table and the source, one line each (empty when they agree). */
export function problems(table: Record<string, Counts>, scanned: Record<string, Counts>): string[] {
  const out: string[] = [];
  for (const [file, c] of Object.entries(scanned)) {
    const listed = table[file];
    if (listed === undefined) out.push(`UNLISTED ${line(file, c)}`);
    else if (JSON.stringify([listed.tickets, listed.visibility, listed.canSee, listed.resolved, listed.getResolved]) !== JSON.stringify([c.tickets, c.visibility, c.canSee, c.resolved, c.getResolved])) {
      out.push(`MOVED ${line(file, c)}  (table says ${JSON.stringify([listed.tickets, listed.visibility, listed.canSee, listed.resolved, listed.getResolved])})`);
    }
  }
  for (const file of Object.keys(table)) if (scanned[file] === undefined) out.push(`STALE ${file} has no site any more: delete its row`);
  return out;
}

/**
 * Measured on task/drafts-t3-projections after Steps 2 to 6 (the plan's 40 rows were measured on ec72d1f8;
 * the KG series added `read/graph-neighbours.ts` and `read/item-visibility.ts`). `projections/references.ts`
 * (errata E1) is not a row: its draft arm reads the ledger, not `proj_tickets`; 28.068 is its guard.
 */
const CENSUS: Record<string, Site> = {
  'auto-close/sweep.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['B', 'C'], why: "the candidate query ANDs LIVE_TICKET_WHERE; C7 adds 'ticket.published' to the entered-state read (:181); the NOT EXISTS child clause moves in T5" },
  'notifications/fanout.ts': { tickets: 0, visibility: 0, canSee: 1, resolved: 0, getResolved: 0, groups: ['B'], why: "every recipient is gated by canSeeTicket (:85), so no draft notice leaves the author's hands; the publish arm is T5" },
  'notifications/sweep.ts': { tickets: 3, visibility: 0, canSee: 1, resolved: 0, getResolved: 0, groups: ['B', 'C'], why: "the due and stale queries AND LIVE_TICKET_WHERE; C7 adds 'ticket.published' to the entered-state read (:259)" },
  'permissions/check-lifecycle.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'engine: the project id of the ticket a lifecycle mark names; no viewer' },
  'permissions/check-permission.ts': { tickets: 0, visibility: 0, canSee: 3, resolved: 0, getResolved: 1, groups: ['B', 'D', 'E'], why: 'canSee at :1556 (note create-with-ticket, closed by A); G1 at :1639 and G11 at :1585 become doors in T4; getResolvedVisibility at :1689 is the visibility.set authority read, behind G1' },
  'projections/note-search.ts': { tickets: 2, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['B', 'E'], why: 'ticketTextOf ANDs LIVE_TICKET_WHERE (:259); the project reindex (:218) selects note ids only' },
  'projections/proj-visibility.ts': { tickets: 0, visibility: 7, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'the projection itself; T3 writes draft_author_id here' },
  'projections/rollups.ts': { tickets: 7, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['C'], why: 'C1: recomputeParent and recomputeProject count children' },
  'projections/tickets.ts': { tickets: 4, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: "the projection and the engine's by-id readers; they must see drafts (R40)" },
  'purge/erasure.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'erasure set and table rules; no viewer' },
  'purge/purge-item.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'the purge transaction; no viewer' },
  'purge/sweep.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'the scheduled purge; T5 adds the draft arm' },
  'read/ancestry.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'ancestor chain through visibleTicketsWhere and LIVE_TICKET_WHERE; no legal ledger holds a published ticket under a draft (R4)' },
  'read/deleted-items.ts': { tickets: 3, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['B', 'C'], why: 'C3: containedCount; the listing at :178 reads soft-deleted rows, which a draft never is' },
  'read/graph-neighbours.ts': { tickets: 4, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: "the KG ring: every edge end passes createGraphVisibility.resolve (LIVE_TICKET_WHERE and visibleTicketsWhere) before it is shown or walked, and no hidden-link count exists (27.293); the raw proj_tickets edge reads only propose ends" },
  'read/item-visibility.ts': { tickets: 2, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'hiddenItems: the live set and the visible set both AND LIVE_TICKET_WHERE, so a draft is neither live nor hidden (a concept is not refused over it)' },
  'read/live-ticket.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'ticketIsLive asks LIVE_TICKET_WHERE; T9 adds the openable twin' },
  'read/notes.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'attachedTicketsByNote ANDs LIVE_TICKET_WHERE and visibleTicketsWhere' },
  'read/restricted-parents.ts': { tickets: 0, visibility: 1, canSee: 0, resolved: 1, getResolved: 0, groups: ['C'], why: 'the canSeeResolved literal carries draftAuthorId; a draft parent is never offered to the assignee arm' },
  'read/ticket-cards.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'a by-id fetch whose callers carry the predicates (its docblock, :85-95)' },
  'read/visible-where.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['A', 'B'], why: 'A3 and A4 live here; the note inherit arm (:299) ANDs LIVE_TICKET_WHERE' },
  'read/workspace-counts.ts': { tickets: 2, visibility: 2, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'visibleProjectCounts and ticketVisibleProjectIds use both predicates' },
  'routes/attachments.ts': { tickets: 0, visibility: 0, canSee: 2, resolved: 0, getResolved: 1, groups: ['B', 'D'], why: 'upload :412 and download :627 are G10 (T9); until then closed for the author too' },
  'routes/attention.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'both predicates are ANDed into the read' },
  'routes/board.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'both predicates are ANDed into the read' },
  'routes/builder-reads.ts': { tickets: 6, visibility: 1, canSee: 1, resolved: 0, getResolved: 0, groups: ['B', 'C'], why: 'C5 at :1084 and the hidden loop at :1105, the longhand twin at :604; the rest use LIVE_TICKET_WHERE or visibleTicketsWhere' },
  'routes/list.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'both predicates are ANDed into the read' },
  'routes/my-work.ts': { tickets: 3, visibility: 2, canSee: 1, resolved: 0, getResolved: 0, groups: ['B'], why: 'assigned, shared and titles use both predicates; the contest roster (:333) is gated by canSee (:367)' },
  'routes/search.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: 'both predicates; proj_search rows exist for drafts and are read only through this join' },
  'routes/ticket-history.ts': { tickets: 0, visibility: 0, canSee: 1, resolved: 0, getResolved: 0, groups: ['B'], why: "canSee (:281); the author's History is T4" },
  'routes/tickets.ts': { tickets: 0, visibility: 1, canSee: 6, resolved: 0, getResolved: 0, groups: ['B', 'D'], why: 'canSee at :372 (G7) and :864 (G10); :426 :674 :725 :952 stay closed for the author' },
  'sync/contests-route.ts': { tickets: 1, visibility: 0, canSee: 1, resolved: 0, getResolved: 0, groups: ['D'], why: 'G6: the contests roster, canOpen in T4' },
  'sync/reconcile-route.ts': { tickets: 0, visibility: 0, canSee: 1, resolved: 0, getResolved: 0, groups: ['D'], why: 'G5: reconcile, canOpen in T4' },
  'sync/snapshot-refresh.ts': { tickets: 1, visibility: 0, canSee: 0, resolved: 0, getResolved: 0, groups: ['E'], why: 'the workflow-publish refresh folds every ticket forward, drafts included (R40, 28.066)' },
  'sync/sync-routes.ts': { tickets: 0, visibility: 0, canSee: 1, resolved: 0, getResolved: 0, groups: ['D'], why: "G3 single bootstrap (:434); G4 appends the author's drafts to listVisibleTickets (T4)" },
  'visibility/assignee-arm.ts': { tickets: 2, visibility: 2, canSee: 0, resolved: 0, getResolved: 0, groups: ['A'], why: 'the arm; canSee returns before it for a draft and visibleTicketsWhere ANDs the draft clause around it' },
  'visibility/can-read-note.ts': { tickets: 0, visibility: 0, canSee: 0, resolved: 1, getResolved: 1, groups: ['B'], why: 'spreads getResolvedVisibility, so the flag arrives with no edit; attached tickets pass ticketIsLive first' },
  'visibility/can-see.ts': { tickets: 0, visibility: 1, canSee: 0, resolved: 1, getResolved: 1, groups: ['A'], why: 'A1 canSeeResolved and A2 canSee, edited in this task' },
  'visibility/grant-backfill.ts': { tickets: 0, visibility: 1, canSee: 1, resolved: 0, getResolved: 0, groups: ['B'], why: 'every id in a reach notice passes canSee (:363)' },
  'visibility/rollup.ts': { tickets: 1, visibility: 1, canSee: 0, resolved: 1, getResolved: 0, groups: ['C'], why: "C2: the viewer's child tally and restrictedCount" },
  'visibility/visible-events-for.ts': { tickets: 0, visibility: 2, canSee: 2, resolved: 0, getResolved: 0, groups: ['C', 'D'], why: 'C4 nowInvisibleTicketsInScope (:355 and :359, skip at :369); G2 the stream (:498)' },
  'visibility/visible-tickets.ts': { tickets: 0, visibility: 1, canSee: 0, resolved: 0, getResolved: 0, groups: ['B'], why: "listVisibleTickets is visibleTicketsWhere; G4 appends the author's drafts in T4" },
};

describe('28.050 the draft census', () => {
  it('reports a planted site, ignores prose, and accounts for every site in apps/server/src', () => {
    // CONTROL first: the machinery can fail. A planted reader of the table is UNLISTED; prose naming the table is not a site.
    const planted = countSites(
      "const q = 'SELECT 1 FROM proj_tickets t'; await canSee(db, u, id); const prose = 'proj_tickets holds the tickets'; const w = `UPDATE proj_visibility SET x = ${y}`;",
    );
    expect(planted).toEqual({ tickets: 1, visibility: 1, canSee: 1, resolved: 0, getResolved: 0 });
    expect(problems({}, { 'routes/planted.ts': planted })).toEqual([expect.stringContaining('UNLISTED')]);
    expect(problems({ 'routes/planted.ts': { ...planted, groups: ['B'], why: 'x' } }, {})).toEqual([expect.stringContaining('STALE')]);

    expect(problems(CENSUS, scanSource())).toEqual([]);
  });

  it('every row names a group and a reason', () => {
    for (const [file, site] of Object.entries(CENSUS)) {
      expect(site.groups.length, file).toBeGreaterThan(0);
      expect(site.why.length, `${file}: say why`).toBeGreaterThanOrEqual(20);
    }
  });
});
