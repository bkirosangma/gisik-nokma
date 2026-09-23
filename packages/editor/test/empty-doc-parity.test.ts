import { expect, it } from 'vitest';
import { EMPTY_NOTE_DOC } from '@gisik-nokma/domain';
import { emptyDoc } from '../src/doc.js';

/**
 * 18.013 — the one thing that keeps two definitions of "an empty document" from
 * drifting. `packages/domain` cannot import `packages/editor` (the dependency
 * runs the other way: `packages/editor/package.json` depends on
 * `@gisik-nokma/domain`), so `EMPTY_NOTE_DOC` (`../src/note-state.ts`) is a
 * copy of the literal `emptyDoc()` returns — and a copy with no witness is a
 * second answer waiting to disagree.
 *
 * It sits here, in the package that owns the schema, rather than in the one that
 * copies from it: the copy is the thing under test, and a domain-side test could
 * only compare the copy to itself.
 *
 * Both say 2 today: `DOC_SCHEMA_VERSION` moved to 2 for the new node types in
 * Plan 4 of the notes series, and `EMPTY_NOTE_DOC` was raised to match it. A
 * further raise must move both again — this test is what makes forgetting one a
 * red rather than a note in a docblock.
 */
it('18.013 EMPTY_NOTE_DOC in domain equals emptyDoc() in editor', () => {
  expect(EMPTY_NOTE_DOC).toEqual(emptyDoc());
});
