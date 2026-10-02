// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spliceDoc, type DocNode } from '../../src/markdown-doc/index.js';

const h = (level: number, text: string): DocNode => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const p = (text: string): DocNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const img: DocNode = { type: 'image', attrs: { attachmentId: '01J0IMG0000000000000000000', wrap: 'inline-left', alt: '' } };
const doc = (content: DocNode[]) => ({ type: 'doc' as const, attrs: { schemaVersion: 2 }, content });

describe('26.010 spliceDoc', () => {
  const current = doc([h(1, 'Plan'), p('intro'), img, h(2, 'Risks'), p('old risk'), h(3, 'Minor'), p('tiny'), h(2, 'Owners'), p('Asha')]);
  it('26.010 replace_section keeps every outside node byte-identical', () => {
    const out = spliceDoc(current, doc([p('new risk')]), { mode: 'replace_section', section: 'Risks' });
    if (!('doc' in out)) throw new Error(out.problem);
    expect(out.doc.content).toEqual([h(1, 'Plan'), p('intro'), img, h(2, 'Risks'), p('new risk'), h(2, 'Owners'), p('Asha')]);
    for (const outside of [0, 1, 2, 5, 6]) {
      expect(JSON.stringify((out.doc.content as DocNode[])[outside])).toBe(
        JSON.stringify(current.content[[0, 1, 2, 7, 8][[0, 1, 2, 5, 6].indexOf(outside)]!]),
      );
    }
  });
  it('26.010 append; a missing or ambiguous section is a problem; replace is the incoming doc', () => {
    expect(spliceDoc(doc([{ type: 'paragraph' }]), doc([p('a')]), { mode: 'append' })).toEqual({ doc: doc([p('a')]) });
    expect(spliceDoc(doc([p('x')]), doc([p('a')]), { mode: 'append' })).toEqual({ doc: doc([p('x'), p('a')]) });
    expect(spliceDoc(current, doc([p('a')]), { mode: 'replace_section', section: 'Nope' })).toEqual({
      problem: 'section "Nope" not found; the headings are: "Plan", "Risks", "Minor", "Owners"',
    });
    expect(spliceDoc(doc([h(2, 'A'), h(2, 'A')]), doc([p('a')]), { mode: 'replace_section', section: 'A' })).toEqual({
      problem: 'section "A" is ambiguous: 2 headings read "A"; use mode "replace"',
    });
    expect(spliceDoc(current, doc([p('a')]), { mode: 'replace' })).toEqual({ doc: doc([p('a')]) }); // CONTROL
  });
});
