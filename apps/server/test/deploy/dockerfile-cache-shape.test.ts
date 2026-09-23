import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 13.1426/13.1427 — task/docker-build-cache.
 *
 * Measured baseline (App Platform build logs, deployment 88477008…): kaniko's
 * registry layer cache HITS for the `dev` stage's `RUN pnpm fetch`, but the
 * production `build` stage did `COPY . .` THEN `RUN pnpm install
 * --frozen-lockfile`, so the lockfile-keyed layer never existed for it — "No
 * cached layer found" on every deploy (71s server, 57s web). This change
 * gives the `build` stage the `dev` stage's own layering (manifests → `pnpm
 * fetch` → source → `pnpm install --offline`), so the fetch layer can be
 * cache-hit the same way.
 *
 * The `dev` stage itself is not built by any shipped path — App Platform
 * names no `--target`, so it built EVERY stage including this one (~2-3 min
 * per component for an image nothing runs). It moves out of the production
 * Dockerfiles into apps/{server,web}/Dockerfile.dev, which
 * `docker-compose.hot.yml`'s retired override now points at directly.
 */

const ROOT = resolve(import.meta.dirname, '../../../..');
const SERVER_DOCKERFILE_PATH = resolve(ROOT, 'apps/server/Dockerfile');
const WEB_DOCKERFILE_PATH = resolve(ROOT, 'apps/web/Dockerfile');
const SERVER_DEV_DOCKERFILE_PATH = resolve(ROOT, 'apps/server/Dockerfile.dev');
const WEB_DEV_DOCKERFILE_PATH = resolve(ROOT, 'apps/web/Dockerfile.dev');
const HOT_COMPOSE_PATH = resolve(ROOT, 'docker-compose.hot.yml');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** The named stage's own text, up to (not including) the next `FROM` line. */
function stageText(dockerfile: string, stageName: string): string {
  const stages = dockerfile.split(/\n(?=FROM )/);
  const stage = stages.find((s) => new RegExp(`^FROM .* AS ${stageName}\\b`).test(s));
  if (!stage) throw new Error(`no stage named "${stageName}" in this Dockerfile`);
  return stage;
}

const DOCKERFILES = [
  ['server', SERVER_DOCKERFILE_PATH],
  ['web', WEB_DOCKERFILE_PATH],
] as const;

describe('13.1426 the build stage fetches before it copies source, on both Dockerfiles', () => {
  for (const [name, path] of DOCKERFILES) {
    it(`${name}: manifests, then fetch, then source, then offline install, in that order`, () => {
      const stage = stageText(read(path), 'build');
      // Line-anchored: a plain indexOf would also match these same strings
      // inside the prose comments explaining WHY the order matters.
      const manifestIdx = stage.search(/^COPY pnpm-lock\.yaml pnpm-workspace\.yaml turbo\.json/m);
      const fetchIdx = stage.search(/^RUN pnpm fetch$/m);
      const sourceIdx = stage.search(/^COPY \. \.$/m);
      const installIdx = stage.search(/^RUN pnpm install --offline --frozen-lockfile$/m);
      expect(manifestIdx, `${name} build stage must COPY the lockfile/manifests`).toBeGreaterThan(-1);
      expect(fetchIdx, `${name} build stage must RUN pnpm fetch`).toBeGreaterThan(-1);
      expect(sourceIdx, `${name} build stage must COPY . .`).toBeGreaterThan(-1);
      expect(installIdx, `${name} build stage must install --offline`).toBeGreaterThan(-1);
      expect(manifestIdx, 'manifest COPY must precede pnpm fetch').toBeLessThan(fetchIdx);
      expect(fetchIdx, 'pnpm fetch must precede COPY . .').toBeLessThan(sourceIdx);
      expect(sourceIdx, 'COPY . . must precede the offline install').toBeLessThan(installIdx);
    });
  }

  it('CONTROL — the runtime stage still COPY --from=build\'s the same paths as before this change', () => {
    const server = read(SERVER_DOCKERFILE_PATH);
    expect(server).toContain('COPY --from=build /out ./');
    expect(server).toContain(
      'COPY --from=build /repo/apps/server/docker-entrypoint.sh /app/docker-entrypoint.sh',
    );
    const web = read(WEB_DOCKERFILE_PATH);
    expect(web).toContain('COPY --from=build /repo/apps/web/.next/standalone ./');
    expect(web).toContain('COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static');
    expect(web).toContain('COPY --from=build /repo/apps/web/public ./apps/web/public');
  });
});

describe('13.1427 no `dev` stage remains in a production Dockerfile', () => {
  for (const [name, path] of DOCKERFILES) {
    it(`${name}: no stage named "dev"`, () => {
      expect(read(path)).not.toMatch(/^FROM .* AS dev\b/m);
    });

    it(`${name}: the runtime stage is still the LAST stage`, () => {
      const stages = [...read(path).matchAll(/^FROM .* AS (\w+)/gm)].map((m) => m[1]);
      expect(stages[stages.length - 1]).toBe('runtime');
    });
  }

  it('the moved-out Dockerfile.dev files exist, each still carrying the dev stage', () => {
    expect(read(SERVER_DEV_DOCKERFILE_PATH)).toMatch(/^FROM .* AS dev\b/m);
    expect(read(WEB_DEV_DOCKERFILE_PATH)).toMatch(/^FROM .* AS dev\b/m);
  });

  it('docker-compose.hot.yml\'s retired override points its build at the moved-out Dockerfile.dev files', () => {
    const hotCompose = read(HOT_COMPOSE_PATH);
    expect(hotCompose).toContain('dockerfile: apps/server/Dockerfile.dev');
    expect(hotCompose).toContain('dockerfile: apps/web/Dockerfile.dev');
  });
});
