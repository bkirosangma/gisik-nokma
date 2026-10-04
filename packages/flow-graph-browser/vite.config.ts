import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { parseResult } from './harness/results.js';

// The harness serves the REAL built `@gisik-nokma/app-core` so a browser measures the view the product ships. Port 3192, never
// 3190 (G-9's harness), 3191 (the Knowledge Graph's) or 3001 (the dev stack).
// `--host` (vite CLI) serves it on the LAN: that is how a real phone opens `stress.html?auto=1`. A run posts its record to
// /__results and this plugin appends one line per accepted run to results/stress.jsonl (gitignored).
function results(): Plugin {
  return {
    name: 'stress-results',
    configureServer(server) {
      server.middlewares.use('/__results', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = null;
          }
          const verdict = parseResult(parsed);
          if (!verdict.ok) {
            res.statusCode = 400;
            res.end(verdict.reason);
            return;
          }
          mkdirSync(resolve(__dirname, 'results'), { recursive: true });
          appendFileSync(resolve(__dirname, 'results/stress.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...verdict.record })}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  root: 'harness',
  esbuild: { jsx: 'automatic' },
  // The automatic runtime is injected by esbuild, so the dependency scan never sees it: without this Vite discovers it on the
  // first page load and RELOADS the page mid-test.
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  plugins: [results()],
  server: { port: 3192, strictPort: true },
  build: { rollupOptions: { input: [resolve(__dirname, 'harness/stress.html')] } },
});
