import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The gate names the Node it ran under, from inside the run.
 *
 * ## Why this exists: the instrument everyone relies on is INERT here
 *
 * The standing rule on this machine is that a gate result is not evidence
 * unless it names its Node, and the tell everyone reaches for is pnpm's
 * `WARN Unsupported engine` line. **Measured, both directions, at Plan 4 Task
 * 14: `pnpm run typecheck` inside `apps/server` prints no such warning under
 * Node v24 either.** `engines` is declared in the ROOT `package.json` alone, and
 * `pnpm run` in a workspace package reads that package's own manifest — so the
 * warning never fires for any per-package script, which is every script the
 * gate actually runs. An absent warning was therefore proving nothing, in
 * exactly the way a check that passes for an unrelated reason always does.
 *
 * This asserts the thing directly instead, from inside a vitest worker, so a
 * gate run under the wrong Node goes RED rather than quietly green.
 *
 * ## It reads the range rather than restating it
 *
 * The bound comes from the root `package.json`'s own `engines.node`, parsed
 * here. A hard-coded `v22` would be a second statement of the supported range,
 * free to drift from the first the day the project moves — and it would fail
 * for the wrong reason, blaming the operator's Node for a stale test.
 *
 * The parser is deliberately small: this repo's range is `>=X.Y.Z <M`, and a
 * general semver-range implementation would be untested surface added to make a
 * five-line assertion look thorough.
 */
describe('the gate names the Node it ran under', () => {
  it('the worker Node satisfies the root package.json engines range', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
    ) as { engines?: { node?: string } };
    const range = manifest.engines?.node;

    // The guard against this check going quiet: with no range found, every
    // assertion below would be comparing against `undefined` and passing.
    expect(range, 'the root package.json must declare engines.node').toBeTypeOf('string');

    const bounds = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/.exec(range as string);
    expect(bounds, `engines.node is "${range as string}", which this parser does not understand — widen it deliberately`).not.toBeNull();
    const [, lowMajor, lowMinor, lowPatch, highMajor] = bounds as RegExpExecArray;

    const running = /^v(\d+)\.(\d+)\.(\d+)/.exec(process.version) as RegExpExecArray;
    const version = [Number(running[1]), Number(running[2]), Number(running[3])];
    const low = [Number(lowMajor), Number(lowMinor), Number(lowPatch)];

    const atLeast =
      version[0]! > low[0]! ||
      (version[0] === low[0] && (version[1]! > low[1]! || (version[1] === low[1] && version[2]! >= low[2]!)));

    // The failure message carries the version, so a red gate SAYS which Node it
    // ran under rather than only that something was wrong.
    expect(atLeast, `this gate is running Node ${process.version}, below engines.node ${range as string}`).toBe(true);
    expect(
      version[0]! < Number(highMajor),
      `this gate is running Node ${process.version}, at or above the exclusive bound in engines.node ${range as string}`,
    ).toBe(true);
  });
});
