import React from 'react';
import { createRoot } from 'react-dom/client';
// The shared design-system stylesheet — the same one `apps/web` loads. Imported
// here rather than restated: `HelpBrowser` is one component rendered by both
// apps, so a second copy of its CSS would be two help screens drifting apart.
import '@gisik-nokma/ui/ui.css';
// ui.css REFERENCES the design tokens and defines none of them — the definitions
// come from `themeStylesheet()`, which until pre-launch item 6 only `apps/web`
// ever emitted. Without this line every `var(--gn-…)` above resolves to nothing
// and this window renders on browser defaults. See `theme.ts`.
import { installTheme } from './theme.js';
import { App } from './app.js';

installTheme(document);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
