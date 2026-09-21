import type { ReactNode } from 'react';
import { documentTitleFor } from '../../../../../src/page-title.js';

/**
 * exec1 P12 — this segment's title, rendered by the SERVER.
 *
 * `page.tsx` beside it is `'use client'`, where Next IGNORES an exported
 * `metadata` without saying so. A route SEGMENT layout is a server component
 * even when the page beneath it is not, so the export is honoured here and the
 * title reaches the head BEFORE any JavaScript runs — see
 * `src/document-title.tsx` for the measured Chrome trace of why the
 * client-side alternative loses a race with React's head hydration.
 *
 * It renders its children unchanged: this file exists for its `metadata`
 * export, and a wrapper element here would move the page's own `<main>` one
 * level deeper for nothing.
 */
export const metadata = { title: documentTitleFor('Workflows') };

export default function WorkflowsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return children;
}
