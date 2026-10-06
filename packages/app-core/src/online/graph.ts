import type { GraphGroup, GraphRingResponse } from '@gisik-nokma/domain';
import type { HttpClient } from './http.js';

/** One ring of the Knowledge Graph (spec C §2.2): the items at exactly `hops` steps from `center`, inside the chosen scope. */
export type GraphRingQuery = {
  center: string;
  hops: number;
  workspaceIds: readonly string[];
  projectIds: readonly string[];
  groups: readonly GraphGroup[];
};

/** Structurally the Knowledge Graph's `GraphSource`: app-core does not depend on the renderer package. */
export type GraphGateway = { ring(q: GraphRingQuery): Promise<GraphRingResponse> };

/**
 * `GET /v1/graph/neighbours` (`apps/server/src/routes/graph.ts`). `proj` is sent only when a project is chosen: an
 * empty `proj=` and an absent one parse the same on the server, but the URL is the cache key a test compares, so one
 * spelling. `groups` is always sent, empty included: an absent `groups` means the server's default set, an empty one
 * means the viewer turned every chip off.
 */
export function createHttpGraphGateway(http: HttpClient): GraphGateway {
  return {
    async ring(q) {
      const params = new URLSearchParams({
        center: q.center,
        hops: String(q.hops),
        ws: q.workspaceIds.join(','),
        groups: q.groups.join(','),
      });
      if (q.projectIds.length > 0) params.set('proj', q.projectIds.join(','));
      return (await http.get(`/v1/graph/neighbours?${params}`)) as GraphRingResponse;
    },
  };
}
