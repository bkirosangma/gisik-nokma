import type { GraphItemView } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { iconFor } from '../src/react/draw-model.js';

const item = (kind: GraphItemView['kind'], label: string) => ({ kind, label }) as GraphItemView;

describe('iconFor (`knowledge-graph-sigma.html:813-814`)', () => {
  it('27.268 trap 4, the icon pick: a note, a folder and a person carry an icon; none in fog, at dot level, or on the centre card unless it is a person; control: a ticket never has one', () => {
    expect(iconFor(item('note', 'Scroll notes'), 'chip', false)).toEqual({ kind: 'note' });
    expect(iconFor(item('project', 'Mobile web'), 'chip', false)).toEqual({ kind: 'folder' });
    expect(iconFor(item('workspace', 'Gisik Nokma'), 'compact', false)).toEqual({ kind: 'folder' });
    expect(iconFor(item('person', 'Asha Marak'), 'chip', false)).toEqual({ kind: 'person', initials: 'AM' });
    // each exclusion alone, with the same item that has an icon otherwise
    expect(iconFor(item('note', 'Scroll notes'), 'fog', false)).toBeNull();
    expect(iconFor(item('note', 'Scroll notes'), 'dot', false)).toBeNull();
    expect(iconFor(item('note', 'Scroll notes'), 'card', true)).toBeNull();
    expect(iconFor(item('person', 'Asha Marak'), 'card', true)).toEqual({ kind: 'person', initials: 'AM' }); // a person's centre keeps its avatar
    expect(iconFor(item('ticket', 'GN-142'), 'chip', false)).toBeNull(); // control
  });
});
