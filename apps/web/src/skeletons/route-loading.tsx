import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

/**
 * The two places a route waits for its own code rather than for data (smoothness T10; spec D6, S9). Both sit inside the page's real
 * `<main>` and `AppNav`, which render at once; only the heavy region is replaced, in its own container class, so its arrival moves nothing.
 */

/** The manual's frame (`.gn-help`) while the manual's text and search load. */
export function HelpLoading() {
  return (
    <SkeletonRegion label="Loading the manual" className="gn-help">
      <Skeleton shape="line" width="min(32rem, 100%)" rows={8} />
    </SkeletonRegion>
  );
}

/** The workflow builder's frame (`.workflow-builder-screen`) while the canvas loads. */
export function WorkflowBuilderLoading() {
  return (
    <SkeletonRegion label="Loading the workflow builder" className="workflow-builder-screen">
      <Skeleton shape="line" width="40%" />
      <Skeleton shape="block" width="100%" height="24rem" />
    </SkeletonRegion>
  );
}
