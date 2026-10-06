import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { helpNav } from '../../src/help/groups.js';
import { searchHelp } from '../../src/help/search.js';
import { entryText, type HelpDocument } from '../../src/help/types.js';

/**
 * Knowledge Graph spec D (KG-D Task 9): the manual's §18 "Concepts and suggestions", case 27.546. The words are read
 * from the SECTION (its heading to the next `## ` heading, or the end of the file), never the whole manual: §17 already
 * says Concepts, Confirm, Reject and Semantic layer, so a whole-file grep could not fail. Then against the REAL
 * generated content, as `knowledge-graph-section.test.ts` (27.348) does, so editing `docs/manual.md` without
 * running `node scripts/help-content.mjs` reddens here as well as in `pnpm check:help`.
 */
// a path, not `new URL(…, import.meta.url)`: under jsdom `URL` is jsdom's, which `fileURLToPath` refuses
const MANUAL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/manual.md'), 'utf8');
const HEADING = '## §18 — Concepts and suggestions';
const SECTION_ID = '18-concepts-and-suggestions';
const WORDS = ['Concepts', 'Suggested', 'Confirm', 'Reject', 'Semantic layer'];
const TOOLS = ['list_concepts', 'get_concept', 'manage_concept', 'tag_items', 'review_suggestions'];

/** The section's source: from its heading to the next same-level heading, or the end of the file. */
function sectionSource(): string {
  const at = MANUAL.indexOf(`\n${HEADING}\n`);
  if (at < 0) return '';
  const next = MANUAL.indexOf('\n## ', at + 1);
  return MANUAL.slice(at, next < 0 ? MANUAL.length : next);
}
function manual(): HelpDocument {
  const found = HELP_CONTENT.find((doc) => doc.id === 'manual');
  if (found === undefined) throw new Error('no manual');
  return found;
}

describe('27.546 the manual has §18 "Concepts and suggestions"', () => {
  it('27.546 the section names the row\'s words and the five MCP tools; precondition: it is found, non-empty, and holds no §17 or §16 phrase', () => {
    const source = sectionSource();
    expect(source.length).toBeGreaterThan(HEADING.length + 200);
    // the bound really is this section: §17's fog and §16's Account panel are not in it
    expect(source).not.toContain('the fog');
    expect(source).not.toContain('Connected assistants');
    for (const word of WORDS) expect(source, word).toContain(word);
    for (const tool of TOOLS) expect(source, tool).toContain(tool);
    // §16 keeps its own list: the tools are named in §18, not added to "What your assistant can do"
    const sixteen = MANUAL.slice(MANUAL.indexOf('\n## §16'), MANUAL.indexOf('\n## §17'));
    expect(sixteen.length).toBeGreaterThan(0);
    for (const tool of TOOLS) expect(sixteen, tool).not.toContain(tool);
  });

  it('27.546 the generated help carries §18 after §17, in its own sidebar group, and the help search finds it', () => {
    const ids = manual().sections.map((s) => s.id);
    expect(ids.indexOf(SECTION_ID)).toBe(ids.indexOf('17-the-knowledge-graph') + 1);
    const section = manual().sections.find((s) => s.id === SECTION_ID)!;
    expect(section.title).toBe('§18 — Concepts and suggestions');
    const generated = section.entries.map(entryText).join(' ');
    for (const word of [...WORDS, ...TOOLS, 'Assistant, for']) expect(generated, word).toContain(word);
    const group = helpNav(manual()).find((g) => g.title === 'Concepts');
    expect(group?.sections.map((s) => s.id)).toEqual([SECTION_ID]);
    const inSection = (query: string): boolean => {
      const result = searchHelp(HELP_CONTENT, query, 50);
      return result.kind === 'matches' && result.matches.some((m) => m.document === 'manual' && m.sectionId === SECTION_ID);
    };
    expect(inSection('suggested concept')).toBe(true);
    // CONTROL, same `it`: a term §18 does not contain does not find it.
    expect(inSection('passkey')).toBe(false);
  });
});
