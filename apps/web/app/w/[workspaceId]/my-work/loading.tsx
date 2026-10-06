import { MyWorkPageShell } from '../../../../src/skeletons/page-shells.js';

/** Smoothness T5 (spec D5): the route's wireframe while its segment loads — now the redirect's, so it paints the global page's shell (my-work-global T4). */
export default function MyWorkLoading() {
  return <MyWorkPageShell />;
}
