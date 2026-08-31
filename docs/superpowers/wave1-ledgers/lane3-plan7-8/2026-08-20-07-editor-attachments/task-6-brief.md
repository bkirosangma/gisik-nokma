### Task 6: `docToPlainText` conformance — every schema-v1 node through the domain walker

**Files:**
- Test: `packages/editor/test/doc-to-plain-text.test.ts`

**Interfaces:**
- Consumes: `docToPlainText(doc: unknown): string` from `@gisik-nokma/domain` (Plan 5 — written in parallel; it exists in the codebase by the time this plan executes). Coordination amendment 12 fixes its home and signature.
- Produces: the conformance contract between schema v1 and the walker: **every node type serializes without throwing; text nodes contribute their text; mention nodes render as `@<label>`** (the `@name` placeholder — the label attr exists precisely so a dependency-free walker can name the person). This file is the single place the assumption is pinned; see Open questions 2 for the reconciliation note.

- [ ] **Step 1: Write the conformance tests**

`packages/editor/test/doc-to-plain-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { docToPlainText } from '@gisik-nokma/domain';
import { createTestEditor } from './helpers/create-editor.js';

const USER = '01J9GUSA000000000000000000';
const IMG = '01J9GIMA000000000000000000';

/** Build the doc through the real editor so it is exactly what clients store. */
function docFor(content: unknown[]): unknown {
  const editor = createTestEditor(undefined, { type: 'doc', content });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

type NodeCase = { label: string; content: unknown[]; expectText?: string[] };

const NODE_CASES: NodeCase[] = [
  { label: 'paragraph', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain words' }] }], expectText: ['plain words'] },
  { label: 'heading', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Filing' }] }], expectText: ['Filing'] },
  { label: 'bold/italic/code/strike marks', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
    { type: 'text', text: 'i', marks: [{ type: 'italic' }] },
    { type: 'text', text: 'c', marks: [{ type: 'code' }] },
    { type: 'text', text: 's', marks: [{ type: 'strike' }] },
  ] }], expectText: ['b', 'i', 'c', 's'] },
  { label: 'link mark', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'the portal', marks: [{ type: 'link', attrs: { href: 'https://gst.gov.in' } }] },
  ] }], expectText: ['the portal'] },
  { label: 'bullet list', content: [{ type: 'bulletList', content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first errand' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second errand' }] }] },
  ] }], expectText: ['first errand', 'second errand'] },
  { label: 'ordered list', content: [{ type: 'orderedList', attrs: { start: 1 }, content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'step one' }] }] },
  ] }], expectText: ['step one'] },
  { label: 'blockquote', content: [{ type: 'blockquote', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'quoted claim' }] },
  ] }], expectText: ['quoted claim'] },
  { label: 'code block', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'SELECT 1;' }] }], expectText: ['SELECT 1;'] },
  { label: 'horizontal rule', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'above' }] }, { type: 'horizontalRule' }] , expectText: ['above'] },
  { label: 'hard break', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' },
  ] }], expectText: ['line one', 'line two'] },
  { label: 'table', content: [{ type: 'table', content: [
    { type: 'tableRow', content: [
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'col head' }] }] },
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell body' }] }] },
    ] },
  ] }], expectText: ['col head', 'cell body'] },
  { label: 'image (no text contribution required — must not throw)', content: [
    { type: 'image', attrs: { attachmentId: IMG, wrap: 'block', alt: 'the receipt' } },
  ] },
  { label: 'mention', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'ask ' },
    { type: 'mention', attrs: { userId: USER, label: 'Anselma' } },
  ] }], expectText: ['ask', '@Anselma'] },
];

describe('docToPlainText conformance — schema v1 through the domain walker', () => {
  it.each(NODE_CASES)('$label round-trips without throwing', ({ content, expectText }) => {
    const doc = docFor(content);
    let result = '';
    expect(() => {
      result = docToPlainText(doc);
    }).not.toThrow();
    expect(typeof result).toBe('string');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('[object Object]');
    for (const piece of expectText ?? []) {
      expect(result).toContain(piece);
    }
  });

  it('mentions render as the @name placeholder (the pinned cross-plan contract)', () => {
    const doc = docFor([
      { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: USER, label: 'Anselma' } }] },
    ]);
    expect(docToPlainText(doc)).toContain('@Anselma');
  });

  it('a kitchen-sink doc keeps its text in document order', () => {
    const doc = docFor([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'AAA' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'BBB' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CCC' }] }] },
    ]);
    const result = docToPlainText(doc);
    expect(result.indexOf('AAA')).toBeGreaterThanOrEqual(0);
    expect(result.indexOf('AAA')).toBeLessThan(result.indexOf('BBB'));
    expect(result.indexOf('BBB')).toBeLessThan(result.indexOf('CCC'));
  });

  it('the empty doc yields an empty-ish string, never a throw', () => {
    expect(() => docToPlainText({ type: 'doc', content: [] })).not.toThrow();
    expect(docToPlainText({ type: 'doc', content: [] }).trim()).toBe('');
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/doc-to-plain-text.test.ts`
Expected: PASS. Plan 5's walker was checked against these assertions during the series self-review and matches: mentions are `{userId, label?}` rendered `@label` with `@userId` as the fallback, images contribute no text, and unknown node types are descended into rather than dropped (Open question 2, now settled). **If an assertion nevertheless fails**, do NOT change the walker or the schema unilaterally — that is the cross-plan reconciliation point; raise it to the series coordinator, then align whichever side the coordinator rules against.

- [ ] **Step 3: Commit**

```bash
git add packages/editor/test/doc-to-plain-text.test.ts
git commit -m "Conformance: every schema-v1 node survives docToPlainText, mentions render as @name — the editor/domain contract pinned in one suite"
```

---
