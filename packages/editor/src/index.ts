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
  mentionAttrsOf,
  mentionSuggestionKey,
  type MentionAttrs,
  type MentionCandidate,
  type MentionOptions,
} from './extensions/mention.js';
export {
  createMentionPopup,
  mentionResultAnnouncement,
  type MentionPopupProps,
  type MentionPopupRenderer,
} from './extensions/mention-popup.js';
export {
  EscapeSuggestion,
  escapeSuggestionKey,
  getEscapeSuggestion,
} from './extensions/escape-suggestion.js';
export { UploadRefusedError, uploadAttachmentHttp, type UploadResult } from './upload.js';
export {
  attachmentPasteKey,
  createAttachmentPasteExtension,
  type AttachmentPasteOptions,
} from './extensions/attachment-paste.js';
export { TicketEditor, type TicketEditorProps } from './components/TicketEditor.js';
export { ImageWrapMenu } from './components/ImageWrapMenu.js';
export {
  createBrowserPickerDeps,
  openDrivePicker,
  requestDriveFileToken,
  toDriveReference,
  GOOGLE_API_SRC,
  GOOGLE_GSI_SRC,
  type DrivePickerConfig,
  type DrivePickerDeps,
  type PickedDriveFile,
} from './drive/google-picker.js';
export {
  composeDriveReferenceAdded,
  composeUploadAttachmentAdded,
  type DriveReferenceAddedEvent,
  type UploadAttachmentAddedEvent,
} from './drive/attachment-claims.js';
export {
  AttachmentListItem,
  DriveReferenceItem,
  UploadedAttachmentItem,
  describeDriveReachability,
  type AttachmentListEntry,
  type DriveLinkCheck,
} from './components/AttachmentListItem.js';
