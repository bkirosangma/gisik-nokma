import { describe, expect, it } from 'vitest';
import {
  DIST_SEED_ENTRY,
  probeShellCommand,
  seedArgv,
  seedShape,
} from '../e2e-stack/helpers/seed-shape';

/**
 * THE PROD SHAPE'S ONLY WITNESS — and the reason it needs one.
 *
 * `global-setup.ts` picks the seed command from the shape of the running
 * `server` image. The HOT shape can be — and was, on 2026-09-18 — witnessed
 * live: this worktree's own container has `/repo` as its working directory and
 * no `dist`, and the suite seeded through the `pnpm` branch. The PROD shape
 * cannot be witnessed here at all: that container is deliberately not running
 * (the Step 5b dispatch forbids starting it, and `--build` is out of scope), so
 * without this file half of a two-branch decision would ship unmeasured.
 *
 * ## What makes these tests not-vacuous
 *
 * The failure this guards is the DEGENERATE MAP — a `seedArgv` that returns the
 * same command for both shapes, i.e. the un-shape-aware behaviour that caused
 * the defect, wearing a probe. A test that asserted only "the prod command
 * mentions `node`" would pass on it. So each shape is asserted EXACTLY, and the
 * two are then asserted to differ from each other; a collapse into one branch
 * fails the difference assertion even if it happens to satisfy one shape.
 *
 * The same reasoning made `seedShape` throw on an unrecognised probe answer
 * rather than default: a default is a third branch that always succeeds, and it
 * would silently launder a probe that stopped measuring into a seed that ran.
 */

describe('seed shape — the two container images, and the command each needs', () => {
  it('the prod-parity image seeds the built artifact, by path', () => {
    expect(seedArgv('dist')).toEqual(['node', DIST_SEED_ENTRY]);
    // Named separately so a future change to DIST_SEED_ENTRY cannot quietly
    // relabel which file this is meant to be.
    expect(DIST_SEED_ENTRY).toBe('dist/seed/cli-seed-convenience-corner.js');
  });

  it('the hot image seeds from source, through the workspace filter', () => {
    // `/repo` is the hot container's WORKDIR and no `dist` exists in it, so a
    // relative path cannot work; `seed:cc` is `tsx src/seed/cli-seed-convenience-corner.ts`
    // in apps/server/package.json, and the filter resolves it from the root.
    expect(seedArgv('source')).toEqual(['pnpm', '--filter', '@gisik-nokma/server', 'seed:cc']);
  });

  it('the two shapes do NOT collapse into one command', () => {
    // The guard on the guards above: this is the assertion a degenerate map
    // fails, and it is the whole reason the function takes a shape at all.
    expect(seedArgv('dist')).not.toEqual(seedArgv('source'));
  });

  it('the probe reads the shape without ever exiting non-zero', () => {
    // `test -f` exits 1 for an absent file; that is the probe's ANSWER. If the
    // probe ever became a bare `test -f …`, execFileSync would throw on exactly
    // the shape the probe exists to detect, and "no dist" would be
    // indistinguishable from "container not running".
    const command = probeShellCommand();
    expect(command).toBe(`test -f ${DIST_SEED_ENTRY} && echo dist || echo source`);
    expect(command).toContain('echo dist');
    expect(command).toContain('echo source');
  });

  it('narrows the probe stdout, and REFUSES an answer it does not know', () => {
    expect(seedShape('dist\n')).toBe('dist');
    expect(seedShape('  source  \n')).toBe('source');
    // The silent-empty shape: a probe that prints something new must not be
    // rounded to a default, because the default runs a seed that may not apply.
    expect(() => seedShape('')).toThrow(/neither "dist" nor "source"/);
    expect(() => seedShape('dist\nsource\n')).toThrow(/neither "dist" nor "source"/);
    expect(() => seedShape('command not found')).toThrow(/neither "dist" nor "source"/);
  });
});
