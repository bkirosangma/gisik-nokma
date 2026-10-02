import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_SOURCE_ROOTS,
  REPO_ROOT,
  existingClientSourceRoots,
  findColourLiterals,
  scanTreeForColourLiterals,
} from './helpers/colour-scan.js';

/** `turbo.json` is JSONC. Strips comments while respecting strings — the `$schema` value contains `//`. */
function parseJsonc(text: string): unknown {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quote !== null) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === '"') {
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }
    out += c;
  }
  return JSON.parse(out);
}

describe('the scanner itself is proven against planted defects before it is trusted', () => {
  it('catches hex (3–8 digit), rgb(), rgba(), hsl(), oklch() and color-mix() IN APPLIED POSITION', () => {
    // CSS: a declaration VALUE. `kind` is explicit on every call now, because the
    // same three characters mean different things in the two languages and a
    // scanner that guessed would be the bug this file exists to prevent.
    expect(findColourLiterals('color: #fff;', 'css')).toEqual(['#fff']);
    expect(findColourLiterals('background: #b3261e;', 'css')).toEqual(['#b3261e']);
    // Script: inside a string, which is the only way a colour reaches a screen
    // from JavaScript.
    expect(findColourLiterals("const scrim = '#1c1b1866';", 'script')).toEqual(['#1c1b1866']);
    expect(findColourLiterals('const c = "#fff";', 'script')).toEqual(['#fff']);
    expect(findColourLiterals('const c = `#fff`;', 'script')).toEqual(['#fff']);
    // Colour FUNCTIONS need no positional argument: the name is unambiguous.
    expect(findColourLiterals('border: 1px solid rgb(0, 0, 0);', 'css')).toEqual(['rgb(']);
    expect(findColourLiterals('color: rgba(0,0,0,.5)', 'css')).toEqual(['rgba(']);
    expect(findColourLiterals('color: hsl(9 80% 40%)', 'css')).toEqual(['hsl(']);
    expect(findColourLiterals('color: oklch(0.7 0.1 250)', 'css')).toEqual(['oklch(']);
    expect(findColourLiterals('color: color-mix(in srgb, red, blue)', 'css')).toEqual(['color-mix(']);
  });

  it('lets colour-free source through', () => {
    expect(findColourLiterals("import { colorOf } from '@gisik-nokma/ui';", 'script')).toEqual([]);
    expect(findColourLiterals('color: var(--gn-text);', 'css')).toEqual([]);
    expect(findColourLiterals("const ULID = '01J9GTKA000000000000000000';", 'script')).toEqual([]);
  });

  /**
   * THE FALSE POSITIVE THAT TURNED `main` RED, 2026-09-07.
   *
   * `#270` — a PULL REQUEST NUMBER in a prose comment — is three hex digits, which
   * is a legal CSS shorthand colour. **No tightening of the SHAPE can separate the
   * two**: `#270` and `#fff` are the same token. Only position can.
   *
   * Each case below is PAIRED with the real colour it must still catch in the same
   * position, so "no longer matches" can never be satisfied by a scanner that
   * stopped matching anything.
   */
  describe('a hex-shaped token outside applied position is not a colour', () => {
    it('a PR reference in a line comment is ignored — and a real literal beside it is not', () => {
      expect(findColourLiterals('// the fix createRegion made in PR #270', 'script')).toEqual([]);
      expect(findColourLiterals("const c = '#270'; // PR #270", 'script')).toEqual(['#270']);
    });

    it('THE EXACT SHAPE THAT BROKE THE GATE: a block comment whose middle line carries no marker', () => {
      // The line holding `#270` has no `/*`, no `*/` and no `//`. A per-line
      // scanner — which is what this was — cannot tell it is inside a comment,
      // which is why comments are stripped over the whole file.
      const source = ['/*', '  createRegion was making until PR #270, and it has the identical fix:', '*/'].join('\n');
      expect(findColourLiterals(source, 'script')).toEqual([]);
      // POSITIVE CONTROL, same three-line shape, one line changed: a real literal
      // on the line AFTER the comment closes is still caught, so the strip is not
      // eating the file.
      const planted = ['/*', '  createRegion was making until PR #270', '*/', "const c = '#b3261e';"].join('\n');
      expect(findColourLiterals(planted, 'script')).toEqual(['#b3261e']);
    });

    it('a CSS ID SELECTOR is not a colour — a latent false positive, found while fixing the other', () => {
      expect(findColourLiterals('#abc { padding: 0; }', 'css')).toEqual([]);
      // Same selector, now with a colour actually applied inside it.
      expect(findColourLiterals('#abc { color: #abc; }', 'css')).toEqual(['#abc']);
    });

    /**
     * THE FALSE NEGATIVE THE FIRST FIX INTRODUCED, measured before it shipped.
     *
     * Stripping `//…` by regex treats the `//` in a URL as a comment opener, so a
     * real colour literal AFTER a URL on the same line was blanked away with it.
     * `[]` where the identical line without the URL yields `['#fff']`.
     *
     * **That direction is the dangerous one.** A false red is loud and gets fixed
     * within the hour — it is what brought this whole file into being. A false
     * green is a gate quietly not doing its job, and nothing surfaces it. The fix
     * for a false positive introduced a false negative in the same stroke, which
     * is why every case in this describe is paired.
     */
    it('a URL does not swallow a colour literal later on the same line', () => {
      expect(
        findColourLiterals("const u = 'https://a.com'; const c = '#fff';", 'script'),
      ).toEqual(['#fff']);
      // The pair: the same line with no URL, proving the matcher was live either way.
      expect(findColourLiterals("const c = '#fff';", 'script')).toEqual(['#fff']);
      // And a real line comment after a URL still IS a comment.
      expect(
        findColourLiterals("const u = 'https://a.com'; // see PR #270", 'script'),
      ).toEqual([]);
      // An escaped quote must not end the string early and re-open comment scanning.
      expect(findColourLiterals("const s = 'a\\'b // c'; const d = '#b3261e';", 'script')).toEqual([
        '#b3261e',
      ]);
    });

    it('an unquoted hex-shaped token in script is not a colour', () => {
      expect(findColourLiterals('const issue = 270; // see #270', 'script')).toEqual([]);
      expect(findColourLiterals("const bg = '#fff';", 'script')).toEqual(['#fff']);
    });
  });

  /**
   * The tree walk is exercised END TO END against a planted file, not only through
   * `findColourLiterals`. The unit cases above prove the PATTERN; this proves the
   * thing the gate actually runs — that `walk` reads the file, strips comments
   * whole-file, judges position, and reports the right LINE.
   */
  it('the walk itself still finds a planted literal, and reports its line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'colour-scan-'));
    writeFileSync(
      join(dir, 'planted.css'),
      ['/* a comment mentioning PR #270 */', '.a { padding: 0; }', '.b { color: #b3261e; }'].join(
        '\n',
      ),
    );
    const hits = scanTreeForColourLiterals(dir);
    expect(hits.map((hit) => ({ line: hit.line, match: hit.match }))).toEqual([
      { line: 3, match: '#b3261e' },
    ]);
  });
});

/**
 * THE GATE MUST BE ABLE TO SEE WHAT THE SCANNER POLICES.
 *
 * This suite reads every client source tree from disk, which makes its true inputs
 * files in OTHER packages. `turbo.json` therefore declares them explicitly with
 * `$TURBO_ROOT$` — without that, turbo scopes the hash to `packages/ui/**` and a
 * colour literal added anywhere this suite polices leaves the cache VALID.
 *
 * **Measured 2026-09-07 before the inputs existed:** cache warm, a real `#b3261e`
 * planted in `apps/web/src/shell-refusal.tsx` → `cache hit, replaying logs`, FULL
 * TURBO, exit 0. The same violation under direct `vitest` exits 1 and names the
 * file. **The scanner was never wrong; the gate could not see it** — which is how
 * `#270` reached `main`, since the gate on its own PR was genuinely green.
 *
 * That declaration is a COPY of `CLIENT_SOURCE_ROOTS`, and a copy that stops
 * matching silently is the defect this repo names elsewhere ("export the fixture,
 * never copy it"). It cannot be exported — `turbo.json` is config, read by a tool
 * that does not import TypeScript — so the next best thing is asserted here: the
 * two are compared as SETS, and adding a tree to one without the other is red.
 *
 * Follows case 13.208's shape: parse the config and assert the parsed structure,
 * never its text, so reformatting does not fail and a real change does.
 */
describe('the gate can see every tree the scanner polices', () => {
  it('turbo.json declares every CLIENT_SOURCE_ROOT as an input of this package’s test task', () => {
    const config = parseJsonc(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] } | undefined>;
    };
    const inputs = config.tasks['@gisik-nokma/ui#test']?.inputs ?? [];
    // The control that keeps the assertion honest: if the task or its inputs ever
    // vanish, `declared` is empty and the comparison below would pass against a
    // CLIENT_SOURCE_ROOTS that had also been emptied. Neither may be empty.
    expect(inputs.length, 'turbo.json declares no inputs for @gisik-nokma/ui#test').toBeGreaterThan(0);
    expect(CLIENT_SOURCE_ROOTS.length).toBeGreaterThan(0);

    // TREE inputs only — those ending `/**`. A root-relative FILE input (this task
    // also declares `turbo.json`, which the very next assertion is about) is a
    // different kind of dependency and comparing the two together would force this
    // list to enumerate files it has no opinion on.
    // LITERAL trees only: the wildcard entries (`apps/*/test/**`, the package.json
    // globs — the other readers of the `apps/` and `packages/` listing) are a
    // different list, asserted by the next case, and are not client source roots.
    const declaredTrees = inputs
      .filter((input) => input.startsWith('$TURBO_ROOT$/') && input.endsWith('/**') && !/[*?]/.test(input.slice(0, -'/**'.length)))
      .map((input) => input.slice('$TURBO_ROOT$/'.length, -'/**'.length));
    // Compared as sorted lists rather than sets, so a failure PRINTS both sides and
    // names the tree that is missing instead of only that the counts differ.
    expect(declaredTrees.slice().sort()).toEqual(CLIENT_SOURCE_ROOTS.slice().sort());
  });

  it('13.1711 and the wildcard readers of the apps/ and packages/ listing are inputs too (cache audit, 2026-10-02)', () => {
    const config = parseJsonc(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] } | undefined>;
    };
    // The suite lists every workspace's test/ directory and package.json; a cached gate
    // must miss when one of those changes in a package this task does not depend on.
    for (const wanted of ['apps/*/test/**', 'packages/*/test/**', 'apps/*/package.json', 'packages/*/package.json']) {
      expect(config.tasks['@gisik-nokma/ui#test']?.inputs, wanted).toContain(`$TURBO_ROOT$/${wanted}`);
    }
  });

  it('and turbo.json is itself an input, because these very cases read it', () => {
    const config = parseJsonc(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] } | undefined>;
    };
    // The self-referential one, and it is not a curiosity: the two cases in this
    // describe READ `turbo.json`. Undeclared, editing the inputs list would not
    // invalidate the task that checks the inputs list — the guard would replay a
    // green log describing the configuration it used to have.
    expect(config.tasks['@gisik-nokma/ui#test']?.inputs).toContain('$TURBO_ROOT$/turbo.json');
  });

  it('and it keeps its own package’s files too, so a change to the scanner still invalidates', () => {
    const config = parseJsonc(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] } | undefined>;
    };
    // Without `$TURBO_DEFAULT$` the foreign trees REPLACE the package's own files,
    // so editing colour-scan.ts itself would no longer invalidate the cache — the
    // same blindness one level in.
    expect(config.tasks['@gisik-nokma/ui#test']?.inputs).toContain('$TURBO_DEFAULT$');
  });
});

/**
 * THE SAME BLINDNESS, SWEPT FOR ACROSS THE WHOLE REPO.
 *
 * `packages/ui#test` was not special — it was just the one that got caught. Any
 * test that reads files outside its own package is cached against a stale world,
 * because turbo hashes per package. The sweep that followed found **four**
 * packages doing it, not one:
 *
 * - `ui` — every client source tree, plus `turbo.json`
 * - `app-core` — `reporting-scope-guard` walks seven trees; three CSS-binding
 *   suites read `packages/ui/src/ui.css`
 * - `web` — `next-config.test.ts` reads `apps/server/src`
 * - `server` — the tooling, ci and docs suites read `scripts/`, `docs/`,
 *   `.github/workflows/ci.yml` and `docker-compose.dev.yml`. **Case 13.208 parses
 *   `ci.yml` and asserts its job graph** — cached against `apps/server/**` alone, a
 *   CI edit that broke that graph would have reported green.
 *
 * This case asserts the CLASS rather than today's four, so the next test that
 * reaches outside its package is caught when it is written and not after it hides
 * a defect: **if a package's tests escape to the repo root, its `#test` task must
 * declare cross-root inputs.**
 */
describe('no package’s tests read outside itself without saying so in turbo.json', () => {
  const ESCAPE = /REPO_ROOT|repoRoot|\.\.\/\.\.\/\.\.\/\.\./;

  function testFilesOf(packageDir: string): string[] {
    const found: string[] = [];
    const visit = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== 'node_modules' && entry !== 'dist') visit(path);
        } else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
      }
    };
    visit(join(packageDir, 'test'));
    return found;
  }

  it('every package whose tests escape its own tree declares $TURBO_ROOT$ inputs', () => {
    const config = parseJsonc(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] } | undefined>;
    };
    const escaping: string[] = [];
    const undeclared: string[] = [];
    for (const group of ['packages', 'apps']) {
      const groupDir = join(REPO_ROOT, group);
      if (!existsSync(groupDir)) continue;
      for (const entry of readdirSync(groupDir)) {
        const packageDir = join(groupDir, entry);
        if (!statSync(packageDir).isDirectory()) continue;
        const manifest = join(packageDir, 'package.json');
        if (!existsSync(manifest)) continue;
        const escapes = testFilesOf(packageDir).some((file) =>
          ESCAPE.test(readFileSync(file, 'utf8')),
        );
        if (!escapes) continue;
        const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name;
        escaping.push(name);
        const inputs = config.tasks[`${name}#test`]?.inputs ?? [];
        const declaresRoot = inputs.some((input) => input.startsWith('$TURBO_ROOT$/'));
        // `$TURBO_DEFAULT$` too: without it the foreign trees REPLACE the package's
        // own files, so the task stops invalidating on its own source — the same
        // blindness one level in.
        if (!declaresRoot || !inputs.includes('$TURBO_DEFAULT$')) undeclared.push(name);
      }
    }
    // POSITIVE CONTROL. If the escape scan ever silently finds nothing — a renamed
    // helper, a moved test directory, a regex that stopped matching — `undeclared`
    // is trivially empty and this case passes while measuring NOTHING. The four
    // known escapers are named, so the sweep has to still be working.
    expect(escaping.slice().sort()).toEqual(
      ['@gisik-nokma/app-core', '@gisik-nokma/server', '@gisik-nokma/ui', '@gisik-nokma/web'].sort(),
    );
    expect(undeclared, `these read outside themselves with no cross-root inputs:\n${undeclared.join('\n')}`).toEqual([]);
  });
});

describe('token discipline (coordination amendment 11)', () => {
  it('finds no colour literal outside packages/ui/src/tokens.ts across client source trees', () => {
    const hits = existingClientSourceRoots().flatMap((root) => scanTreeForColourLiterals(root));
    const report = hits.map((hit) => `${hit.file}:${hit.line} ${hit.match}`).join('\n');
    expect(hits, `colour literals outside the origin:\n${report}`).toEqual([]);
  });

  it('tokens.ts itself is exempt because it is the origin — and it does hold colours', () => {
    const origin = readFileSync(join(REPO_ROOT, 'packages/ui/src/tokens.ts'), 'utf8');
    expect(findColourLiterals(origin, 'script').length).toBeGreaterThan(0);
  });
});
