// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../../src/markdown-doc/', import.meta.url);

/** Every module specifier a source names: `from '…'`, `import('…')` and a bare `import '…'`. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm)) found.push(m[1]!);
  return found;
}

/** The converter must stay server-safe: no React, no component, no browser serializer (plan Task 1, line 248). */
const forbidden = (spec: string): boolean =>
  spec === 'react' || spec.startsWith('react/') || spec === 'react-dom' || spec === '@tiptap/react' || /components\//.test(spec) || /markdown\/serializer/.test(spec);

describe('26.001 the converter imports nothing that needs a DOM', () => {
  it('26.001 no src/markdown-doc module imports react, @tiptap/react, a component or markdown/serializer', () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
    // A wrong directory or glob cannot pass an empty sweep.
    expect(files).toEqual(expect.arrayContaining(['parse.ts', 'serialize.ts']));

    const offenders = files.flatMap((f) =>
      specifiers(readFileSync(new URL(f, SRC), 'utf8')).filter(forbidden).map((spec) => `${f}: ${spec}`),
    );
    expect(offenders).toEqual([]);

    // CONTROL: the same scanner reports a planted import of the browser serializer (and of React).
    const planted = "import { exportMarkdown } from '../markdown/serializer.js';\nconst x = await import('react');\n";
    expect(specifiers(planted).filter(forbidden)).toEqual(['../markdown/serializer.js', 'react']);
  });
});
