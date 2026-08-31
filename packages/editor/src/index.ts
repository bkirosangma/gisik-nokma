export { DOC_SCHEMA_VERSION, emptyDoc, isDocJson, type DocJson } from './doc.js';
export { buildEditorExtensions, type EditorSchemaOptions } from './schema/extensions.js';
export {
  IMAGE_WRAP_MODES,
  TicketImage,
  type ImageWrapMode,
  type TicketImageOptions,
} from './extensions/ticket-image.js';
export {
  Mention,
  mentionLabelOf,
  mentionSuggestionKey,
  type MentionCandidate,
  type MentionOptions,
} from './extensions/mention.js';
