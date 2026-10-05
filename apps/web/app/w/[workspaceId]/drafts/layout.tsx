import type { ReactNode } from 'react';
import { documentTitleFor } from '../../../../src/page-title.js';

/** Drafts T8: this segment's title, rendered by the SERVER (the page is `'use client'`; see `my-work/layout.tsx`). */
export const metadata = { title: documentTitleFor('Drafts') };

export default function DraftsLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
