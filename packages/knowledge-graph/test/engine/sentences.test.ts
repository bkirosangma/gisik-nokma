// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GRAPH_EDGE_KINDS } from '@gisik-nokma/domain';
import { edgeSentence, formatGraphDate, howText, provenanceLine, relation } from '../../src/engine/sentences.js';
import { edge, N, P, T } from './fixture.js';

const labels: Record<string, string> = { [T('133')]: 'GN-133', [T('142')]: 'GN-142', [N('n1')]: 'Phone pass rulings', [P('ama')]: 'Ama Rangsa' };
const labelOf = (ref: string) => labels[ref] ?? ref;

describe('edge sentences (port of rel, knowledge-graph-sigma.html:566)', () => {
  it('27.232 every edge kind reads both ways; control: relates is symmetric and no kind falls through', () => {
    const table: Record<string, [string, string]> = {
      parent: ['has subtask', 'is a subtask of'], blocks: ['blocks', 'is blocked by'], relates: ['relates to', 'relates to'],
      duplicates: ['duplicates', 'is duplicated by'], attached: ['is attached to', 'has note'], ref: ['links to', 'is linked from'],
      mention: ['mentions', 'is mentioned in'], assignee: ['is the assignee of', 'is assigned to'], tag: ['includes', 'belongs to'], in: ['contains', 'is in'],
    };
    for (const kind of GRAPH_EDGE_KINDS) {
      const e = edge(kind, 'a:1', 'b:2');
      expect([relation(e, 'a:1'), relation(e, 'b:2')], kind).toEqual(table[kind]);
    }
    const sug = edge('tag', 'concept:1', T('1'), { suggested: true });
    expect([relation(sug, 'concept:1'), relation(sug, T('1'))]).toEqual(['may include', 'may belong to']);
  });

  it('27.233 the spec\'s three example sentences, verbatim (§2.1); control: the sentence always reads from the source', () => {
    expect(edgeSentence(edge('blocks', T('133'), T('142')), labelOf)).toBe('GN-133 blocks GN-142');
    expect(edgeSentence(edge('attached', N('n1'), T('142')), labelOf)).toBe('Phone pass rulings is attached to GN-142');
    expect(edgeSentence(edge('assignee', P('ama'), T('142')), labelOf)).toBe('Ama Rangsa is the assignee of GN-142');
    expect(edgeSentence(edge('blocks', T('142'), T('133')), labelOf)).toBe('GN-142 blocks GN-133');
  });

  it('27.234 provenance: who, when (IST, en-GB) and "via an assistant" for an MCP origin; control: a web origin has no "via", and no author gives the date alone', () => {
    expect(formatGraphDate('2026-10-01T20:00:00.000Z')).toBe('2 Oct 2026'); // 01:30 IST next day
    expect(provenanceLine(edge('blocks', T('133'), T('142'), { addedBy: 'Bolsrang Momin', addedAt: '2026-10-01T05:00:00.000Z', origin: 'mcp' })))
      .toBe('Added by Bolsrang Momin on 1 Oct 2026, via an assistant.');
    expect(provenanceLine(edge('blocks', T('133'), T('142'), { addedBy: 'Bolsrang Momin', addedAt: '2026-10-01T05:00:00.000Z', origin: 'web' })))
      .toBe('Added by Bolsrang Momin on 1 Oct 2026.');
    // Node 22.22.2 (ICU 78.2) abbreviates September as "Sept" for en-GB; pinned as measured
    expect(provenanceLine(edge('attached', N('n1'), T('142'), { addedAt: '2026-09-29T05:00:00.000Z' }))).toBe('Added on 29 Sept 2026.');
    expect(provenanceLine(edge('blocks', T('133'), T('142'), { addedBy: 'Bolsrang Momin' }))).toBe('Added by Bolsrang Momin.');
    expect(provenanceLine(edge('parent', T('133'), T('142')))).toBeNull();
  });

  it('27.235 how each kind came to be (the mockup\'s `how`); control: every kind has one', () => {
    expect(howText(edge('ref', N('n1'), T('142')))).toBe('Comes from the text: edit the text to change it.');
    expect(howText(edge('assignee', P('ama'), T('142')))).toBe("From the ticket's Assignee field.");
    expect(howText(edge('tag', 'concept:1', T('142'), { suggested: true }))).toBe('Suggested by the model from how close the two are in meaning.');
    expect(howText(edge('tag', 'concept:1', T('142')))).toBe('Tagged with this concept.');
    for (const kind of GRAPH_EDGE_KINDS) expect(howText(edge(kind, 'a:1', 'b:2')).length, kind).toBeGreaterThan(0);
  });
});
