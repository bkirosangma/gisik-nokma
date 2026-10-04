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
const NAMES = ['canOpen', 'ticketAccess', 'isOpenableDraft', 'holdsDraftRights', 'listMyDrafts'] as const;
type Name = (typeof NAMES)[number];
type Calls = Record<Name, number>;

export function countDoorCalls(text: string): Calls {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const counts: Calls = { canOpen: 0, ticketAccess: 0, isOpenableDraft: 0, holdsDraftRights: 0, listMyDrafts: 0 };
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

/** Every door of group D, per file. T9 adds G10 (routes/attachments.ts, routes/tickets.ts) and G11 (check-permission.ts). */
const DOORS: Record<string, Partial<Calls>> = {
  'permissions/check-permission.ts': { ticketAccess: 1 }, // G1
  'read/drafts.ts': { holdsDraftRights: 1 }, // listMyDrafts holds each row to R18, the same function the doors use
  'routes/drafts.ts': { listMyDrafts: 2 }, // G8, both reads
  'routes/tickets.ts': { canOpen: 3 }, // G7: the detail read, the parent crumb, the epic walk
  'sync/contests-route.ts': { canOpen: 1 }, // G6
  'sync/reconcile-route.ts': { canOpen: 1 }, // G5
  'sync/sync-routes.ts': { canOpen: 1, listMyDrafts: 1 }, // G3, G4
  'visibility/can-open.ts': { ticketAccess: 1, isOpenableDraft: 1, holdsDraftRights: 1 }, // canOpen is ticketAccess; ticketAccess is canSee then isOpenableDraft; R18
  'visibility/visible-events-for.ts': { canOpen: 1, ticketAccess: 1 }, // G2, and C4's own-draft test
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

describe('28.084 the doors census', () => {
  it('counts calls, not prose, and every door call in apps/server/src is in the table', () => {
    // CONTROL: the machinery can fail. A string that only names a door is not a call; a planted call is.
    expect(countDoorCalls("const note = 'canOpen(db, u, id) is a door'; await canOpen(db, u, id); ticketAccess(a, b, c); // isOpenableDraft(x)")).toEqual({
      canOpen: 1, ticketAccess: 1, isOpenableDraft: 0, holdsDraftRights: 0, listMyDrafts: 0,
    });
    expect(scan()).toEqual(DOORS);
  });
});
