'use client';

import type { TicketEditorSlotProps } from '@gisik-nokma/editor';
import dynamic from 'next/dynamic';
import { EditorSkeleton } from './skeletons/editor-skeleton.js';

/**
 * The ticket editor, loaded the first time one is shown (smoothness T10; spec D6, S9; audit SM-04, SM-16).
 *
 * Tiptap and ProseMirror are most of what a route weighs, and a route that never opens an editor should not carry them. The page
 * imports THIS module instead of `@gisik-nokma/editor`; the editor chunk is fetched when the slot first renders, behind a skeleton of
 * the slot's own shape, or earlier when `prefetchEditor()` is called (a ticket is about to open). `ssr: false`: the editor is
 * client-only (it needs a DOM), so there is no server markup to disagree with.
 */
const load = () => import('@gisik-nokma/editor');

const LazyTicketEditorSlot = dynamic(() => load().then((module) => module.TicketEditorSlot), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

// `dynamic()` types as a `ComponentType`; the mounts take app-core's function-shaped `EditorSlotComponent`, which the editor's own
// props satisfy structurally (`TicketEditorSlot.tsx`). A type-only import is erased, so it adds no editor bytes to the route.
export const TicketEditorSlot = (props: TicketEditorSlotProps) => <LazyTicketEditorSlot {...props} />;

// Only the fetch helper, from its own subpath, so importing it drags no Tiptap (`packages/editor/package.json` `./upload`).
export { uploadAttachmentHttp } from '@gisik-nokma/editor/upload';

/** Warm the editor chunk when a ticket or note is about to be shown. */
export function prefetchEditor(): void {
  void load();
}
