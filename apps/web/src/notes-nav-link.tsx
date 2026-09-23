'use client';

import Link from 'next/link';
import { PageIcon } from '@gisik-nokma/ui';

/**
 * The Notes destination in the nav, immediately LEFT of the inbox (spec §9.1).
 *
 * ## Why `active` is a prop and not read from `usePathname` here
 *
 * It is passed for the same reason `InboxNavLink`'s is: `AppNav` already reads
 * the pathname, and a second read inside this component would be a second
 * spelling of "am I on this route". The route rule is the caller's, and it is
 * the one interesting thing about this link — `pathname === '/notes' ||
 * pathname.startsWith('/notes/')`, the FIRST prefix match in a bar where every
 * sibling item is exact equality (`app-nav.tsx:230`). `/notes/<id>` draws the
 * same view with a note open, so the link must stay lit on it; case 18.182 is
 * the witness, and it walks both spellings plus the control.
 *
 * ## Why there is no session gate here, unlike the inbox
 *
 * `InboxNavLink` polls an unread count, so it must decide what to do without a
 * session. This link reads nothing, and it is rendered inside `AppNav`'s
 * signed-in corner (`app-nav.tsx:465-470`) — an unrendered link has no state to
 * get wrong, and a second gate here would be a claim that the corner's is not
 * enough.
 */
export function NotesNavLink({ active = false }: { active?: boolean } = {}) {
  return (
    <Link
      href="/notes"
      className="gn-nav__notes"
      aria-current={active ? 'page' : undefined}
    >
      <PageIcon />
      Notes
    </Link>
  );
}
