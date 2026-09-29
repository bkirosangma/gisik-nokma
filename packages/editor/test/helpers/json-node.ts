import type { NodeType, TextType } from '@tiptap/core';

type JSONNode = NodeType | TextType;

/**
 * `editor.getJSON()`'s content array is typed `(NodeType | TextType)[]` —
 * `TextType` alone carries `.text`, `NodeType` alone carries `.content`, and
 * neither branch has the other. A plain `n.text`/`n.content` access does not
 * compile on the union; narrow with these guards first.
 */
export function isTextNode(node: JSONNode): node is TextType {
  return node.type === 'text';
}

/** The complement of {@link isTextNode} — anything with a `.content` array. */
export function isElementNode(node: JSONNode): node is NodeType {
  return node.type !== 'text';
}
