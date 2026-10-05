import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// 13.2290 / 13.2291 / 13.2292: the harness port is FG_PW_PORT, else 3192. The RESOLVED playwright config is read in a fresh node (strip-types loads the .ts
// file as the runner does), once per env, so a config that ignored the variable cannot pass on a helper's say-so. No page, no browser.
const root = resolve(import.meta.dirname, '..');
function envFor(port: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (port === undefined) delete env['FG_PW_PORT']; else env['FG_PW_PORT'] = port;
  return env;
}
function viteServer(port: string | undefined): { port: number; strictPort: boolean } {
  // vite's own loader: the config uses `__dirname`, which a bare node import of the file would not define.
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { loadConfigFromFile } from 'vite'; const r = await loadConfigFromFile({ command: 'serve', mode: 'development' }, 'vite.config.ts', process.cwd()); console.log(JSON.stringify(r.config.server));"],
  { cwd: root, env: envFor(port), encoding: 'utf8' });
  return JSON.parse(out) as { port: number; strictPort: boolean };
}
function resolved(port: string | undefined): { baseURL: string; url: string; command: string; reuse: boolean } {
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
    "const c = (await import('./playwright.config.ts')).default; console.log(JSON.stringify({ baseURL: c.use.baseURL, url: c.webServer.url, command: c.webServer.command, reuse: c.webServer.reuseExistingServer }));"],
  { cwd: root, env: envFor(port), encoding: 'utf8' });
  return JSON.parse(out) as { baseURL: string; url: string; command: string; reuse: boolean };
}

test('13.2290 CONTROL: with FG_PW_PORT unset the harness serves on 3192, in the config and in vite', () => {
  const c = resolved(undefined);
  expect(c.baseURL).toBe('http://localhost:3192');
  expect(c.url).toBe('http://localhost:3192/stress.html');
  expect(c.command).toContain('--port 3192 --strictPort');
  expect(viteServer(undefined)).toEqual({ port: 3192, strictPort: true });
});

test('13.2291 FG_PW_PORT moves the webServer url, the base url, the vite --port and the vite server together; 3192 is not named', () => {
  const c = resolved('3377');
  expect(c.baseURL).toBe('http://localhost:3377');
  expect(c.url).toBe('http://localhost:3377/stress.html');
  expect(c.command).toContain('--port 3377 --strictPort');
  expect(c.command).not.toContain('3192');
  expect(viteServer('3377')).toEqual({ port: 3377, strictPort: true });
});

test('13.2292 a HELD port is not drifted off: strictPort on, reuseExistingServer off, and vite on a held port exits non-zero', async () => {
  const c = resolved('3378');
  expect(c.reuse).toBe(false);
  expect(c.command).toContain('--strictPort');
  // vite listens on `localhost`, which is ::1 or 127.0.0.1 by the machine's resolver: hold the same port on both (a wildcard holder does not stop a specific bind on macOS).
  const held = createServer();
  await new Promise<void>((ok) => held.listen(0, '127.0.0.1', ok));
  const heldPort = (held.address() as { port: number }).port;
  const held6 = createServer();
  await new Promise<void>((ok) => held6.listen(heldPort, '::1', ok));
  try {
    let failed = false;
    try {
      execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.config.ts', '--port', String(heldPort), '--strictPort'],
        { cwd: root, env: envFor(String(heldPort)), encoding: 'utf8', stdio: 'pipe', timeout: 30_000 });
    } catch (e) {
      failed = true;
      expect(String((e as { stderr?: string }).stderr) + String((e as { stdout?: string }).stdout)).toMatch(/in use/i);
    }
    expect(failed).toBe(true);
  } finally {
    held.close();
    held6.close();
  }
});
