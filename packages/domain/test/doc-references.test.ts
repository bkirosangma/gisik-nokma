import { describe, expect, it } from 'vitest';
import {
  collectDocReferences,
  extractDocReferences,
  extractMentionedUserIds,
  PURGED_ITEM_LABEL,
  SNIPPET_MAX_CHARS,
  splitSnippet,
} from '../src/index.js';

const text = (value: string) => ({ type: 'text', text: value });
const para = (...inline: unknown[]) => ({ type: 'paragraph', content: inline });
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks });
const chip = (ticketId: string, key: string, title: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'P1', key, title } });
const link = (noteId: string, title: string) => ({ type: 'wikiLink', attrs: { noteId, title } });
const mention = (userId: string, label: string) => ({ type: 'mention', attrs: { userId, label } });

describe('27.100 each reference node gives its kind, id, ordinal and a marked snippet', () => {
  it('27.100 ticketRef, wikiLink and mention are found; a bare key in text is not (control)', () => {
    const refs = extractDocReferences(
      doc(para(text('Blocked on '), chip('T1', 'GN-142', 'Chiller'), text(' until Friday')), para(text('see '), link('N1', 'Phone pass rulings'), text(' and ask '), mention('U1', 'Ama'))),
    );
    expect(refs).toEqual([
      { targetKind: 'ticket', targetId: 'T1', ordinal: 0, snippet: 'Blocked on [[GN-142 Chiller]] until Friday' },
      { targetKind: 'note', targetId: 'N1', ordinal: 1, snippet: 'see [[Phone pass rulings]] and ask @Ama' },
      { targetKind: 'person', targetId: 'U1', ordinal: 2, snippet: 'see Phone pass rulings and ask [[@Ama]]' },
    ]);
    // CONTROL: the same words with no node are text, not a reference.
    expect(extractDocReferences(doc(para(text('Blocked on GN-142 until Friday'))))).toEqual([]);
  });
});

describe('27.101 nesting: the snippet is the innermost block, ordinals run in document order', () => {
  it('27.101 a list item and a table cell each give their own paragraph as the snippet', () => {
    const list = { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('see '), link('N1', 'Rulings'))] }] };
    const table = {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para(mention('U1', 'Ama'), text(' owns it'))] }, { type: 'tableHeader', content: [para(text('x'))] }] }],
    };
    const refs = extractDocReferences(doc(para(chip('T1', 'GN-1', 'One')), list, table));
    expect(refs.map((r) => [r.ordinal, r.targetId, r.snippet])).toEqual([
      [0, 'T1', '[[GN-1 One]]'],
      [1, 'N1', 'see [[Rulings]]'],
      [2, 'U1', '[[@Ama]] owns it'],
    ]);
  });

  it('27.101 two references in one block: each snippet marks its own and not the other', () => {
    const refs = extractDocReferences(doc(para(chip('A', 'GN-1', 'One'), text(' and '), chip('B', 'GN-2', 'Two'))));
    expect(refs.map((r) => r.snippet)).toEqual(['[[GN-1 One]] and GN-2 Two', 'GN-1 One and [[GN-2 Two]]']);
  });
});

describe('27.101 an outer block holding a nested block keeps each reference with its own block', () => {
  it('27.101 listItem [para(chip A), chip B]: B’s snippet marks B, not A; A’s marks A (control)', () => {
    // A document from another producer: the list item holds a nested paragraph AND a chip of its own.
    const item = { type: 'listItem', content: [para(chip('A', 'GN-1', 'One')), chip('B', 'GN-2', 'Two')] };
    const refs = extractDocReferences(doc({ type: 'bulletList', content: [item] }));
    expect(refs.map((r) => [r.targetId, r.snippet])).toEqual([
      ['A', '[[GN-1 One]]'], // CONTROL: the nested paragraph's own reference is marked in the paragraph
      ['B', 'GN-1 One [[GN-2 Two]]'], // the item's own snippet: A's chip sits in a nested block, so it is shown but never marked for B
    ]);
  });
});

describe('27.102 the snippet is at most 160 characters, centred on the reference', () => {
  it('27.102 long text is cut on both sides with an ellipsis; the marker is whole; short text is untouched (control)', () => {
    const long = extractDocReferences(doc(para(text('a'.repeat(300)), chip('T1', 'GN-142', 'Chiller'), text('b'.repeat(300)))))[0]!;
    expect(long.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
    expect(long.snippet).toContain('[[GN-142 Chiller]]');
    expect(long.snippet.startsWith('…')).toBe(true);
    expect(long.snippet.endsWith('…')).toBe(true);
    const short = extractDocReferences(doc(para(text('a short line '), chip('T1', 'GN-142', 'Chiller'))))[0]!;
    expect(short.snippet).toBe('a short line [[GN-142 Chiller]]');
  });

  it('27.102 a reference longer than the window is cut INSIDE its marker and keeps both brackets', () => {
    const giant = extractDocReferences(doc(para(text('x '), chip('T1', 'GN-1', 'z'.repeat(400)))))[0]!;
    expect(giant.snippet.length).toBe(SNIPPET_MAX_CHARS);
    expect(giant.snippet.startsWith('[[GN-1 zzz')).toBe(true);
    expect(giant.snippet.endsWith('…]]')).toBe(true);
  });
});

describe('27.103 literal brackets in the text never forge a second marker', () => {
  it('27.103 "[[" and "]]" typed by a person are spaced apart; exactly one pair remains', () => {
    const r = extractDocReferences(doc(para(text('array[[0]] or [[[x]]] '), chip('T1', 'GN-142', 'Chiller'))))[0]!;
    expect(r.snippet).toBe('array[ [0] ] or [ [ [x] ] ] [[GN-142 Chiller]]');
    expect(r.snippet.split('[[').length - 1).toBe(1);
    expect(r.snippet.split(']]').length - 1).toBe(1);
  });

  it('27.103 a bracket touching the marker never moves it: Task 2’s splitSnippet recovers exactly the reference’s own text', () => {
    const shapes: Array<{ name: string; body: unknown; own: string }> = [
      { name: 'control: a plain chip', body: para(text('see '), chip('T1', 'GN-1', 'Crash'), text(' now')), own: 'GN-1 Crash' },
      { name: 'a ticket title ending ]', body: para(text('see '), chip('T1', 'GN-1', 'Crash on save [iOS]'), text(' now')), own: 'GN-1 Crash on save [iOS]' },
      { name: 'a note title ending ]', body: para(text('see '), link('N1', 'Rulings [v2]')), own: 'Rulings [v2]' },
      { name: 'a [ typed right before the chip, a ] right after', body: para(text('(see ['), chip('T1', 'GN-1', 'Crash'), text('])')), own: 'GN-1 Crash' },
      { name: 'a title starting with [', body: para(text('see '), link('N1', '[draft] Plan'), text(' now')), own: '[draft] Plan' },
      { name: 'a title that is only brackets', body: para(text('a['), link('N1', '[]'), text(']b')), own: '[]' },
    ];
    for (const { name, body, own } of shapes) {
      const ref = extractDocReferences(doc(body))[0]!;
      const parts = splitSnippet(ref.snippet);
      expect(parts, name).not.toBeNull();
      expect(parts!.marked.trim(), name).toBe(own);
      expect(parts!.before.includes('[[') || parts!.before.includes(']]'), name).toBe(false);
      expect(parts!.after.includes('[[') || parts!.after.includes(']]'), name).toBe(false);
      expect(ref.snippet.split('[[').length - 1, name).toBe(1);
      expect(ref.snippet.split(']]').length - 1, name).toBe(1);
    }
  });
});

describe('27.104 purged chips and agreement with the two existing walkers', () => {
  it('27.104 a purged chip reads Deleted item inside another reference’s snippet', () => {
    const refs = extractDocReferences(doc(para(chip('A', 'GN-1', 'Secret'), text(' blocks '), chip('B', 'GN-2', 'Two'))), {
      isPurged: (kind, id) => kind === 'ticket' && id === 'A',
    });
    expect(refs.map((r) => [r.targetId, r.snippet])).toEqual([
      ['A', `[[${PURGED_ITEM_LABEL}]] blocks GN-2 Two`],
      ['B', `${PURGED_ITEM_LABEL} blocks [[GN-2 Two]]`],
    ]);
    expect(JSON.stringify(refs)).not.toContain('Secret');
  });

  it('27.104 ids agree with collectDocReferences and mentions with extractMentionedUserIds on one fixture', () => {
    const fixture = doc(
      para(chip('T1', 'GN-1', 'One'), mention('U1', 'Ama'), link('N1', 'Rulings')),
      { type: 'bulletList', content: [{ type: 'listItem', content: [para(chip('T1', 'GN-1', 'One'), mention('U2', 'Bo'), mention('U1', 'Ama'))] }] },
    );
    const refs = extractDocReferences(fixture);
    const unique = (kind: string) => [...new Set(refs.filter((r) => r.targetKind === kind).map((r) => r.targetId))];
    expect({ ticketIds: unique('ticket'), noteIds: unique('note') }).toEqual(collectDocReferences(fixture));
    expect(unique('person')).toEqual(extractMentionedUserIds(fixture));
    expect(refs).toHaveLength(6); // repeats are kept: one row per occurrence, ordinals 0–5
  });
});

describe('27.105 total: any input gives an answer, never a throw', () => {
  it('27.105 null, a string, an empty id and a cycle give [] or the refs before the cycle', () => {
    expect(extractDocReferences(null)).toEqual([]);
    expect(extractDocReferences('GN-142')).toEqual([]);
    expect(extractDocReferences(doc(para(chip('', 'GN-1', 'One'))))).toEqual([]);
    const cyclic: { type: string; content: unknown[] } = { type: 'paragraph', content: [mention('U1', 'Ama')] };
    cyclic.content.push(cyclic);
    expect(() => extractDocReferences(doc(cyclic))).not.toThrow();
    expect(extractDocReferences(doc(cyclic))[0]?.targetId).toBe('U1');
  });
});
