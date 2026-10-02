import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **V6 — the project page's five tab-loading arms announce themselves. Case `13.1056`, amended by smoothness T6 as `25.071`.**
 * (They were bare `<p role="status">Loading…</p>`; T6 made them skeletons whose region is the status — see the sweep below.)
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
  it('13.1056 / 25.071 the five tab arms are skeletons and no Loading… sentence remains', () => {
    // Comments stripped: the file's own docblocks DISCUSS `Loading…` and a raw search counts prose as implementation.
    const source = readFileSync(PROJECT_PAGE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    // Smoothness T6 (spec S4, amendment S-R1; FD4): the bare sentence arms became `ProjectTabSkeleton`, so the pin flips from
    // "exactly five announcing sentences" to "zero sentences, five skeleton sites". A sixth bare arm, or a skeleton arm
    // removed, both redden: the second half is the one an empty-list loop would miss.
    const arms = [...source.matchAll(/<p\b[^>]*>\s*Loading…\s*<\/p>/g)].map((m) => m[0]);
    expect(arms, `found ${arms.length} bare Loading… arms`).toHaveLength(0);
    expect(source.match(/<ProjectTabSkeleton\b/g) ?? []).toHaveLength(5);

    // The create region keeps two `role="status"` waits (the signed-out sentence and the types-fallback arm): the
    // "Preparing the Create ticket form…" arm is a busy BUTTON now (FD8), so the count is two, not three.
    const statuses = [...source.matchAll(/<p\b[^>]*role="status"[^>]*>/g)].map((m) => m[0]);
    expect(statuses, 'the create region lost or regained a status site').toHaveLength(2);
    // ...and NONE spells `aria-live`: `role="status"` carries an implicit polite live region, and spelling both would be two
    // sources for one behaviour.
    const withLive = statuses.filter((tag) => /aria-live/.test(tag));
    expect(withLive, `status sites that also spell aria-live:\n${withLive.join('\n')}`).toEqual([]);
  });
});
