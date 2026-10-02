'use client';
import { AnnounceRegion as UiAnnounceRegion } from '@gisik-nokma/ui';

/**
 * The shell's one polite status region (smoothness T5, spec §5), as a client boundary. `app/layout.tsx` is a server component and
 * `@gisik-nokma/ui`'s barrel is not marked `'use client'`, so importing the region straight from it breaks the build ("needs
 * useEffect"): this file is the same one-line wrapper `RouteAnnouncer` is, and the layout renders it beside that one.
 */
export function AnnounceRegion() {
  return <UiAnnounceRegion />;
}
