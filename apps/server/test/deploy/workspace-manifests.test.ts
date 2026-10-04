import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 29.004 (Workflow and Timeline graphs, Part 1, T1): a NEW workspace package that an app builds from needs a line in all four
 * Dockerfiles (`COPY packages/<dir>/package.json packages/<dir>/`: the `pnpm fetch` layer's cache key, and an offline-store miss
 * at the install when it is absent, `apps/web/Dockerfile:17-20`) and a source mount in both services of `docker-compose.hot.yml`
 * (a `packages/<dir>/src` edit never reaches `dist` without it). The registry of what an app builds from is the workspace itself:
 * the `dependencies` closure of `apps/web` and `apps/server`, so a package added to app-core later is caught the day it is added.
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const read = (relative: string): string => readFileSync(resolve(ROOT, relative), 'utf8');
type Manifest = { name: string; dependencies?: Record<string, string> };
const manifest = (dir: string): Manifest => JSON.parse(read(`${dir}/package.json`)) as Manifest;

/** workspace package name -> directory, for every `packages/*` that has a manifest. */
function packageDirs(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const entry of readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })) {
    if (entry.isDirectory()) byName.set(manifest(`packages/${entry.name}`).name, `packages/${entry.name}`);
  }
  return byName;
}

/** The `packages/*` directories an app builds from: its workspace `dependencies`, and theirs, transitively. */
export function builtFrom(appDir: string, byName: ReadonlyMap<string, string>): string[] {
  const seen = new Set<string>();
  const walk = (dir: string): void => {
    for (const [name, range] of Object.entries(manifest(dir).dependencies ?? {})) {
      const child = byName.get(name);
      if (range.startsWith('workspace:') && child !== undefined && !seen.has(child)) {
        seen.add(child);
        walk(child);
      }
    }
  };
  walk(appDir);
  return [...seen].sort();
}

const DOCKERFILES = ['apps/web/Dockerfile', 'apps/web/Dockerfile.dev', 'apps/server/Dockerfile', 'apps/server/Dockerfile.dev'] as const;
const byName = packageDirs();
const closure = [...new Set([...builtFrom('apps/web', byName), ...builtFrom('apps/server', byName)])].sort();

describe('29.004 every workspace package an app builds from is registered in the four Dockerfiles and both hot-mode services', () => {
  it('29.004 the closure is read from the manifests and names the packages the images build; control: a private test package is not in it', () => {
    expect(closure).toEqual(expect.arrayContaining(['packages/app-core', 'packages/domain', 'packages/ui', 'packages/viewport']));
    expect(closure).not.toContain('packages/workflow-canvas-browser');
    expect(closure).not.toContain('packages/flow-graph-browser');
  });

  for (const dockerfile of DOCKERFILES) {
    it(`29.004 ${dockerfile} copies every one of their manifests`, () => {
      const text = read(dockerfile);
      const missing = closure.filter((dir) => !text.includes(`COPY ${dir}/package.json ${dir}/`));
      expect(missing, `${dockerfile} lacks: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('29.004 docker-compose.hot.yml mounts every one of their sources in the server service and in the web service', () => {
    const compose = read('docker-compose.hot.yml');
    const at = compose.search(/^ {2}web:$/m);
    const server = compose.slice(compose.search(/^ {2}server:$/m), at);
    const web = compose.slice(at);
    for (const [name, text] of [['server', server], ['web', web]] as const) {
      const missing = closure.filter((dir) => !text.includes(`./${dir}/src:/repo/${dir}/src`));
      expect(missing, `the ${name} service lacks: ${missing.join(', ')}`).toEqual([]);
    }
    // CONTROL, same it: the split found two non-empty services, so the loop above could fail.
    expect(server.length).toBeGreaterThan(500);
    expect(web.length).toBeGreaterThan(500);
  });
});
