import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
// The three stylesheets in the order the BUILT app links them (measured on the stack, 2026-10-06): globals.css's chunk,
// then ui.css's, then the editor's. `apps/web/app/layout.tsx` imports them ui, editor, globals; Next does not keep that.
import '../../../apps/web/app/globals.css';
import '@gisik-nokma/ui/ui.css';
import '../../editor/src/styles/editor.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { SkeletonRegion } from '@gisik-nokma/ui';

/*
 * Every `SkeletonRegion` that names a container class keeps that container's layout (kg-walk-fixes-2 item 5, case 27.695).
 * The spec scans the repo for each `<SkeletonRegion className=…>` and hands the list in as `window.__regionEntries`; for each
 * one this page renders the REAL `SkeletonRegion` (its `as` tag, that className) beside a plain element of the same tag and
 * class (the container itself), each pair in its own wrapper inside a page `main.gn-shell` (not a route shell's
 * `.gn-shell--skeleton`, whose regions are `contents` by design). And the one `as="li"` site as the notes history panel
 * draws it (`apps/web/src/notes/history-panel.tsx`): an `li` region inside `ul.gn-notes__history-list`. Neo light.
 */
declare global {
  interface Window {
    __regionEntries?: { id: string; className: string; as: 'div' | 'section' | 'li' }[];
  }
}
document.documentElement.dataset.style = 'neo';
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const entries = window.__regionEntries ?? [];
createRoot(document.getElementById('root')!).render(
  <main className="gn-shell">
    {entries.map((entry) => {
      const holder = entry.as === 'li' ? 'ul' : 'div';
      return (
        <div key={entry.id} data-entry={entry.id}>
          {createElement(holder, null,
            <SkeletonRegion as={entry.as} label={`Loading ${entry.id}`} className={entry.className}>
              <span />
            </SkeletonRegion>,
          )}
          {createElement(holder, null, createElement(entry.as, { className: entry.className, 'data-container': '' }))}
        </div>
      );
    })}
    <ul className="gn-notes__history-list" data-history="">
      <SkeletonRegion as="li" label="Loading history">
        <span />
      </SkeletonRegion>
    </ul>
  </main>,
);
