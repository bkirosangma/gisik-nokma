import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadConfig } from '../../src/config.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';

/**
 * `pnpm check:env` cannot validate docker-compose.dev.yml. It only checks
 * code -> .env.example: a compose variable that nothing in src/ reads is
 * invisible to it, and a variable the code REQUIRES that compose omits
 * surfaces only at container runtime, as a `ConfigError` nobody sees until
 * `docker compose up`. This file carries that weight instead, by parsing the
 * compose file itself (with the real `yaml` package — not a hand-rolled
 * parser, which would just relocate the "trust the parser" risk).
 *
 * ## What this file is NOT
 *
 * It is not the acceptance for Task 6. Every assertion here is a statement
 * about a FILE, and a file can name all the right variables and still not
 * work — the strongest thing a config mirror can tell you is that the
 * spelling matches something. The acceptance is a request travelling through
 * the web container's proxy and being answered by the server; it lives in
 * `test-cases/13`, is run by hand against a live stack, and is recorded there
 * with what it measured. Keeping that distinction explicit matters here
 * because the plan's own stated acceptance ("the stack comes up and /healthz
 * is green") is the server's healthcheck and goes green over a completely
 * broken web tier.
 *
 * ## Why the assertions call the real loaders
 *
 * The first version of this file only asserted that keys EXIST
 * (`toBeTruthy()`), which a review showed was too weak in three measured
 * ways: `DATABASE_URL: not-a-url`, a `BETTER_AUTH_URL` missing its scheme,
 * and `OBJECT_STORE_S3_BUCKET` misspelled against the bucket `minio-init`
 * creates three services up — all left the suite fully green while the
 * container would refuse to boot or fail its first upload. Handing the parsed
 * values to `loadConfig` and `createObjectStoreFromEnv` — the same functions
 * the boot path calls — closes all three at once and cannot go stale the way
 * a hand-copied key list does.
 *
 * (The earlier hand-copied list carried a justification, "importing it here
 * would pull in the whole module graph", that was simply false: config.ts
 * imports zod and nothing else. The list is gone; the note stays as the
 * reason not to reintroduce it.)
 */

const COMPOSE_PATH = resolve(import.meta.dirname, '../../../../docker-compose.dev.yml');
const ROOT_COMPOSE_PATH = resolve(import.meta.dirname, '../../../../docker-compose.yml');

function readCompose(path = COMPOSE_PATH): Record<string, any> {
  return parseYaml(readFileSync(path, 'utf8'));
}

/**
 * Compose accepts a service's `environment` in TWO syntaxes — a map
 * (`KEY: value`) and a list (`- KEY=value`) — and they are interchangeable.
 * Normalising both is not tidiness: a review rewrote the server block into
 * list form and the bare-`S3_*` guard below went GREEN on a file containing
 * three bare `S3_*` names, because `Object.keys` of an array yields
 * '0','1','2'. That is the exact costume this suite exists to catch — a check
 * passing for a reason unrelated to its subject — so the normalisation is
 * load-bearing and belongs here rather than at each call site.
 */
function envOf(service: string, doc = readCompose()): Record<string, string> {
  const raw = doc.services?.[service]?.environment ?? {};
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.map((entry: unknown) => {
        const [key, ...rest] = String(entry).split('=');
        return [key, rest.join('=')];
      }),
    );
  }
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value)]));
}

function buildArgsOf(service: string, doc = readCompose()): Record<string, string> {
  const raw = doc.services?.[service]?.build?.args ?? {};
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.map((entry: unknown) => {
        const [key, ...rest] = String(entry).split('=');
        return [key, rest.join('=')];
      }),
    );
  }
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value)]));
}

const EXPECTED_SERVICES = ['mailpit', 'minio', 'minio-init', 'postgres', 'server', 'web'];

describe('docker-compose.dev.yml env contract', () => {
  // ANTI-VACUITY GUARD: if the parser ever silently yields {} or drops
  // services (a bad indent, a YAML anchor gone wrong, a future edit that
  // moves `services` under something else), every assertion below would
  // vacuously pass against an empty object. Fail loudly on that first.
  it(`parses all ${EXPECTED_SERVICES.length} expected services (anti-vacuity guard)`, () => {
    const doc = readCompose();
    expect(doc).toBeTruthy();
    expect(doc.services).toBeTruthy();
    expect(Object.keys(doc.services).sort()).toEqual([...EXPECTED_SERVICES].sort());
  });

  describe('project isolation from the root stack', () => {
    // Compose derives its project name from the DIRECTORY unless `name:` says
    // otherwise. Both compose files live here, so without this both resolve to
    // the same project AND both declare a service called `postgres` — bringing
    // up either RECREATES the other's container instead of running beside it.
    // The header's "the two stacks are now co-runnable" was false until this
    // key existed, and it was false in a way no assertion could see, which is
    // why it is asserted now.
    it('declares an explicit project name', () => {
      expect(
        readCompose().name,
        'without a top-level `name:` compose infers the project from the directory, which the root docker-compose.yml also does',
      ).toBeTruthy();
    });

    it('does not share a project name with the root docker-compose.yml', () => {
      const dev = readCompose().name;
      const root = readCompose(ROOT_COMPOSE_PATH).name;
      // The root file has no `name:` and inherits the directory, so `root` is
      // undefined here; the assertion that matters is that they differ, which
      // holds whether or not the root file ever gains one.
      expect(dev).not.toBe(root);
      expect(
        dev,
        'the two stacks share a service named `postgres`; an identical project name makes `up` on one destroy the other',
      ).not.toBeUndefined();
    });
  });

  describe('the server service boots against the real loaders', () => {
    // The strongest assertion available to a file-level test: hand the parsed
    // values to the same functions the boot path calls. Catches missing keys,
    // malformed values, and any key config.ts gains in future — no
    // hand-maintained list to go stale.
    it('satisfies loadConfig — every required key present AND well-formed', () => {
      const env = envOf('server');
      expect(Object.keys(env).length, 'parsed an empty server environment').toBeGreaterThan(5);
      expect(() => loadConfig(env)).not.toThrow();
    });

    it('satisfies createObjectStoreFromEnv — the store resolves without throwing', () => {
      expect(() => createObjectStoreFromEnv(envOf('server') as NodeJS.ProcessEnv)).not.toThrow();
    });

    it('resolves to the S3 store, not the local-disk fallback', () => {
      // The defect this whole file exists for: with the plan's bare S3_* names
      // OBJECT_STORE is unset, createObjectStoreFromEnv falls through to its
      // 'local' default, and attachments silently persist to container-local
      // disk while every healthcheck stays green.
      const store = createObjectStoreFromEnv(envOf('server') as NodeJS.ProcessEnv);
      expect(store.constructor.name).toBe('S3ObjectStore');
    });
  });

  describe('object-store wiring (the assertion that would have caught the plan\'s defect)', () => {
    it('sets OBJECT_STORE to s3', () => {
      expect(envOf('server').OBJECT_STORE).toBe('s3');
    });

    it('sets OBJECT_STORE_S3_FORCE_PATH_STYLE to true, which MinIO requires', () => {
      expect(envOf('server').OBJECT_STORE_S3_FORCE_PATH_STYLE).toBe('true');
    });

    it('points the endpoint at the compose minio service, not real AWS', () => {
      const endpoint = envOf('server').OBJECT_STORE_S3_ENDPOINT;
      expect(endpoint, 'without an endpoint the s3 client targets real AWS').toBeTruthy();
      expect(endpoint).toContain('minio');
    });

    it('names a bucket that minio-init actually creates', () => {
      // A bucket name that does not match the bucket created three services up
      // is not "wired": the server boots clean and the first upload fails
      // NoSuchBucket. Parsed out of the init entrypoint rather than restated,
      // so the two cannot drift apart silently.
      const bucket = envOf('server').OBJECT_STORE_S3_BUCKET;
      const entrypoint = String(readCompose().services['minio-init'].entrypoint);
      const created = [...entrypoint.matchAll(/local\/([a-z0-9.-]+)/g)].map((m) => m[1]);
      expect(created.length, 'parsed no bucket names out of minio-init — the regex has drifted').toBeGreaterThan(0);
      expect(created, `server points at bucket "${bucket}" but minio-init creates: ${created.join(', ')}`).toContain(
        bucket,
      );
    });

    it('sets no bare S3_* key — the plan\'s original, unread names', () => {
      const env = envOf('server');
      const bareS3Keys = Object.keys(env).filter((key) => /^S3_/.test(key));
      expect(bareS3Keys, `found bare S3_* keys that nothing in apps/server/src reads: ${bareS3Keys.join(', ')}`).toEqual(
        [],
      );
    });
  });

  describe('the web service passes the build args apps/web actually reads', () => {
    // The same defect class as the bare S3_* names, one service over, and the
    // first version of this suite could not see it because it only ever looked
    // at `server`. Measured at the commit that fixed it: NEXT_PUBLIC_API_URL
    // and NEXT_PUBLIC_WS_URL have ZERO readers in apps/ or packages/, while
    // SERVER_ORIGIN (next.config.ts) and NEXT_PUBLIC_SERVER_URL
    // (src/providers.tsx) are the two that are read. turbo.json's globalEnv
    // lists exactly the latter pair and not the former, so under turbo 2's
    // envMode:strict the dead names would reach `next build` as undefined even
    // if something did read them.
    it('passes SERVER_ORIGIN — the proxy target, which binds at BUILD time', () => {
      // `rewrites()` runs during `next build` and its result is serialised into
      // .next/routes-manifest.json, which the standalone server then reads. A
      // runtime `environment:` entry would change nothing, so this must be a
      // build arg.
      expect(buildArgsOf('web'), 'SERVER_ORIGIN must be a BUILD arg; setting it at runtime does nothing').toHaveProperty(
        'SERVER_ORIGIN',
      );
    });

    it('points SERVER_ORIGIN at the server service, not at localhost', () => {
      // Inside the web container `localhost:3000` is the WEB container, so a
      // localhost value makes Next proxy /v1/* back into itself and answer its
      // own 404. This is the assertion that fails against the pre-fix tree.
      const origin = buildArgsOf('web').SERVER_ORIGIN;
      expect(origin).toBeTruthy();
      expect(
        origin,
        'inside the web container localhost is the web container; the proxy must name the server service',
      ).toContain('server');
      expect(origin).not.toContain('localhost');
    });

    it('passes NEXT_PUBLIC_SERVER_URL for the browser-side socket dial', () => {
      // Read by src/providers.tsx for /v1/stream, which the rewrites
      // deliberately do NOT cover (Next does not proxy protocol upgrades).
      // Browser-side, so it names the host-published port, not the service.
      expect(buildArgsOf('web')).toHaveProperty('NEXT_PUBLIC_SERVER_URL');
      expect(buildArgsOf('web').NEXT_PUBLIC_SERVER_URL).toBeTruthy();
    });

    it('passes neither NEXT_PUBLIC_API_URL nor NEXT_PUBLIC_WS_URL — nothing reads them', () => {
      const args = Object.keys(buildArgsOf('web'));
      const dead = args.filter((key) => key === 'NEXT_PUBLIC_API_URL' || key === 'NEXT_PUBLIC_WS_URL');
      expect(dead, `the plan's web build args have no readers in apps/ or packages/: ${dead.join(', ')}`).toEqual([]);
    });
  });

  describe('postgres host port', () => {
    function publishedPorts(): string[] {
      const ports: unknown[] = readCompose().services.postgres.ports ?? [];
      return ports.map((mapping) => String(mapping).split(':')[0]);
    }

    it('does not publish 54329 — that port is the shared TEST Postgres for this workspace\'s parallel lanes', () => {
      expect(
        publishedPorts(),
        'docker-compose.dev.yml must not bind host port 54329: it is the live shared test Postgres used by every parallel lane in this workspace, and binding it here would either fail to start or point the dev stack at the wrong database',
      ).not.toContain('54329');
    });

    it('publishes 54330 — the port .env.example documents as the dev DATABASE_URL', () => {
      // The negative above closes one end of the range only: deleting the
      // `ports:` block entirely, or moving to 54331, both satisfied it while
      // leaving .env.example documenting a port nothing listens on. 54330 is
      // load-bearing documentation, not an arbitrary free port.
      expect(
        publishedPorts(),
        '.env.example documents postgres://gisik:gisik@localhost:54330/gisik_nokma as the dev stack DSN',
      ).toContain('54330');
    });
  });
});
