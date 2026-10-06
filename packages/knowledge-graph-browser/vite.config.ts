import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The harness serves the REAL package (the built `@gisik-nokma/knowledge-graph`) so a browser measures the same Sigma
// configuration the product ships. Port KG_PW_PORT, else 3191 (never 3190, G-9's harness, or 3001, the dev stack); playwright.config.ts passes the same port.
export default defineConfig({
  root: 'harness',
  // The web app's Home components load spec C's view through `next/dynamic` (`home-graph-canvas.tsx`); the harness has no
  // Next, so the import is answered by a React.lazy stand-in (`harness/next-dynamic-shim.tsx`, kg-walk-fixes-2).
  resolve: { alias: { 'next/dynamic': resolve(__dirname, 'harness/next-dynamic-shim.tsx') } },
  esbuild: { jsx: 'automatic' },
  // The automatic runtime is injected by esbuild, so the dependency scan never sees it: without this Vite discovers it on the
  // first page load and RELOADS the page mid-test.
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  server: { port: Number(process.env.KG_PW_PORT) || 3191, strictPort: true },
  build: { rollupOptions: { input: [resolve(__dirname, 'harness/index.html'), resolve(__dirname, 'harness/stress.html'), resolve(__dirname, 'harness/adapter.html'), resolve(__dirname, 'harness/home.html')] } },
});
