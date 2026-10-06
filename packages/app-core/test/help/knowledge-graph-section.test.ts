import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { helpNav } from '../../src/help/groups.js';
import { searchHelp } from '../../src/help/search.js';
import { entryText, type HelpDocument, type HelpEntry } from '../../src/help/types.js';

/**
 * Knowledge Graph view plan, Task 9 (KG-C T9): the manual's §17, case 27.348.
 *
 * Against the REAL generated content, as `connecting-assistants.test.ts` does, so deleting the section from
 * `docs/manual.md` (or not running `node scripts/help-content.mjs`) reddens here as well as in `pnpm check:help`.
 */

const SECTION_ID = '17-the-knowledge-graph';

function manual(): HelpDocument {
  const found = HELP_CONTENT.find((doc) => doc.id === 'manual');
  if (found === undefined) throw new Error('no manual');
  return found;
}

function section() {
  const found = manual().sections.find((s) => s.id === SECTION_ID);
  if (found === undefined) throw new Error(`the manual has no section ${SECTION_ID}`);
  return found;
}

function entry(title: string): HelpEntry {
  const found = section().entries.find((e) => e.title === title);
  if (found === undefined) throw new Error(`§17 has no entry "${title}"`);
  return found;
}

/** Lower case, with a wrapped line's newline read as a space, so a phrase can be asserted across the manual's wrap. */
const text = (e: HelpEntry): string => entryText(e).toLowerCase().replace(/\s+/g, ' ');

describe('27.348 the manual has §17 "The Knowledge Graph"', () => {
  it('27.348 §17 follows §16 and says where the graph is, the rings and the fog, hops and keys, filters and scope, the semantic layer and Remove link', () => {
    expect(section().title).toBe('§17 — The Knowledge Graph');
    const ids = manual().sections.map((s) => s.id);
    expect(ids.indexOf(SECTION_ID)).toBe(ids.indexOf('16-connecting-claude-or-chatgpt') + 1);
    expect(section().entries.map((e) => e.title)).toEqual([
      'What the Knowledge Graph shows',
      'Where to find it',
      'Rings and the fog',
      'Moving around, hops and keys',
      'Choosing what it shows',
      'Removing a link from the graph',
    ]);

    // Where: the ticket's fourth tab and the note's byline (and its phone menu).
    const where = text(entry('Where to find it'));
    for (const word of ['fourth tab', 'details', 'history', 'attachments', 'under the note', 'on a phone']) expect(where, word).toContain(word);
    // The rings, the fog, and the cap's number (zones.ts CLEAR_CAP).
    const rings = text(entry('Rings and the fog'));
    for (const word of ['one hop', 'fog', 'nothing in the fog can be clicked', 'outside the scope', '500 nearest']) expect(rings, word).toContain(word);
    // Hops (desktop 1–4 or Everything, default 2; one ring on a phone) and the keys line's three keys.
    const moving = text(entry('Moving around, hops and keys'));
    for (const word of ['everything', 'starts at 2', 'one clear ring', '1 to 4 set the hops', 'c centres', 'esc goes back', 'linked to']) expect(moving, word).toContain(word);
    // Filters and scope, by the chips' own labels (domain GROUP_LABEL) and the bar's.
    const choosing = text(entry('Choosing what it shows'));
    for (const word of ['parent and subtasks', 'blocks', 'relates to', 'duplicates', 'attached notes', 'links in text', 'people', 'projects', 'concepts', 'workspaces', 'scope and links']) {
      expect(choosing, word).toContain(word);
    }
    // The semantic layer is a view switch only (spec §6.4, ruling D6).
    expect(choosing).toContain('semantic layer');
    expect(choosing).toContain('only changes what you see on this browser');
    expect(choosing).toContain("nobody else's view changes");
    // Remove link, Undo, and the attribution in ruling 1B's words.
    const remove = text(entry('Removing a link from the graph'));
    for (const word of ['remove link', 'undo', 'via an assistant', 'assistant, for', 'add link']) expect(remove, word).toContain(word);

    // CONTROL, same `it`: the words are read from §17, not the whole manual — §16 names neither the fog nor the
    // semantic layer, so a check that wandered into its neighbour would fail.
    const sixteen = manual().sections.find((s) => s.id === '16-connecting-claude-or-chatgpt');
    const sixteenText = (sixteen?.entries ?? []).map(text).join(' ');
    expect(sixteenText).not.toContain('fog');
    expect(sixteenText).not.toContain('semantic layer');
  });

  it('27.348 the sidebar groups §17 under its own heading, and the help search finds it', () => {
    const group = helpNav(manual()).find((g) => g.title === 'Knowledge Graph');
    expect(group?.sections.map((s) => s.id)).toEqual([SECTION_ID]);
    const inSection = (query: string): boolean => {
      const result = searchHelp(HELP_CONTENT, query, 50);
      return result.kind === 'matches' && result.matches.some((m) => m.document === 'manual' && m.sectionId === SECTION_ID);
    };
    expect(inSection('fog')).toBe(true);
    expect(inSection('semantic layer')).toBe(true);
    // CONTROL, same `it`: a term §17 does not contain does not find it.
    expect(inSection('passkey')).toBe(false);
  });

  it('27.348 the ticket panel is described with four tabs, and a note\'s Delete sits beside History and Knowledge Graph', () => {
    const afterwards = manual()
      .sections.flatMap((s) => s.entries)
      .find((e) => e.title === 'What you can change afterwards');
    expect(afterwards).toBeDefined();
    const panel = text(afterwards as HelpEntry);
    expect(panel).toContain('four tabs');
    expect(panel).toContain('knowledge graph (§17)');
    // CONTROL, same `it`: the old count is gone, so a manual that kept both sentences would fail.
    expect(panel).not.toContain('three tabs');
    const deleting = manual()
      .sections.find((s) => s.id === '15-notes')
      ?.entries.map(text)
      .find((t) => t.includes('deleting a note:'));
    expect(deleting).toContain('beside history and knowledge graph');
  });
});
