export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

/**
 * A tool answer that is NOT one JSON text block — today, an image from `get_attachment` (spec §4). Every
 * other tool answers a plain value, which `registerToolDefinitions` serializes; only this class passes through as is.
 */
export class ToolReply {
  constructor(readonly content: ContentBlock[]) {}
}
