import { defineConfig } from 'vite';

// The harness serves the REAL builder (the built `@gisik-nokma/app-core`) so a browser measures the same canvas the
// product ships. Port 3190, never 3001: that one is the dev stack's.
export default defineConfig({
  root: 'harness',
  esbuild: { jsx: 'automatic' },
  // The automatic runtime is injected by esbuild, so the dependency scan never sees it: without this Vite discovers it on the
  // first page load and RELOADS the page mid-test.
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  server: { port: 3190, strictPort: true },
});
