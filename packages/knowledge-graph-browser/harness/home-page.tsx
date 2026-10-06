import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// The web app's stylesheet, then ui.css: the order the BUILT app serves them (measured on the stack, 2026-10-06:
// globals.css's chunk is linked before ui.css's, although `apps/web/app/layout.tsx` imports ui.css first), so an
// equal-specificity tie is won here as it is in the product (kg-walk-fixes-2 item 2, case 27.687).
import '../../../apps/web/app/globals.css';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import type { HomeNumberKey, HomeResponse } from '@gisik-nokma/domain';
import type { GraphSource, ScopeChoices } from '@gisik-nokma/knowledge-graph';
// The web app's own Home components, unchanged (`next/dynamic` is aliased to `next-dynamic-shim.tsx`).
import { HomeNumbers } from '../../../apps/web/src/home/home-numbers.js';
import { HomeGraph } from '../../../apps/web/src/home/home-graph.js';
import { HomeGraphPlaceholder } from '../../../apps/web/src/home/home-graph-canvas.js';
import { fixtureItems } from './fixture.js';
import { fixtureRing } from './fixture-source.js';

/*
 * Home's body in a real browser (kg-walk-fixes-2 items 1-3): the web app's REAL `HomeNumbers`, `HomeGraphPlaceholder` and
 * `HomeGraph` (the highlight note, Start from and spec C's view on the fixture's workspace `wgn`), composed as
 * `home-screen.tsx`'s body composes them inside `.gn-shell > .gn-home`, with globals.css. Neo light by default.
 * - `?numbers=held`: the numbers read has not answered (the placeholder grid) until `window.__home.release()`.
 * - `?scope=held`: the scope pickers' read has not answered, so the graph is `HomeGraphPlaceholder` (the walk's state).
 * - `?press=tickets|…`: that number is pressed once the numbers are in (the highlight note's sentence).
 * - `?theme=dark`, `?style=hig|minimal`.
 */
const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.style = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const ITEMS = fixtureItems();
const idsOf = (kind: string) => ITEMS.filter((i) => i.kind === kind).map((i) => i.id);
const HOME: HomeResponse = {
  workspaceId: 'wgn',
  generatedAt: '2026-10-06T09:00:00.000Z',
  dueSoonDays: 7,
  counts: { tickets: 364, open: 212, pastDue: 3, dueSoon: 9, members: 12, notes: 41 },
  ids: { tickets: idsOf('ticket'), open: idsOf('ticket'), pastDue: idsOf('ticket').slice(0, 3), dueSoon: idsOf('ticket').slice(0, 9), members: idsOf('person'), notes: idsOf('note') },
};
const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'wgn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};
const phone = window.matchMedia('(max-width: 40rem)').matches;
/*
 * Home ties its centre and its default scope to ONE workspace id; the fixture names the workspace node `wgn` and its
 * items' workspace `gn`. The source speaks `wgn` both ways: the query's id is mapped to the fixture's, and every answer's
 * `workspaceId` back.
 */
const toFixture = (ids: readonly string[]) => ids.map((w) => (w === 'wgn' ? 'gn' : w));
const toHome = <T extends { workspaceId: string | null }>(item: T): T => (item.workspaceId === 'gn' ? { ...item, workspaceId: 'wgn' } : item);
const source: GraphSource = {
  ring: async (q) => {
    const r = await fixtureRing({ ...q, workspaceIds: toFixture(q.workspaceIds), projectIds: [...q.projectIds], groups: [...q.groups] });
    return { ...r, center: toHome(r.center), items: r.items.map(toHome) };
  },
};

const hooks: { release: () => void } = { release: () => undefined };
declare global {
  interface Window {
    __home: { release: () => void };
  }
}
window.__home = { release: () => hooks.release() };

function HomeBody() {
  const [home, setHome] = useState<HomeResponse | null>(params.get('numbers') === 'held' ? null : HOME);
  const [pressed, setPressed] = useState<HomeNumberKey | null>(null);
  useEffect(() => {
    hooks.release = () => setHome(HOME);
  }, []);
  useEffect(() => {
    const press = params.get('press') as HomeNumberKey | null;
    if (home !== null && press !== null) setPressed(press);
  }, [home]);
  return (
    <main id="gn-main" className="gn-shell">
      <div className="gn-home">
        <h1 className="gn-page-title">Gisik Nokma</h1>
        <HomeNumbers home={home} failed={false} onRetry={() => undefined} pressed={pressed} onToggle={(k) => setPressed((p) => (p === k ? null : k))} dueSoonDays={7} />
        {params.get('scope') === 'held' ? (
          <HomeGraphPlaceholder />
        ) : (
          <HomeGraph
            workspaceId="wgn"
            viewerId="pA"
            home={home}
            pressed={pressed}
            onEscape={() => false}
            phone={phone}
            source={source}
            scope={SCOPE}
            onOpen={() => undefined}
            canOpen={() => false}
          />
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<HomeBody />);
