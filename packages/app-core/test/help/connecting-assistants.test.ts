import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { helpNav } from '../../src/help/groups.js';
import { searchHelp } from '../../src/help/search.js';
import { blockSpans, entryText, type HelpBlock, type HelpDocument, type HelpEntry } from '../../src/help/types.js';

/**
 * Hosted MCP plan, Task 9 — the member help, manual §16. Cases 14.280–14.282.
 *
 * Against the REAL generated content, as `search.test.ts` does, so a stale
 * regeneration (`node scripts/help-content.mjs` not run) reddens here as well as
 * in `pnpm check:help`.
 */

const SECTION_ID = '16-connecting-claude-or-chatgpt';

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
  if (found === undefined) throw new Error(`§16 has no entry "${title}"`);
  return found;
}

function orderedSteps(e: HelpEntry): number[] {
  return e.blocks
    .filter((b): b is Extract<HelpBlock, { kind: 'list' }> => b.kind === 'list' && b.ordered)
    .map((b) => b.items.length);
}

const text = (e: HelpEntry): string => entryText(e).toLowerCase();

describe('14.280 the manual has §16 "Connecting Claude or ChatGPT"', () => {
  it('14.280 §16 is titled as such, and carries per-app three-step lists, disconnect, and reconnect', () => {
    expect(section().title).toBe('§16 — Connecting Claude or ChatGPT');
    // Per app, exactly three numbered steps — the add-a-connector click path, the paste, the Allow.
    expect(orderedSteps(entry('In Claude'))).toEqual([3]);
    expect(orderedSteps(entry('In ChatGPT'))).toEqual([3]);
    expect(text(entry('In Claude'))).toContain('add custom connector');
    expect(text(entry('In Claude'))).toContain('allow');
    expect(text(entry('In ChatGPT'))).toContain('developer mode');
    expect(text(entry('In ChatGPT'))).toContain('allow');
    // The address, and how to get it without typing it.
    expect(text(entry('The address to paste'))).toContain('https://pm-api.artsourced.in/mcp');
    // Disconnecting, by the names the screen carries.
    const disconnect = entry('Seeing what is connected, and disconnecting');
    expect(text(disconnect)).toContain('connected assistants');
    expect(text(disconnect)).toContain('disconnect');
    // What a "reconnect" prompt means.
    expect(text(entry('If the assistant asks you to reconnect'))).toContain('reconnect');
    // The dated menu caveat — the menus move, and the page says when it was written.
    expect(text(entry('In Claude'))).toContain('as of 30 september 2026');
    expect(text(entry('In ChatGPT'))).toContain('as of 30 september 2026');
    // CONTROL, same `it`: the check is not vacuous — an ordered-list count that is
    // NOT three would be reported (a section with the wrong step count fails above),
    // and §15 has no per-app three-step list at all.
    const notes = manual().sections.find((s) => s.id === '15-notes');
    expect(notes?.entries.flatMap((e) => orderedSteps(e)).filter((n) => n === 3).length).toBeLessThan(2);
    // The section is reachable from the sidebar by construction (case 15.19 owns the partition).
    const grouped = helpNav(manual()).flatMap((g) => g.sections.map((s) => s.id));
    expect(grouped).toContain(SECTION_ID);
  });
});

describe('14.281 the Help browser finds §16 by "ChatGPT" and "connector"', () => {
  const inSection = (query: string): boolean => {
    const result = searchHelp(HELP_CONTENT, query, 50);
    return result.kind === 'matches' && result.matches.some((m) => m.document === 'manual' && m.sectionId === SECTION_ID);
  };

  it('14.281 searching ChatGPT and connector each returns a §16 entry', () => {
    expect(inSection('ChatGPT')).toBe(true);
    expect(inSection('connector')).toBe(true);
    // CONTROL, same `it`: an existing §15 search still finds §15 …
    const notes = searchHelp(HELP_CONTENT, 'who can see your note', 50);
    expect(notes.kind === 'matches' && notes.matches.some((m) => m.sectionId === '15-notes')).toBe(true);
    // … and a term §16 does not contain does not find it.
    expect(inSection('passkey')).toBe(false);
    // Every §16 body span is real text (a stale, empty regeneration would search as nothing).
    expect(section().entries.every((e) => e.blocks.flatMap(blockSpans).length > 0)).toBe(true);
  });
});

describe('14.282 the anchor the "How to connect" link lands on', () => {
  it('14.282 the section id is 16-connecting-claude-or-chatgpt, so the DOM anchor is manual-16-connecting-claude-or-chatgpt', () => {
    expect(section().id).toBe(SECTION_ID);
    // The Help browser renders a section as `id={`${document.id}-${section.id}`}` and an entry the same way
    // (help-browser.tsx) — so `/help#manual-16-connecting-claude-or-chatgpt` is the section's anchor.
    const anchors = [`manual-${section().id}`, ...section().entries.map((e) => `manual-${e.id}`)];
    expect(anchors[0]).toBe('manual-16-connecting-claude-or-chatgpt');
    // CONTROL, same `it`: anchors are unique across the whole manual, so the link cannot land elsewhere.
    const every = manual().sections.flatMap((s) => [`manual-${s.id}`, ...s.entries.map((e) => `manual-${e.id}`)]);
    expect(new Set(every).size).toBe(every.length);
  });
});

describe('14.337 §16 says what the assistant can do, and the safety rules for deleting', () => {
  it('14.337 lists workspaces, projects, people and tickets; deletes go to Deleted items for 15 days and need the exact name', () => {
    const can = text(entry('What your assistant can do'));
    for (const word of ['workspaces', 'projects', 'people', 'tickets']) expect(can).toContain(word);
    expect(can).toContain('across a whole workspace');
    expect(can).toContain('deleted items');
    expect(can).toContain('15 days');
    expect(can).toContain('exact name');
    // AMENDED 2026-10-01 (MCP CRUD Task 9 fix 1): the "It can do what you can do" bullet no longer lists only tickets —
    // it names the workspace and project powers and points at this entry. It lives in "What connecting does".
    const connecting = text(entry('What connecting does'));
    expect(connecting).toContain('workspaces and projects');
    expect(connecting).toContain('what your assistant can do');
    // The workspace page's section gains "Edit a project", by the control's own label.
    const edit = manual()
      .sections.flatMap((s) => s.entries)
      .find((e) => e.title === 'Edit a project');
    expect(edit).toBeDefined();
    expect(text(edit as HelpEntry)).toContain('edit button beside archive');
    expect(text(edit as HelpEntry)).toContain('owner');
    // CONTROL, same `it`: the check reads the right place — the older §16 entry names none of this,
    // so a regeneration that dropped the new entry's words could not be satisfied by it.
    expect(text(entry('What connecting does'))).not.toContain('15 days');
    expect(text(entry('What connecting does'))).not.toContain('exact name');
  });
});

describe('14.553 §16 lists every kind of act, the preview-then-exact-name rule, and Markdown', () => {
  it('14.553 notes, comments, files, ticket acts, inbox and admin are named; admin acts preview first; bodies are Markdown', () => {
    const can = text(entry('What your assistant can do'));
    for (const word of ['notes', 'comments', 'edit or delete', '10 mb', 'images', 'every ticket action', 'reorder the backlog', 'history', 'notifications', 'invitations', 'admin']) {
      expect(can, word).toContain(word);
    }
    // Admin acts: the preview first, then the exact name — by the words the section uses.
    expect(can).toContain('first shows you what would change');
    expect(can).toContain('repeats the exact name');
    expect(can).toContain('ticket key');
    expect(text(entry('Formatting comes through'))).toContain('markdown');
    // The stale sentence is gone: the assistant CAN change a prefix now (§3 says the same).
    expect(can).not.toContain('cannot change a prefix');
    const prefixes = manual().sections.find((s) => s.id.startsWith('3-'));
    expect(prefixes ? prefixes.entries.map((e) => text(e)).join(' ') : '').not.toContain('it cannot change a prefix');
    // CONTROL, same `it`: the older entry still carries its own rule, so the check reads this entry and not a stale one.
    expect(can).toContain('15 days');
    expect(can).toContain('exact name');
  });
});
