import { ListPageShell } from '../../../src/skeletons/page-shells.js';

/** Smoothness T5 (spec D5): the route's wireframe while its segment loads. */
export default function WorkspaceHomeLoading() {
  return <ListPageShell title="the workspace" rows={4} />;
}
