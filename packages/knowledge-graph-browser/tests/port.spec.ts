import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// 27.360 / 27.361: the harness port is KG_PW_PORT, else 3191. The RESOLVED playwright config is read in a fresh node (strip-types loads the .ts file as
// the runner does), once per env, so a config that ignored the variable cannot pass on a helper's say-so. No page, no browser.
const root = resolve(import.meta.dirname, '..');
function viteServer(port: string | undefined): { port: number; strictPort: boolean } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (port === undefined) delete env.KG_PW_PORT; else env.KG_PW_PORT = port;
  // vite's own loader: the config uses `__dirname`, which a bare node import of the file would not define.
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { loadConfigFromFile } from 'vite'; const r = await loadConfigFromFile({ command: 'serve', mode: 'development' }, 'vite.config.ts', process.cwd()); console.log(JSON.stringify(r.config.server));"],
  { cwd: root, env, encoding: 'utf8' });
  return JSON.parse(out) as { port: number; strictPort: boolean };
}
function resolved(port: string | undefined): { baseURL: string; url: string; command: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (port === undefined) delete env.KG_PW_PORT; else env.KG_PW_PORT = port;
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
    "const c = (await import('./playwright.config.ts')).default; console.log(JSON.stringify({ baseURL: c.use.baseURL, url: c.webServer.url, command: c.webServer.command }));"],
  { cwd: root, env, encoding: 'utf8' });
  return JSON.parse(out) as { baseURL: string; url: string; command: string };
}

test('27.360 KG_PW_PORT moves the webServer url, the base url and the vite port together', () => {
  const c = resolved('3377');
  expect(c.url).toBe('http://localhost:3377');
  expect(c.baseURL).toBe('http://localhost:3377');
  expect(c.command).toContain('--port 3377 --strictPort');
});

test('27.361 CONTROL: with KG_PW_PORT unset the port is 3191', () => {
  const c = resolved(undefined);
  expect(c.url).toBe('http://localhost:3191');
  expect(c.baseURL).toBe('http://localhost:3191');
  expect(c.command).toContain('--port 3191 --strictPort');
});

test('27.362 the dev server of `vite.config.ts` listens on KG_PW_PORT, strictly; CONTROL: 3191 when it is unset', () => {
  expect(viteServer('3377')).toEqual({ port: 3377, strictPort: true });
  expect(viteServer(undefined)).toEqual({ port: 3191, strictPort: true });
});
