'use client';
import dynamic from 'next/dynamic';
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

/**
 * The canvas's box while the view is not there yet: its chunk is loading, or Home is still reading the scope pickers'
 * options. It is the view's canvas height (`.gn-kg__canvas`, `ui.css`), as `GraphPanel`'s loading box is, so the numbers
 * and the note above it never move when the view arrives. Spec C's ring skeleton is the view's own, inside its canvas,
 * while ring 1 loads; C exports no component for it.
 */
export function HomeGraphPlaceholder() {
  return (
    <SkeletonRegion label="Loading the Knowledge Graph" className="gn-home__graph-placeholder">
      <Skeleton shape="block" height="100%" />
    </SkeletonRegion>
  );
}

/**
 * The ONE door from Home to `KnowledgeGraph` (27.657). `/` is a server page, so anything it imports is rendered on the
 * server too, and the view reaches for `window`, `matchMedia` and WebGL; `ssr: false` keeps it to the browser.
 */
export const HomeGraphCanvas = dynamic(() => import('@gisik-nokma/knowledge-graph').then((m) => m.KnowledgeGraph), {
  ssr: false,
  loading: () => <HomeGraphPlaceholder />,
});
