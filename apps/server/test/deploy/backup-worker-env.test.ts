import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { requireExplicitObjectStore } from '../../src/purge/sweep.js';

/**
 * Trash series Plan 2, deviation D5 — the purge deletes attachment objects
 * from the BACKUP worker, which (measured 2026-09-28) had no OBJECT_STORE /
 * OBJECT_STORE_S3_BUCKET and so built a LocalDiskStore
 * (`apps/server/src/attachments/store-config.ts`, `OBJECT_STORE ?? 'local'`).
 * Case 19.150 (`test-cases/19-trash.md` §19.17). A spec change is NOT applied by
 * a push: see docs/runbook.md, "Permanent-delete sweep".
 */

type Env = { key: string; value?: string; type?: string };
type Component = { name: string; envs?: Env[] };
type Spec = { services?: Component[]; workers?: Component[] };

const spec = parseYaml(readFileSync(resolve(__dirname, '../../../../deploy/do/app.yaml'), 'utf8')) as Spec;

function envOf(components: Component[] | undefined, name: string): Record<string, string | undefined> {
  const component = components?.find((candidate) => candidate.name === name);
  return Object.fromEntries((component?.envs ?? []).map((env) => [env.key, env.value]));
}

describe('19.150 the backup worker reaches the real attachment store', () => {
  it('declares OBJECT_STORE=s3 and the attachment bucket, the one the server writes to', () => {
    const worker = envOf(spec.workers, 'backup');
    const server = envOf(spec.services, 'server');
    expect(worker['OBJECT_STORE']).toBe('s3');
    expect(worker['OBJECT_STORE_S3_BUCKET']).toBe('gisik-nokma-attachments');
    // CONTROL — the same bucket as the server's attachments, and not the backup bucket.
    expect(server['OBJECT_STORE_S3_BUCKET']).toBe(worker['OBJECT_STORE_S3_BUCKET']);
    expect(worker['BACKUP_S3_BUCKET']).not.toBe(worker['OBJECT_STORE_S3_BUCKET']);
  });
});

describe('19.150 the purge job fails closed on the local-disk fallback', () => {
  it('refuses to run when OBJECT_STORE is unset or empty, and accepts an explicit store', () => {
    expect(() => requireExplicitObjectStore({})).toThrow(/OBJECT_STORE/);
    expect(() => requireExplicitObjectStore({ OBJECT_STORE: '' })).toThrow(/OBJECT_STORE/);
    // CONTROL — an explicit choice, either kind, passes.
    expect(() => requireExplicitObjectStore({ OBJECT_STORE: 's3' })).not.toThrow();
    expect(() => requireExplicitObjectStore({ OBJECT_STORE: 'local' })).not.toThrow();
  });
});
