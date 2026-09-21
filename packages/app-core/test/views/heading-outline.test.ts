import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Heading outline in the board, the List and My Work — round-2 findings
 * **`E4-24`** and **`P17`**, which are one property measured on the same three
 * screens and are carried here as ONE instrument with two arms.
 *
 * Measured on every route: Board `H1 Shop operations` → `H3 Simple kanban`,
 * `H3 Errand with waits`; List `H1` → `H3 Recently assigned`, `H3 Open
 * questions …`; My Work `H1 My Work` → `H3 Assigned to me` … (four). **The
 * outline went h1 → h3 with no h2 anywhere in the path, on three of the
 * product's main screens.** The page title is an `h1`; the first level under it
 * is an `h2`.
 *
 * **A SOURCE scan, and the reason is specific rather than convenient:** the
 * property IS the tag — `<h3 className="…">` and `<h2 className="…">` differ by
 * one character and nothing else about them changes — so the file is the
 * authority and a rendered assertion would restate it. What a source scan
 * cannot see is an `h2` nested under something that is not an `h1`; that needs
 * a per-route outline walk, and the finding asks for one (`P17`'s second half).
 * It is NOT claimed here.
 *
 * **NOT COVERED, named rather than implied: the builder.** `E4-24` also records
 * that the builder's `h3`s (the aside panels' titles) hang under no `h1` at
 * all — the route renders `main.gn-shell` and the screen's visible title is an
 * editable `<input class="workflow-builder-screen__name">`, not a heading. That
 * is a different defect (a MISSING `h1`, not a skipped `h2`) and it needs a
 * design decision about where a heading goes on a screen whose title is a
 * field; the finding's own words call it *"which its own record already owes"*.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const APP_CORE = join(REPO_ROOT, 'packages/app-core/src/views');

/** The three families whose level this case is about, as `<tag class="…">`. */
const FAMILIES = ['gn-board__workflow', 'gn-my-work__heading', 'gn-list__section-title'];

function levelsOf(source: string): Array<{ tag: string; family: string }> {
  const found: Array<{ tag: string; family: string }> = [];
  for (const family of FAMILIES) {
    const re = new RegExp(`<(h[1-6])\\s+className="${family}"`, 'g');
    for (const m of source.matchAll(re)) {
      found.push({ tag: m[1] ?? '?', family });
    }
    // The two-line JSX form — the opening tag's class on its own line.
    const reMultiline = new RegExp(`<(h[1-6])\\s*\\n\\s*className="${family}"`, 'g');
    for (const m of source.matchAll(reMultiline)) {
      found.push({ tag: m[1] ?? '?', family });
    }
  }
  return found;
}

describe('heading outline — E4-24 / P17', () => {
  const sources = {
    board: readFileSync(join(APP_CORE, 'board.tsx'), 'utf8'),
    'my-work': readFileSync(join(APP_CORE, 'my-work.tsx'), 'utf8'),
    'ticket-list': readFileSync(join(APP_CORE, 'ticket-list.tsx'), 'utf8'),
  };

  it('the extractor finds the families at all — a positive control over the same reader', () => {
    // Without this, a regex that matched nothing would make every assertion
    // below pass over three files it never opened.
    const found = Object.values(sources).flatMap(levelsOf);
    expect(found.length, 'no section headings found in any of the three views').toBeGreaterThanOrEqual(5);
    for (const family of FAMILIES) {
      expect(
        found.some((f) => f.family === family),
        `${family} was not found — the extractor is broken, or the class left the view`,
      ).toBe(true);
    }
  });

  it('every section heading under a page title is an h2, and none is an h3', () => {
    for (const [name, source] of Object.entries(sources)) {
      for (const { tag, family } of levelsOf(source)) {
        expect(tag, `${name}.tsx: ${family} is an <${tag}>`).toBe('h2');
      }
    }
  });

  it('the pre-fix tag is caught by the same reader — planted, in the same path', () => {
    // MUTATION WITNESS: the shipped value, planted into the board's own source
    // and read back through `levelsOf`. A plant that read as `h2` would mean the
    // extractor is not reading the tag it claims to.
    const planted = sources.board.replace('<h2 className="gn-board__workflow">', '<h3 className="gn-board__workflow">');
    expect(planted, 'the plant matched nothing — the witness is inert').not.toBe(sources.board);
    const tags = levelsOf(planted).filter((f) => f.family === 'gn-board__workflow').map((f) => f.tag);
    expect(tags).toEqual(['h3']);
    // And the real source still reads as fixed, in the same function.
    expect(levelsOf(sources.board).map((f) => f.tag)).toEqual(['h2']);
  });
});
