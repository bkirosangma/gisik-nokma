'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import type { TicketEditorSlotProps } from '@gisik-nokma/editor';
import { EditorSkeleton } from './skeletons/editor-skeleton.js';

/**
 * The ticket editor, loaded the first time one is shown (smoothness T10; spec D6, S9; audit SM-04, SM-16).
 *
 * Tiptap and ProseMirror are most of what a route weighs, and a route that never opens an editor should not carry them. The page
 * imports THIS module instead of `@gisik-nokma/editor`; the editor chunk is fetched when the slot first renders, or earlier when
 * `prefetchEditor()` is called (a ticket is about to open). Until it arrives the slot draws `EditorSkeleton` built from the slot's OWN
 * props (`mode`, whether it has an uploader, whether it is read-only), because `next/dynamic`'s `loading` receives none and the
 * skeleton must be the slot's box per mode (S-R1 rule 1). Client-only by construction: the import runs in an effect, so the server
 * and the first client render both paint the skeleton and there is no markup to disagree with.
 */
let Loaded: ComponentType<TicketEditorSlotProps> | null = null;
// One load for every slot on the page (a sheet mounts a description and a comment composer, and prefetch may already be in flight).
let loading: Promise<ComponentType<TicketEditorSlotProps>> | null = null;
const load = () =>
  (loading ??= import('@gisik-nokma/editor').then((module) => {
    Loaded = module.TicketEditorSlot;
    return Loaded;
  }));

// `useState(() => Loaded)` and `setEditor(() => component)`: a component is a function, and React would CALL a bare one as an initializer/updater.
export const TicketEditorSlot = (props: TicketEditorSlotProps) => {
  const [Editor, setEditor] = useState<ComponentType<TicketEditorSlotProps> | null>(() => Loaded);
  useEffect(() => {
    if (Editor !== null) return;
    let live = true;
    void load().then((component) => {
      if (live) setEditor(() => component);
    });
    return () => {
      live = false;
    };
  }, [Editor]);
  if (Editor === null) {
    return <EditorSkeleton mode={props.mode} attach={props.uploadAttachment !== undefined} readOnly={props.readOnly} />;
  }
  return <Editor {...props} />;
};

// Only the fetch helper, from its own subpath, so importing it drags no Tiptap (`packages/editor/package.json` `./upload`).
export { uploadAttachmentHttp } from '@gisik-nokma/editor/upload';

/** Warm the editor chunk when a ticket or note is about to be shown. */
export function prefetchEditor(): void {
  void load();
}
