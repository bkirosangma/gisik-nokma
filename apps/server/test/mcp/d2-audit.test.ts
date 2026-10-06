import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { domainRegistry } from '@gisik-nokma/domain';
import { HISTORY_RENDERED_TYPES } from '@gisik-nokma/app-core';
import { KNOWN_D2_GAPS, MCP_WRITE_AUDIT, type D2Act, type D2Leg, type WriteAudit } from '@gisik-nokma/mcp-server';

/**
 * Knowledge Graph spec D §7 case 8 (D2), KG-D Task 7. Cases 27.517–27.518 and 27.671–27.672: the server half of the
 * audit. For every MCP write tool's row in `packages/mcp-server/src/tools/write-audit.ts`, and for each of the row's
 * `paths` (a branch other than the primary act), each event it posts is rendered by History (`HISTORY_RENDERED_TYPES`,
 * app-core), the app shows the result (a file holding the marker), and a member has a registered event to undo it.
 * The failures, keyed `<tool>` and `<tool>#<path>`, EQUAL the frozen ratchet `KNOWN_D2_GAPS`, which may only shrink.
 * Every event type a row declares, and every `remove` type of a row or of one of its paths, is a registered domain type.
 *
 * The server can read both lists because `@gisik-nokma/mcp-server` and `@gisik-nokma/app-core` are already its
 * dependencies (`apps/server/package.json:36` and `:53`). The MCP half (27.515–27.516, 27.670) is
 * `packages/mcp-server/test/d2-audit.test.ts`.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The tool's own (primary-act) legs: its row judged whole. */
function failuresOf(tool: string): D2Leg[] {
  return legsOf(MCP_WRITE_AUDIT[tool]!);
}

/** The missing legs of ONE act, a row or a path; split out so the controls can hand it an act with one field changed. */
function legsOf(audit: D2Act): D2Leg[] {
  const missing: D2Leg[] = [];
  if (audit.events.some((type) => !HISTORY_RENDERED_TYPES.includes(type))) missing.push('history');
  const file = audit.surface === null ? null : `${ROOT}${audit.surface.file}`;
  if (audit.surface === null || file === null || !existsSync(file) || !readFileSync(file, 'utf8').includes(audit.surface.marker)) missing.push('surface');
  if (audit.remove === null || !domainRegistry.hasType(audit.remove)) missing.push('remove');
  return missing;
}

/** Every failing key of an audit: each tool (its row) and each `<tool>#<path>` (that path judged by its own legs). */
function failuresByKey(audit: Readonly<Record<string, WriteAudit>>): Record<string, D2Leg[]> {
  const judged = Object.entries(audit).flatMap(([tool, row]): [string, D2Leg[]][] => [
    [tool, legsOf(row)],
    ...Object.entries(row.paths ?? {}).map(([path, act]): [string, D2Leg[]] => [`${tool}#${path}`, legsOf(act)]),
  ]);
  return Object.fromEntries(judged.filter(([, legs]) => legs.length > 0));
}

/**
 * 27.518: each declared `remove` type the domain registry does not know, a row's (`<tool> remove: <type>`) or one of its
 * paths' (`<tool>#<path> remove: <type>`). A null `remove` (no undo) is the remove leg's business (27.517), not this one's.
 */
function unregisteredRemoves(audit: Readonly<Record<string, WriteAudit>>): string[] {
  const acts = Object.entries(audit).flatMap(([tool, row]): [string, D2Act][] => [
    [tool, row],
    ...Object.entries(row.paths ?? {}).map(([path, act]): [string, D2Act] => [`${tool}#${path}`, act]),
  ]);
  return acts.flatMap(([key, act]) => (act.remove !== null && !domainRegistry.hasType(act.remove) ? [`${key} remove: ${act.remove}`] : []));
}

/** 27.671: a ratchet key `<tool>#<path>` names a `paths` entry of that tool's row. */
function namesAPath(key: string, audit: Readonly<Record<string, WriteAudit>>): boolean {
  const [tool, path] = key.split('#');
  return path !== undefined && audit[tool!]?.paths?.[path] !== undefined;
}

describe('27.517–27.518, 27.671–27.672 the D2 audit: rendered by history, on an app surface, with a remove path, per tool and per path', () => {
  it('27.517 the computed failures of every tool and every path EQUAL the frozen ratchet (it may only shrink); control: the concept tools pass history', () => {
    // Control: ROOT is the repo root. A wrong ROOT fails EVERY surface leg, and the first run's paste would freeze that.
    expect(existsSync(`${ROOT}packages/app-core/src/views/history-copy.ts`)).toBe(true);
    const actual = failuresByKey(MCP_WRITE_AUDIT);
    expect(Object.keys(actual).filter((key) => key.includes('#')).length).toBeGreaterThan(5); // the paths are judged
    const frozen = Object.fromEntries(Object.entries(KNOWN_D2_GAPS).map(([tool, gap]) => [tool, [...gap.missing]]));
    expect(actual, 'A tool or path newly failing D2 must be fixed; a fixed one must be REMOVED from KNOWN_D2_GAPS').toEqual(frozen);
    for (const tool of ['manage_concept', 'tag_items', 'link_concepts', 'resolve_suggestion']) expect(failuresOf(tool)).not.toContain('history');
    // Control, on each leg's clauses, from a row that passes all three: one changed field gains exactly that leg.
    const row = MCP_WRITE_AUDIT['add_comment']!;
    expect(legsOf(row)).toEqual([]);
    expect(legsOf({ ...row, events: [...row.events, 'note.renamed'] })).toEqual(['history']); // one unrendered type of two
    expect(legsOf({ ...row, surface: null })).toEqual(['surface']);
    expect(legsOf({ ...row, surface: { ...row.surface!, file: `${row.surface!.file}.gone` } })).toEqual(['surface']);
    expect(legsOf({ ...row, surface: { ...row.surface!, marker: 'gn-no-such-marker' } })).toEqual(['surface']);
    expect(legsOf({ ...row, remove: null })).toEqual(['remove']);
  });

  it('27.518 every declared event type, and every remove type of a row or of one of its paths, is registered; controls: a made-up remove type on a path or a row is reported, and fails the remove leg', () => {
    let declared = 0;
    for (const [tool, audit] of Object.entries(MCP_WRITE_AUDIT)) {
      for (const type of audit.events) {
        declared += 1;
        expect(domainRegistry.hasType(type), `${tool}: ${type}`).toBe(true);
      }
    }
    expect(declared).toBeGreaterThan(0);
    expect(unregisteredRemoves(MCP_WRITE_AUDIT), 'a declared remove type must be a registered domain type').toEqual([]);
    // Control, through the same check: an in-test update_ticket whose reparent path undoes with an unregistered type is
    // reported by its path key, and alone (27.517 cannot see it: null and an unregistered type fail the same leg).
    expect(domainRegistry.hasType('ticket.unparented')).toBe(false);
    const ticket = MCP_WRITE_AUDIT['update_ticket']!;
    const unparented = { ...ticket, paths: { ...ticket.paths, reparent: { ...ticket.paths!['reparent']!, remove: 'ticket.unparented' } } };
    expect(unregisteredRemoves({ ...MCP_WRITE_AUDIT, update_ticket: unparented })).toEqual(['update_ticket#reparent remove: ticket.unparented']);
    // Control, on a row's own remove: the manage_concept row with only `remove` changed is reported by its tool, and gains
    // the 'remove' leg; without the change it does neither.
    const row = MCP_WRITE_AUDIT['manage_concept']!;
    expect(domainRegistry.hasType('concept.unmade')).toBe(false);
    expect(unregisteredRemoves({ ...MCP_WRITE_AUDIT, manage_concept: { ...row, remove: 'concept.unmade' } })).toEqual(['manage_concept remove: concept.unmade']);
    expect(legsOf(row)).not.toContain('remove');
    expect(legsOf({ ...row, remove: 'concept.unmade' })).toContain('remove');
  });

  it('27.671 each <tool>#<path> key of the ratchet names a real paths entry; control: a made-up path key is reported', () => {
    const pathKeys = Object.keys(KNOWN_D2_GAPS).filter((key) => key.includes('#'));
    expect(pathKeys.length).toBeGreaterThan(5);
    for (const key of pathKeys) expect(namesAPath(key, MCP_WRITE_AUDIT), `${key}: no such path on its tool's row`).toBe(true);
    expect(namesAPath('update_ticket#nope', MCP_WRITE_AUDIT)).toBe(false); // control: a path the row does not have
    expect(namesAPath('no_such_tool#reparent', MCP_WRITE_AUDIT)).toBe(false); // control: a tool the audit does not have
  });

  it('27.672 a path is judged by its OWN legs; control: the real update_ticket#reparent fails remove', () => {
    const row = MCP_WRITE_AUDIT['update_ticket']!;
    expect(failuresByKey(MCP_WRITE_AUDIT)['update_ticket#reparent']).toContain('remove'); // control
    const reparent = row.paths!['reparent']!;
    const fixed = { ...MCP_WRITE_AUDIT, update_ticket: { ...row, paths: { ...row.paths, reparent: { ...reparent, remove: 'ticket.deleted' } } } };
    expect(domainRegistry.hasType('ticket.deleted')).toBe(true);
    expect(failuresByKey(fixed)['update_ticket#reparent'] ?? []).not.toContain('remove');
    expect(failuresByKey(fixed)['update_ticket']).toEqual(failuresByKey(MCP_WRITE_AUDIT)['update_ticket']); // the tool's own legs unmoved
  });
});
