import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { domainRegistry } from '@gisik-nokma/domain';
import { HISTORY_RENDERED_TYPES } from '@gisik-nokma/app-core';
import { KNOWN_D2_GAPS, MCP_WRITE_AUDIT, type D2Leg, type WriteAudit } from '@gisik-nokma/mcp-server';

/**
 * Knowledge Graph spec D §7 case 8 (D2), KG-D Task 7. Cases 27.517–27.518: the server half of the audit. For every
 * MCP write tool's row in `packages/mcp-server/src/tools/write-audit.ts`, each event it posts is rendered by History
 * (`HISTORY_RENDERED_TYPES`, app-core), the app shows the result (a file holding the row's marker), and a member has a
 * registered event to undo it. The failures EQUAL the frozen ratchet `KNOWN_D2_GAPS`, which may only shrink.
 *
 * The server can read both lists because `@gisik-nokma/mcp-server` and `@gisik-nokma/app-core` are already its
 * dependencies (`apps/server/package.json:36` and `:53`). The MCP half (27.515–27.516) is
 * `packages/mcp-server/test/d2-audit.test.ts`.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function failuresOf(tool: string): D2Leg[] {
  return legsOf(MCP_WRITE_AUDIT[tool]!);
}

/** The missing legs of ONE audit row; split out so the controls can hand it a row with one field changed. */
function legsOf(audit: WriteAudit): D2Leg[] {
  const missing: D2Leg[] = [];
  if (audit.events.some((type) => !HISTORY_RENDERED_TYPES.includes(type))) missing.push('history');
  const file = audit.surface === null ? null : `${ROOT}${audit.surface.file}`;
  if (audit.surface === null || file === null || !existsSync(file) || !readFileSync(file, 'utf8').includes(audit.surface.marker)) missing.push('surface');
  if (audit.remove === null || !domainRegistry.hasType(audit.remove)) missing.push('remove');
  return missing;
}

describe('27.517–27.518 the D2 audit: rendered by history, on an app surface, with a remove path', () => {
  it('27.517 the computed failures EQUAL the frozen ratchet (it may only shrink); control: the concept tools pass history', () => {
    // Control: ROOT is the repo root. A wrong ROOT fails EVERY surface leg, and the first run's paste would freeze that.
    expect(existsSync(`${ROOT}packages/app-core/src/views/history-copy.ts`)).toBe(true);
    const actual = Object.fromEntries(Object.keys(MCP_WRITE_AUDIT).map((tool) => [tool, failuresOf(tool)]).filter(([, legs]) => (legs as D2Leg[]).length > 0));
    const frozen = Object.fromEntries(Object.entries(KNOWN_D2_GAPS).map(([tool, gap]) => [tool, [...gap.missing]]));
    expect(actual, 'A tool newly failing D2 must be fixed; a fixed one must be REMOVED from KNOWN_D2_GAPS').toEqual(frozen);
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

  it('27.518 every declared event and remove type is registered; control: a made-up remove type fails the remove leg', () => {
    let declared = 0;
    for (const [tool, audit] of Object.entries(MCP_WRITE_AUDIT)) {
      for (const type of audit.events) {
        declared += 1;
        expect(domainRegistry.hasType(type), `${tool}: ${type}`).toBe(true);
      }
      if (audit.remove !== null) expect(domainRegistry.hasType(audit.remove), `${tool} remove: ${audit.remove}`).toBe(true);
    }
    expect(declared).toBeGreaterThan(0);
    // Control, on the SUBJECT: the same audit row with only `remove` changed gains the 'remove' leg, and without the change does not.
    const row = MCP_WRITE_AUDIT['manage_concept']!;
    expect(legsOf(row)).not.toContain('remove');
    expect(legsOf({ ...row, remove: 'concept.unmade' })).toContain('remove');
  });
});
