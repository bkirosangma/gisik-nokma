import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * WHEN CI RUNS, and the CI-repair guards of 2026-10-02 (owner: *"CI to be run only on merges
 * to main"* → "Only the release PR into main"; a merge to `main` deploys, so a push-to-`main`
 * run starts after the deploy). Asserted against the PARSED workflow, not its text, so a
 * reindented or re-commented file neither passes nor fails for the wrong reason.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** `on:` parsed. NB: YAML 1.1 reads a bare `on` key as boolean `true`; `yaml`'s default (1.2) keeps the string. */
const triggersOf = (text: string): Record<string, unknown> => {
  const doc = parse(text) as { on?: Record<string, unknown>; true?: Record<string, unknown> };
  return doc.on ?? doc.true ?? {};
};
const ciYml = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

describe('13.1720 ci.yml runs on the release → main PR and on demand, never on a push', () => {
  it('has pull_request into main and workflow_dispatch, and NO push trigger', () => {
    const on = triggersOf(ciYml);
    expect(Object.keys(on).sort()).toEqual(['pull_request', 'workflow_dispatch']);
    expect((on.pull_request as { branches: string[] }).branches).toEqual(['main']);
    expect(on).not.toHaveProperty('push');
  });

  // CONTROL, same describe: the reader must be able to SEE a push trigger. Without this arm, a
  // reader that returned `{}` for every file (the `on`/`true` key trap above) would pass the
  // assertion that `push` is absent and prove nothing about this workflow.
  it('CONTROL: the same reader finds a push trigger in a workflow that has one', () => {
    const planted = 'name: planted\non:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\njobs: {}\n';
    const on = triggersOf(planted);
    expect(on).toHaveProperty('push');
    expect(Object.keys(on).sort()).not.toEqual(['pull_request', 'workflow_dispatch']);
  });
});

describe('13.1721 the dev compose stack names no image that has left its registry', () => {
  const compose = parse(readFileSync(join(REPO_ROOT, 'docker-compose.dev.yml'), 'utf8')) as {
    services: Record<string, { image?: string }>;
  };
  // `minio/minio` and `minio/mc` on Docker Hub answer "pull access denied" for EVERY tag
  // (measured 2026-10-02, `docker manifest inspect`), which is what reddened CI's `e2e` at
  // "bring the stack up" for 12+ days.
  const GONE = /^(docker\.io\/)?minio\/(minio|mc)(:|$)/;

  it('no service uses minio/minio or minio/mc, and every image carries an exact tag', () => {
    const images = Object.entries(compose.services)
      .filter(([, s]) => s.image !== undefined)
      .map(([name, s]) => [name, s.image as string] as const);
    expect(images.length, 'parsed no image: lines — the reader has drifted').toBeGreaterThan(3);
    for (const [name, image] of images) {
      expect(image, `${name} uses a removed Docker Hub image`).not.toMatch(GONE);
      expect(image, `${name} has no pinned tag`).toMatch(/:[^:/]+$/);
      expect(image, `${name} floats on :latest`).not.toMatch(/:latest$/);
    }
  });

  it('CONTROL: the matcher refuses the images that were removed', () => {
    expect('minio/minio:RELEASE.2024-11-07T00-52-20Z').toMatch(GONE);
    expect('minio/mc:RELEASE.2024-11-05T11-29-45Z').toMatch(GONE);
    expect('docker.io/minio/mc:latest').toMatch(GONE);
    expect('ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z').not.toMatch(GONE);
  });
});

describe('13.1722 no gitlink is committed, and agent worktrees are ignored', () => {
  // A committed gitlink (mode 160000) with no `.gitmodules` entry made actions/checkout's post-job
  // step fail with "No url found for submodule path '.claude/worktrees/agent-…'" on every job.
  const gitlinksIn = (lsFilesStage: string): string[] => lsFilesStage.split('\n').filter((l) => l.startsWith('160000 '));
  const gitlinks = (): string[] =>
    gitlinksIn(execFileSync('git', ['ls-files', '-s'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

  it('has no mode-160000 entry in the index, and .gitignore lists .claude/worktrees/', () => {
    expect(gitlinks()).toEqual([]);
    expect(readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8').split('\n')).toContain('.claude/worktrees/');
  });

  it('CONTROL: the same reader finds a gitlink in `ls-files -s` output that has one', () => {
    const line = '160000 7d45a4d9b5b07f7434f39351a01c89c7a47511f8 0\t.claude/worktrees/agent-x';
    expect(gitlinksIn(`100644 abc 0\tREADME.md\n${line}\n`)).toEqual([line]);
  });
});

describe('13.1727 the dev stack probes its own server over IPv4, not through `localhost`', () => {
  // The server listens on IPv4 only. On a CI runner the container has an IPv6 loopback, so busybox
  // `wget http://localhost:3000` tries ::1 first and gets "Connection refused" without falling back
  // (run 36970366578: FailingStreak 40, `server` unhealthy, `e2e` red); Docker Desktop has no ::1,
  // which is why it worked on every dev machine.
  const probeOf = (text: string): string => {
    const doc = parse(text) as { services: { server: { healthcheck: { test: string[] } } } };
    return doc.services.server.healthcheck.test.join(' ');
  };
  const compose = readFileSync(join(REPO_ROOT, 'docker-compose.dev.yml'), 'utf8');

  it('the server healthcheck dials 127.0.0.1:3000/healthz', () => {
    expect(probeOf(compose)).toMatch(/http:\/\/127\.0\.0\.1:3000\/healthz/);
    expect(probeOf(compose)).not.toMatch(/localhost/);
  });

  it('CONTROL: the reader sees the broken spelling when it is present', () => {
    const broken = compose.replace('http://127.0.0.1:3000/healthz', 'http://localhost:3000/healthz');
    expect(broken).not.toBe(compose);
    expect(probeOf(broken)).toMatch(/localhost/);
  });
});
