import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **V6 — the project page's five `Loading…` arms are `role="status"`. Case `13.1056`.**
 *
 * The finding: five tab-loading arms rendered a bare `<p>Loading…</p>` —
 * calendar, timeline, list, board and backlog — **in a file that uses
 * `role="status"` three times already**, in the create region. A screen reader
 * therefore got nothing when a tab's read was still in flight: the words
 * appeared in the DOM with no announcement, while the same file had already
 * decided that its own waits deserve one.
 *
 * **Why the sweep is the witness.** The five arms are five branches of one
 * `view === …` chain, so exactly ONE renders at a time and no single mount can
 * count them. The finding's own instrument was a grep — *"a single grep for
 * `Loading…` in that file returns exactly those five lines, none with a role"* —
 * and this rebuilds it, with the count PINNED at five so a sixth bare arm
 * reddens rather than joining a list nobody recounted.
 *
 * ⚠ **The sweep counts a DECLARATION.** It proves the attribute is written, not
 * that the arm renders — one runtime arm in
 * `project-calendar-timeline.test.tsx` reads the role off the rendered default
 * tab. Neither half is claimed for the other.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_PAGE = join(WEB_ROOT, 'app/w/[workspaceId]/p/[projectId]/page.tsx');

describe('V6 the tab-loading arms announce themselves', () => {
  it('13.1056 every Loading… arm carries role="status", and there are exactly five', () => {
    // Comments stripped: the file's own docblocks DISCUSS `Loading…` (lines
    // 99-100 do, at length) and a raw search counts prose as implementation.
    const source = readFileSync(PROJECT_PAGE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const arms = [...source.matchAll(/<p\b[^>]*>\s*Loading…\s*<\/p>/g)].map((m) => m[0]);

    // THE COUNT, pinned rather than described. The finding measured five; a
    // sixth arm added bare reddens here, and one removed reddens too — which is
    // the half a `for (const arm of arms)` loop over an empty list would miss.
    expect(arms, `found ${arms.length} Loading… arms`).toHaveLength(5);

    const bare = arms.filter((arm) => !/role="status"/.test(arm));
    expect(bare, `Loading… arms with no role:\n${bare.join('\n')}`).toEqual([]);

    // The file's own three create-region waits, checked in the same sweep so
    // this case is about the FILE's convention and not one arm's spelling.
    //
    // ⚠ THE NUMBER IS A SUM AND NOT A LITERAL, corrected here because the first
    // cut read `toBe(3)` — written against the PRE-fix file and left in place
    // when the five arms joined it, so it failed `expected 8 to be 3` on the
    // very run that proved the fix. A count that has to be re-derived every
    // time the thing it counts grows is a count nobody will maintain; this one
    // says where it comes from.
    const statuses = [...source.matchAll(/<p\b[^>]*role="status"[^>]*>/g)].map((m) => m[0]);
    expect(statuses, 'the create region lost its status sites').toHaveLength(arms.length + 3);
    // ...and NONE of them spells `aria-live`, which is why the arms were given
    // `role="status"` and NOT a second, redundant live-region attribute: the
    // role carries an implicit polite one, and spelling both would be two
    // sources for one behaviour.
    const withLive = statuses.filter((tag) => /aria-live/.test(tag));
    expect(withLive, `status sites that also spell aria-live:\n${withLive.join('\n')}`).toEqual([]);
  });
});
