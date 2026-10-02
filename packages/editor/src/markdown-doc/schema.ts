import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { buildEditorExtensions } from '../schema/extensions.js';

let cached: Schema | null = null;

/**
 * Schema v2, built from the editor's OWN extension list (spec §3, M-E8), once.
 * `getSchema` walks extension configs and never builds a view, so this runs on
 * the server; the DOM appears only inside popup/node-view functions nothing here
 * calls (case 26.001 runs this module under the node environment).
 */
export function markdownSchema(): Schema {
  cached ??= getSchema(buildEditorExtensions());
  return cached;
}
