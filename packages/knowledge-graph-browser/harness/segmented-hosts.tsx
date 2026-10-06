import { useState } from 'react';
import { createRoot } from 'react-dom/client';
// The web app's stylesheet, then ui.css: the order the BUILT app serves them (measured on the stack, 2026-10-06:
// globals.css's chunk is linked before ui.css's, although `apps/web/app/layout.tsx` imports ui.css first), so an
// equal-specificity tie is won here as it is in the product (kg-walk-fixes-2 item 2, case 27.687).
import '../../../apps/web/app/globals.css';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { GroupToggle, type MyWorkGrouping } from '@gisik-nokma/app-core';
import { AppearanceSection } from '../../../apps/web/src/account/appearance-section.js';

/*
 * The two segmented hosts whose one-line labels outgrow their box on a phone (kg-walk-fixes-2 item 1, case 27.686): the
 * REAL `/account` Appearance card (`AppearanceSection`: Style, Theme) in the account page's own `main.gn-shell.gn-account >
 * .gn-account__column`, and the REAL My work "Group" pair (`GroupToggle`) in that page's `main.gn-shell > .gn-shell__main >
 * .gn-my-work-controls`. The legs pin the boxes against the live app's (the card's content is `viewport - 88px`, the
 * Group row `viewport - 48px`), so a harness that drifted from the product's chrome fails instead of measuring air.
 * Neo by default, as the shell; `?theme=dark`.
 */
const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.style = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

function MyWorkGroup() {
  const [grouping, setGrouping] = useState<MyWorkGrouping>('workspace-project');
  return (
    <main className="gn-shell">
      <div className="gn-shell__main">
        <div className="gn-my-work-controls">
          <GroupToggle value={grouping} onChange={setGrouping} />
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <main className="gn-shell gn-account">
      <div className="gn-account__column">
        <AppearanceSection />
      </div>
    </main>
    <MyWorkGroup />
  </>,
);
