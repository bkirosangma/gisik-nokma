export const DOC_SCHEMA_VERSION = 1;

/**
 * A ticket document as it travels inside event payloads (`comment.added`
 * body, description `ticket.field_set` value): ProseMirror JSON, opaque
 * outside this package. The doc node's attrs carry `schemaVersion`, so
 * every stored document names the schema that wrote it — versioning rides
 * inside the JSON, and older version-less docs parse with the default.
 */
export type DocJson = { type: 'doc' } & Record<string, unknown>;

export function emptyDoc(): DocJson {
  return {
    type: 'doc',
    attrs: { schemaVersion: DOC_SCHEMA_VERSION },
    content: [{ type: 'paragraph' }],
  };
}

export function isDocJson(value: unknown): value is DocJson {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'doc'
  );
}
