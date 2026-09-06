import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * `pnpm check:env` cannot validate docker-compose.dev.yml. It only checks
 * code -> .env.example: a compose variable that nothing in src/ reads is
 * invisible to it, and a variable the code REQUIRES that compose omits
 * surfaces only at container runtime, as a `ConfigError` nobody sees until
 * `docker compose up`. This file carries that weight instead, by parsing
 * the compose file itself (with the real `yaml` package — not a hand-rolled
 * parser, which would just relocate the "trust the parser" risk) and
 * asserting directly against the two things Plan 11 Task 6's original text
 * got wrong: the object-store variable names, and which keys config.ts
 * actually requires.
 */

const COMPOSE_PATH = resolve(import.meta.dirname, '../../../../docker-compose.dev.yml');

function loadServerEnv(): Record<string, unknown> {
  const doc = parseYaml(readFileSync(COMPOSE_PATH, 'utf8'));
  return doc.services.server.environment;
}

describe('docker-compose.dev.yml env contract', () => {
  // ANTI-VACUITY GUARD: if the parser ever silently yields {} or drops
  // services (a bad indent, a YAML anchor gone wrong, a future edit that
  // moves `services` under something else), every assertion below would
  // vacuously pass against an empty object. Fail loudly on that first.
  it('parses all five expected services (anti-vacuity guard)', () => {
    const doc = parseYaml(readFileSync(COMPOSE_PATH, 'utf8'));
    expect(doc).toBeTruthy();
    expect(doc.services).toBeTruthy();
    expect(Object.keys(doc.services).sort()).toEqual(
      ['mailpit', 'minio', 'minio-init', 'postgres', 'server', 'web'].sort(),
    );
  });

  describe('config.ts required keys (no zod default)', () => {
    // Source of truth: apps/server/src/config.ts's configSchema. Read there
    // directly rather than importing the schema, because importing it here
    // would pull in the whole module graph for a compose-file test; this
    // list is hand-maintained instead, and IT WILL GO STALE the moment
    // config.ts gains, loses, or defaults a field. What goes stale,
    // concretely: a key added to config.ts WITHOUT a `.default()` will not
    // appear here, so this test will not catch it missing from the compose
    // file's server.environment until someone updates this list by hand.
    // At last read (2026-09-06), the keys with NO `.default()` and NO
    // `.optional()` are exactly these four:
    //   DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, WEB_ORIGIN
    // Everything else in configSchema is `.default(...)`, `.optional()`, or
    // wrapped in `unsetWhenEmpty(...)` around one of those two, so an
    // absent env var still parses.
    const REQUIRED_CONFIG_KEYS = ['DATABASE_URL', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'WEB_ORIGIN'];

    for (const key of REQUIRED_CONFIG_KEYS) {
      it(`sets ${key} on the server service`, () => {
        const env = loadServerEnv();
        expect(env, `server.environment.${key} must be set — config.ts has no default for it`).toHaveProperty(key);
        expect(env[key], `server.environment.${key} must not be empty`).toBeTruthy();
      });
    }
  });

  describe('object-store wiring (the assertion that would have caught the plan\'s defect)', () => {
    // Plan 11 Task 6's original text wrote S3_ENDPOINT, S3_REGION, S3_BUCKET,
    // S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE into the server
    // service. Nothing in apps/server/src reads any of those six names —
    // createObjectStoreFromEnv (attachments/store-config.ts) reads
    // OBJECT_STORE and OBJECT_STORE_S3_* only. Written as the plan specified,
    // OBJECT_STORE would be unset, createObjectStoreFromEnv would fall
    // through to its 'local' default, and attachments would silently persist
    // to the container's local disk instead of reaching MinIO — a defect
    // `pnpm check:env` cannot see (it checks documentation, not compose
    // wiring) and that would not surface until an attachment upload was
    // inspected by hand. These assertions parse the actual compose file and
    // would have failed against the plan's original text.

    it('sets OBJECT_STORE to s3', () => {
      const env = loadServerEnv();
      expect(env.OBJECT_STORE).toBe('s3');
    });

    // Required for the 's3' branch per store-config.ts's own `required`
    // map (OBJECT_STORE_S3_ENDPOINT and _FORCE_PATH_STYLE are read but not
    // in that map — optional there — so they are checked separately below).
    const REQUIRED_S3_KEYS = [
      'OBJECT_STORE_S3_REGION',
      'OBJECT_STORE_S3_BUCKET',
      'OBJECT_STORE_S3_ACCESS_KEY_ID',
      'OBJECT_STORE_S3_SECRET_ACCESS_KEY',
    ];

    for (const key of REQUIRED_S3_KEYS) {
      it(`sets ${key} (required by store-config.ts's s3 branch)`, () => {
        const env = loadServerEnv();
        expect(env, `server.environment.${key} is required when OBJECT_STORE=s3`).toHaveProperty(key);
        expect(env[key]).toBeTruthy();
      });
    }

    it('sets OBJECT_STORE_S3_ENDPOINT so the s3 client points at MinIO, not real AWS', () => {
      const env = loadServerEnv();
      expect(env, 'without OBJECT_STORE_S3_ENDPOINT the s3 client targets real AWS, not the compose minio service').toHaveProperty(
        'OBJECT_STORE_S3_ENDPOINT',
      );
      expect(env.OBJECT_STORE_S3_ENDPOINT).toBeTruthy();
    });

    it('sets OBJECT_STORE_S3_FORCE_PATH_STYLE to true, which MinIO requires', () => {
      const env = loadServerEnv();
      expect(String(env.OBJECT_STORE_S3_FORCE_PATH_STYLE)).toBe('true');
    });

    it('sets no bare S3_* key — the plan\'s original, unread names', () => {
      const env = loadServerEnv();
      const bareS3Keys = Object.keys(env).filter((key) => /^S3_/.test(key));
      expect(bareS3Keys, `found bare S3_* keys that nothing in apps/server/src reads: ${bareS3Keys.join(', ')}`).toEqual([]);
    });
  });

  describe('postgres host port', () => {
    it('does not publish 54329 — that port is the shared TEST Postgres for this workspace\'s parallel lanes', () => {
      const doc = parseYaml(readFileSync(COMPOSE_PATH, 'utf8'));
      const ports: string[] = doc.services.postgres.ports ?? [];
      const publishedPorts = ports.map((mapping) => String(mapping).split(':')[0]);
      expect(
        publishedPorts,
        'docker-compose.dev.yml must not bind host port 54329: it is the live shared test Postgres used by every parallel lane in this workspace, and binding it here would either fail to start or point the dev stack at the wrong database',
      ).not.toContain('54329');
    });
  });
});
