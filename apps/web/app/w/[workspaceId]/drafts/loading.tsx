import { ListPageShell } from '../../../../src/skeletons/page-shells.js';

/** Drafts T8 (smoothness spec D5): the route's wireframe while its segment loads. */
export default function DraftsLoading() {
  return <ListPageShell title="Drafts" rows={5} />;
}
