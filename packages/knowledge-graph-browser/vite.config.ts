import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The harness serves the REAL package (the built `@gisik-nokma/knowledge-graph`) so a browser measures the same Sigma
// configuration the product ships. Port 3191, never 3190 (G-9's harness) or 3001 (the dev stack).
export default defineConfig({
  root: 'harness',
  esbuild: { jsx: 'automatic' },
  // The automatic runtime is injected by esbuild, so the dependency scan never sees it: without this Vite discovers it on the
  // first page load and RELOADS the page mid-test.
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  server: { port: 3191, strictPort: true },
  build: { rollupOptions: { input: [resolve(__dirname, 'harness/index.html'), resolve(__dirname, 'harness/stress.html'), resolve(__dirname, 'harness/adapter.html')] } },
});
