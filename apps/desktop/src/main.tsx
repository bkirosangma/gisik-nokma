import React from 'react';
import { createRoot } from 'react-dom/client';
// The shared design-system stylesheet — the same one `apps/web` loads. Imported
// here rather than restated: `HelpBrowser` is one component rendered by both
// apps, so a second copy of its CSS would be two help screens drifting apart.
import '@gisik-nokma/ui/ui.css';
import { App } from './app.js';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
