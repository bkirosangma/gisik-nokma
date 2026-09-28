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
export {
  exportMarkdown,
  htmlToMarkdown,
  looksLikeMarkdown,
  markdownToHtml,
} from './markdown/serializer.js';
export { MarkdownClipboard } from './extensions/markdown-clipboard.js';
export {
  WikiLink,
  wikiLinkSuggestionKey,
  type NoteLinkCandidate,
  type WikiLinkOptions,
} from './extensions/wiki-link.js';
export {
  createWikiLinkPopup,
  wikiLinkResultAnnouncement,
  type WikiLinkPopupProps,
  type WikiLinkPopupRenderer,
} from './extensions/wiki-link-popup.js';
export {
  extractReadingMeta,
  headerSlug,
  readingTimeMinutes,
  assignHeadingIds,
  type ReadingMeta,
} from './reading/reading-meta.js';
export { MIN_HEADINGS, ReadingTOC, type ReadingTOCProps } from './reading/ReadingTOC.js';
export { HeadingAnchors, headingAnchorsKey, type HeadingAnchorsOptions } from './extensions/heading-anchors.js';
export { ReadingProgress, type ReadingProgressProps } from './reading/ReadingProgress.js';
export { findScroller, readingProgress, type Scroller } from './reading/scroller.js';
export { UploadRefusedError, uploadAttachmentHttp, uploadNoteAttachmentHttp, type UploadResult } from './upload.js';
export {
  attachmentPasteKey,
  createAttachmentPasteExtension,
  type AttachmentPasteOptions,
} from './extensions/attachment-paste.js';
export { TicketEditor, type TicketEditorProps } from './components/TicketEditor.js';
export {
  EditorToolbar,
  MARKDOWN_HINT,
  type EditorToolbarProps,
} from './components/EditorToolbar.js';
export { LinkEditorPopover, type LinkEditorPopoverProps } from './components/LinkEditorPopover.js';
export { placePopover, type PlaceInput } from './components/popover-position.js';
export { TablePicker, TABLE_PICKER_SIZE, type TablePickerProps } from './components/TablePicker.js';
export {
  TableFloatingToolbar,
  type TableFloatingToolbarProps,
} from './components/TableFloatingToolbar.js';
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
export { transitionRequiresEvidence } from './attachments/require-evidence.js';
export { EvidencePicker, type AttachmentSummary, type EvidencePickerProps } from './components/EvidencePicker.js';
export {
  composeEditorSubmission,
  type EditorSubmission,
} from './attachments/compose-editor-submission.js';
export {
  TicketEditorSlot,
  type EditorSlotProps,
  type EditorSlotUpload,
  type TicketEditorSlotProps,
} from './components/TicketEditorSlot.js';
export {
  EDITOR_BRIDGE_VERSION,
  parseHostMessage,
  serializeEditorMessage,
  type EditorToHostMessage,
  type HostToEditorMessage,
} from './webview/bridge.js';
export { createEditorBridge, type EditorBridge, type EditorBridgeDeps } from './webview/create-editor-bridge.js';
