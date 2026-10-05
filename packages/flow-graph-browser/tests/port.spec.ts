import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// 13.2290 / 13.2291 / 13.2292: the harness port is FG_PW_PORT, else 3192. The RESOLVED playwright config is read in a fresh node (strip-types loads the .ts
// file as the runner does), once per env, so a config that ignored the variable cannot pass on a helper's say-so. No page, no browser. 13.2293 reads turbo's dry JSON instead.
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

test('13.2292 a HELD port is not drifted off: reuseExistingServer off, and the config\'s own vite command on a held port exits non-zero with "in use"', async () => {
  expect(resolved('3378').reuse).toBe(false);
  // vite listens on `localhost`, which is ::1 or 127.0.0.1 by the machine's resolver: hold the same port on both (a wildcard holder does not stop a specific bind on macOS).
  const held = createServer();
  await new Promise<void>((ok) => held.listen(0, '127.0.0.1', ok));
  const heldPort = (held.address() as { port: number }).port;
  const held6 = createServer();
  await new Promise<void>((ok) => held6.listen(heldPort, '::1', ok));
  try {
    // The REAL run: the config resolved under FG_PW_PORT=<heldPort> names the held port in its own command; its arguments (after the `vite` binary) are what runs.
    const c = resolved(String(heldPort));
    const args = c.command.split(/\s+/);
    expect(args[0]).toBe('vite');
    expect(args).toContain(String(heldPort));
    let failed = false;
    try {
      execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), ...args.slice(1)],
        { cwd: root, env: envFor(String(heldPort)), encoding: 'utf8', stdio: 'pipe', timeout: 30_000 });
    } catch (e) {
      failed = true;
      const err = e as { code?: string; status?: number | null; stderr?: string; stdout?: string };
      // A vite that DRIFTED (no strictPort) also prints "Port N is in use, trying another one…" and then serves until the timeout kills it (code ETIMEDOUT, and vite exits on that SIGTERM with its own status): only a real non-zero EXIT before the timeout is the fail-loud.
      expect(err.code).not.toBe('ETIMEDOUT');
      expect(typeof err.status === 'number' && err.status !== 0).toBe(true);
      expect(String(err.stderr) + String(err.stdout)).toMatch(/in use/i);
    }
    expect(failed).toBe(true);
    // The command's own flag, pinned apart from the run: vite.config.ts also sets strictPort, so the run alone would not notice a command that dropped it.
    expect(c.command).toContain('--strictPort');
  } finally {
    held.close();
    held6.close();
  }
});

test('13.2293 turbo hands FG_PW_PORT to flow-graph-browser#test as a pass-through variable, and a pass-through is not hashed (the gate\'s port survives strict env mode)', () => {
  // turbo's own dry JSON, the consumer's parser, from the repo root; KG_PW_PORT is exported as well so the absence of it in this task's list is a real haystack control.
  const repoRoot = resolve(root, '../..');
  const task = (port: string): { envMode: string; hash: string; passthrough: string[] } => {
    const out = execFileSync(resolve(repoRoot, 'node_modules/.bin/turbo'), ['run', 'test', '--filter=@gisik-nokma/flow-graph-browser', '--dry=json'],
      { cwd: repoRoot, env: { ...process.env, FG_PW_PORT: port, KG_PW_PORT: '4999' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const dry = JSON.parse(out) as { envMode: string; tasks: { taskId: string; hash: string; environmentVariables: { passthrough: string[] | null } }[] };
    const t = dry.tasks.find((x) => x.taskId === '@gisik-nokma/flow-graph-browser#test');
    expect(t).toBeDefined();
    return { envMode: dry.envMode, hash: t!.hash, passthrough: t!.environmentVariables.passthrough ?? [] };
  };
  const a = task('3292');
  const b = task('3293');
  expect(a.envMode).toBe('strict'); // the control: under loose mode every variable reaches the task and the claim below is vacuous
  expect(a.passthrough.some((v) => v.startsWith('FG_PW_PORT='))).toBe(true);
  expect(a.passthrough.some((v) => v.startsWith('KG_PW_PORT='))).toBe(false);
  expect(b.passthrough.some((v) => v.startsWith('FG_PW_PORT='))).toBe(true);
  expect(a.hash).toBe(b.hash); // a pass-through is not hashed: an `env` entry would split the cache per port
});
