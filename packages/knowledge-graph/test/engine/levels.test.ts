// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RING_CONFIGS } from '../../src/engine/layout.js';
import { levelOf, nodeLabel, nodeSub, truncate } from '../../src/engine/levels.js';
import { item } from './fixture.js';

describe('levels and labels (port of nodeLabel/nodeSub, knowledge-graph-sigma.html:760-770)', () => {
  it('27.225 long names truncate with an ellipsis by code point, never splitting an emoji; control: a short name is untouched', () => {
    const long = 'x'.repeat(200);
    expect(truncate(long, 34)).toHaveLength(34);
    expect(truncate(long, 34).endsWith('…')).toBe(true);
    const emoji = '🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭🧭';
    expect([...truncate(emoji, 12)]).toHaveLength(12);
    expect(truncate(emoji, 12)).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
    expect(truncate('Short', 12)).toBe('Short');
    expect(truncate('x'.repeat(12), 12)).toBe('x'.repeat(12)); // exactly the limit is not cut
    expect(nodeSub(item('t', { title: long }), 'card', false)).toHaveLength(34);
  });

  it('27.226 levels by hop: desktop card → chip → compact → dot, phone cardS → tap, fog past the clear hop; control: Home uses desktop levels', () => {
    expect([0, 1, 2, 3, 6].map((d) => levelOf(RING_CONFIGS.desktop, d, false))).toEqual(['card', 'chip', 'compact', 'dot', 'dot']);
    expect([0, 1].map((d) => levelOf(RING_CONFIGS.phone, d, false))).toEqual(['cardS', 'tap']);
    expect(levelOf(RING_CONFIGS.desktop, 1, true)).toBe('fog');
    expect(RING_CONFIGS.home.levels).toEqual(RING_CONFIGS.desktop.levels);
  });

  it('27.227 labels: a ticket shows its key; a note shows "Note" on a card or desktop chip, else its title; a person their first name on a phone or at compact; control: dot and fog have no label', () => {
    const t = item('t1', { label: 'GN-142' }), n = item('n1', { kind: 'note', label: 'Phone pass rulings', title: 'Phone pass rulings' }), p = item('u', { kind: 'person', label: 'Ama Rangsa' });
    expect(nodeLabel(t, 'tap', true)).toBe('GN-142');
    expect(nodeLabel(n, 'card', false)).toBe('Note');
    expect(nodeLabel(n, 'chip', false)).toBe('Note');
    expect(nodeLabel(n, 'chip', true)).toBe('Phone pass …');
    expect(nodeLabel(n, 'compact', false)).toBe('Phone pass …');
    expect(nodeLabel(p, 'chip', false)).toBe('Ama Rangsa');
    expect(nodeLabel(p, 'compact', false)).toBe('Ama');
    expect(nodeLabel(p, 'chip', true)).toBe('Ama');
    const k = item('k', { kind: 'concept', label: 'A very long concept name that runs on' }), pr = item('pr', { kind: 'project', label: 'Release engineering and operations' });
    expect(nodeLabel(k, 'chip', false)).toBe('A very long concept name th…'); // 28 on a card or chip
    expect(nodeLabel(k, 'compact', false)).toBe('A very long c…'); // 14 further out
    expect(nodeLabel(k, 'tap', true)).toBe('A very long c…'); // 14 on a phone
    expect(nodeLabel(pr, 'chip', false)).toBe('Release engineering…'); // a project or workspace: 20
    expect(nodeLabel(t, 'dot', false)).toBe('');
    expect(nodeLabel(t, 'fog', false)).toBe('');
  });

  it('27.228 the second line: the title on a card (34) or desktop chip (24), the phone card (22); none on a phone tap or at compact; control: a person has none', () => {
    const t = item('t1', { title: 'Move sheet loses its scroll position on phone' });
    expect(nodeSub(t, 'card', false)).toBe('Move sheet loses its scroll posit…');
    expect(nodeSub(t, 'chip', false)).toBe('Move sheet loses its sc…');
    expect(nodeSub(t, 'cardS', true)).toBe('Move sheet loses its …');
    expect(nodeSub(t, 'tap', true)).toBeNull();
    expect(nodeSub(t, 'compact', false)).toBeNull();
    expect(nodeSub(item('u', { kind: 'person' }), 'card', false)).toBeNull();
  });
});
