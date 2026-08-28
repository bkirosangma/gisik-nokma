import { Document } from '@tiptap/extension-document';
import { DOC_SCHEMA_VERSION } from '../doc.js';

/**
 * The stock document node plus a `schemaVersion` attribute. `rendered:
 * false` keeps it out of the DOM — it exists purely in the serialized
 * JSON, where projections and future migrations can read it.
 */
export const VersionedDocument = Document.extend({
  addAttributes() {
    return {
      schemaVersion: { default: DOC_SCHEMA_VERSION, rendered: false },
    };
  },
});
