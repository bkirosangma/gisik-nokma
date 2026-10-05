import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Drafts T4, case 28.084 (spec §4.2, group D): every CALL of a door function in `apps/server/src`, per file, so a
 * door cannot be added, moved or removed unseen. The names are every export of `visibility/can-open.ts` plus
 * `listMyDrafts`: a door built on `isOpenableDraft` or `holdsDraftRights` directly would skip `canSee` (or R18),
 * so those are counted too, not only the two functions the plan's doors call. Calls are counted from the AST,
 * so prose and string literals naming a function are not calls.
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const NAMES = ['canOpen', 'ticketAccess', 'isOpenableDraft', 'holdsDraftRights', 'listMyDrafts', 'isClosedOrErasedDraft', 'noteEventVisibleTo'] as const;
type Name = (typeof NAMES)[number];
type Calls = Record<Name, number>;

export function countDoorCalls(text: string): Calls {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const counts: Calls = { canOpen: 0, ticketAccess: 0, isOpenableDraft: 0, holdsDraftRights: 0, listMyDrafts: 0, isClosedOrErasedDraft: 0, noteEventVisibleTo: 0 };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if ((NAMES as readonly string[]).includes(name)) counts[name as Name] += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return counts;
}

/** Every door of group D, per file. G10 is routes/attachments.ts and the fourth canOpen of routes/tickets.ts; G11 is check-permission.ts's canOpen; the note-event doors are noteEventVisibleTo and isClosedOrErasedDraft. */
const DOORS: Record<string, Partial<Calls>> = {
  'flow/read-flow.ts': { listMyDrafts: 1 }, // the flow read admits the viewer's own drafts as walk ends; never called for viewerId null (wtg2 T12, 29.188)
  'permissions/check-permission.ts': { ticketAccess: 1, canOpen: 3 }, // G1; G11 (T9, 28.191); the link block's other ends (drafts T6, 28.114) and the pending child (28.128)
  'read/drafts.ts': { holdsDraftRights: 1 }, // listMyDrafts holds each row to R18, the same function the doors use
  'read/notes.ts': { holdsDraftRights: 1 }, // the note detail's own-draft rows (attachedTicketsByNote ownDrafts), R18
  'read/ticket-links.ts': { listMyDrafts: 1 }, // the author's own drafts as ends, on a draft's own sheet only (drafts T6, 28.117)
  'routes/attachments.ts': { canOpen: 2 }, // G10: upload, download
  'routes/drafts.ts': { listMyDrafts: 2 }, // G8, both reads
  'routes/flow.ts': { ticketAccess: 1 }, // the flow route's seed: a visible ticket or the author's own draft, then its liveness in the PATH's workspace (wtg3 T3, 29.244; planner ruling 2026-10-04 T3-Q1)
  'routes/drafts-publish.ts': { ticketAccess: 1 }, // the set publish (drafts T5b): the first id the caller cannot open refuses the set before ingest (28.098)
  'routes/notes.ts': { isClosedOrErasedDraft: 1, noteEventVisibleTo: 1 }, // the ticket's notes list, the note events route
  'routes/people.ts': { isOpenableDraft: 1 }, // R8 (drafts T5): the outsider door refuses an assignment on the caller's own draft
  'routes/ticket-links.ts': { ticketAccess: 1 }, // the links route: a draft is the unknown-ticket body to everyone but its author (drafts T6, 28.117)
  'routes/tickets.ts': { canOpen: 4 }, // G7: the detail read, the parent crumb, the epic walk; G10: the attachments list
  'sync/contests-route.ts': { canOpen: 1 }, // G6
  'sync/reconcile-route.ts': { canOpen: 1 }, // G5
  'sync/sync-routes.ts': { canOpen: 1, listMyDrafts: 1, noteEventVisibleTo: 1 }, // G3, G4, the bootstrap notes tail
  'visibility/can-open.ts': { ticketAccess: 1, isOpenableDraft: 2, holdsDraftRights: 1, isClosedOrErasedDraft: 1 }, // canOpen is ticketAccess; ticketAccess is canSee then isOpenableDraft; R18; isClosedOrErasedDraft asks isOpenableDraft; noteEventVisibleTo asks isClosedOrErasedDraft
  'visibility/visible-events-for.ts': { canOpen: 1, ticketAccess: 1, noteEventVisibleTo: 1 }, // G2, C4's own-draft test, the note arm
  'visibility/withhold-link-targets.ts': { canOpen: 1 }, // targetSight: every door's link-end predicate; the author's own draft end is served (drafts T6, 28.117-28.119)
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function scan(): Record<string, Partial<Calls>> {
  const found: Record<string, Partial<Calls>> = {};
  for (const file of walk(SRC)) {
    const counts = countDoorCalls(readFileSync(file, 'utf8'));
    const present = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    if (Object.keys(present).length > 0) found[relative(SRC, file)] = present;
  }
  return found;
}

describe('28.084 the doors census, and 28.193 its G10, G11 and note-event rows', () => {
  it('counts calls, not prose, and every door call in apps/server/src is in the table', () => {
    // CONTROL: the machinery can fail. A string that only names a door is not a call; a planted call is.
    expect(countDoorCalls("const note = 'canOpen(db, u, id) is a door'; await canOpen(db, u, id); ticketAccess(a, b, c); // isOpenableDraft(x)")).toEqual({
      canOpen: 1, ticketAccess: 1, isOpenableDraft: 0, holdsDraftRights: 0, listMyDrafts: 0, isClosedOrErasedDraft: 0, noteEventVisibleTo: 0,
    });
    expect(scan()).toEqual(DOORS);
  });
});
