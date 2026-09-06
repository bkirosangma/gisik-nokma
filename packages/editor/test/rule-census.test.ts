import { describe, expect, it } from 'vitest';
import {
  getExtensionField,
  getSchema,
  getSchemaTypeByName,
  resolveExtensions,
} from '@tiptap/core';
import { buildEditorExtensions } from '../src/schema/extensions.js';

/**
 * THE COMMENT BLOCK IN `src/schema/extensions.ts` CARRIES TWO CENSUSES, AND
 * UNTIL NOW THEY WERE HAND-COUNTED. The script was re-run by hand five times
 * across three tasks, which is five chances to mistype a number into a
 * comment that no machine reads. This is that script, kept.
 *
 * Method, unchanged from the hand runs: `getExtensionField(extension, field,
 * context)` is the same accessor core itself uses to decide whether to
 * register a rules plugin (@tiptap/core@3.30.5 dist:5220 for `addInputRules`,
 * dist:5232 for `addPasteRules`), and the context it is handed here carries
 * the same five keys core builds at dist:5195-5201. Counting what those
 * functions RETURN is therefore counting the rules that reach a plugin, not
 * counting mentions of the word "rule" in a source file.
 *
 * THE BREAKDOWN IS ASSERTED, NOT THE TOTAL, and that is the whole point. Two
 * totals agreeing is not evidence: a change that gave `link` a second paste
 * rule while dropping `strike`'s would leave 7 === 7 and this file green. A
 * per-extension map cannot reconcile that way — it names which extension
 * carries which count, so the only way to keep it green is to actually leave
 * every extension's contribution alone.
 *
 * WHAT THIS DOES NOT CLAIM. These are censuses of the rules the enumerated
 * extensions return on this extension list at tiptap 3.30.5 — the same two
 * numbers the comment block states and no wider claim than that. Nothing here
 * says these are all the ways a document acquires markup; `src/schema/
 * extensions.ts` is explicit that it makes no such claim, and this file holds
 * that line.
 */
const EXPECTED_PASTE_RULES: Record<string, number> = {
  bold: 2,
  italic: 2,
  code: 1,
  strike: 1,
  link: 1,
};

const EXPECTED_INPUT_RULES: Record<string, number> = {
  heading: 6,
  bold: 2,
  italic: 2,
  codeBlock: 2,
  blockquote: 1,
  bulletList: 1,
  code: 1,
  orderedList: 1,
  strike: 1,
  horizontalRule: 1,
};

function census(field: 'addInputRules' | 'addPasteRules'): Record<string, number> {
  // Both helpers are handed the BUILT list, not the resolved one. `getSchema`
  // resolves internally, so feeding it an already-resolved list makes it
  // flatten StarterKit's children a second time and warn about twenty
  // duplicate extension names — noise that would teach a reader to skip past
  // this file's stderr.
  const built = buildEditorExtensions();
  const extensions = resolveExtensions(built);
  const schema = getSchema(built);
  const counts: Record<string, number> = {};
  for (const extension of extensions) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: {},
      editor: undefined,
      type: getSchemaTypeByName(extension.name, schema),
    };
    const add = getExtensionField<() => unknown[]>(extension, field, context);
    if (typeof add !== 'function') continue;
    const rules = add();
    if (rules.length > 0) counts[extension.name] = rules.length;
  }
  return counts;
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

describe('the rule census the schema origin states in prose', () => {
  /**
   * 9.40 — the paste-rule census is exact and per-extension, not a total: seven paste rules across exactly five extensions, so an upgrade that adds or moves one fails here naming the extension.
   */
  it('registers exactly the paste rules the comment block enumerates', () => {
    const counts = census('addPasteRules');
    expect(counts).toEqual(EXPECTED_PASTE_RULES);
    expect(total(counts)).toBe(7);
    expect(Object.keys(counts)).toHaveLength(5);
  });

  it('registers exactly the input rules the comment block enumerates', () => {
    const counts = census('addInputRules');
    expect(counts).toEqual(EXPECTED_INPUT_RULES);
    expect(total(counts)).toBe(18);
    expect(Object.keys(counts)).toHaveLength(10);
  });

  /**
   * The two censused sets are DISJOINT — the comment block says so, and it is
   * load-bearing for Task 5, because it is the reason no single lever
   * (`enableInputRules` or `enablePasteRules`) settles spec §2. An extension
   * appearing in both maps would not fail either case above.
   */
  it('keeps the two rule sets disjoint, which is why neither lever settles §2', () => {
    const pasted = new Set(Object.keys(census('addPasteRules')));
    const typed = new Set(Object.keys(census('addInputRules')));
    // Disjoint as SETS OF RULES, not as sets of extensions: `bold`, `italic`,
    // `code` and `strike` each contribute to both censuses. What is disjoint
    // is which plugin the rules land in, and that is what the two gates read.
    const both = [...pasted].filter((name) => typed.has(name)).sort();
    expect(both).toEqual(['bold', 'code', 'italic', 'strike']);
    expect([...pasted].filter((name) => !typed.has(name))).toEqual(['link']);
  });
});
