import { describe, expect, it } from 'vitest';
import { DOC_SCHEMA_VERSION, emptyDoc } from '../src/doc.js';
import { createTestEditor } from './helpers/create-editor.js';

describe('9.262 schema version 2', () => {
  it('9.262 emptyDoc carries version 2; a v1 document round-trips unchanged', () => {
    expect(DOC_SCHEMA_VERSION).toBe(2);
    expect(emptyDoc().attrs).toEqual({ schemaVersion: 2 });
    const v1 = { type: 'doc', attrs: { schemaVersion: 1 }, content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Old' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'body', marks: [{ type: 'bold' }] }] },
    ] };
    const editor = createTestEditor(undefined, v1);
    expect(editor.getJSON().content).toEqual(v1.content); // content untouched
    editor.destroy();
  });
});
