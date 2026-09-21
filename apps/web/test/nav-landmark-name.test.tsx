import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **P31 — every `navigation` landmark in the product carries a name. Case `13.1053`.**
 *
 * The finding: the two chrome bars — `AppNav` (`apps/web/src/app-nav.tsx:232`)
 * and `LegalNav` (`apps/web/src/legal-nav.tsx:68`) — each render
 * `<nav className="gn-nav">` with **no accessible name**, and **both co-render
 * with a second, LABELLED `<nav>` on the same page**. A screen-reader user who
 * opens the landmark list therefore meets two `navigation` regions and only one
 * of them says what it is. The page-level fix is one attribute each:
 * `aria-label="Main"` and `aria-label="Legal"`.
 *
 * ## Why a sweep, when the fix is two attributes
 *
 * The reviewer's own instrument was exhaustive: every `<nav>` in product source,
 * nine elements, seven named and two not — a ratio that only holds until someone
 * adds the tenth. The sweep keeps that property rather than the two instances, so
 * a third unnamed bar reddens here instead of being found by the next review.
 *
 * ⚠ **The sweep counts a DECLARATION.** A `nav` whose `aria-labelledby` points at
 * an element that does not exist passes here and is unnamed in the browser. **The
 * rendered half is owed in the two files that already mount these bars**:
 * `app-nav.test.tsx` for `AppNav` and `not-found-and-legal.test.tsx` for
 * `LegalNav`, where the arm reads the name off the DOM rather than the source.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(WEB_ROOT, '../..');

/** The product's source trees — `reference/` is frozen and not the product. */
const SOURCE_TREES = [
  'apps/web/app',
  'apps/web/src',
  'packages/app-core/src',
  'packages/editor/src',
  'packages/domain/src',
  'packages/ui/src',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strips comments so a `<nav>` written in prose is not counted. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('P31 every navigation landmark is named', () => {
  it('13.1053 no product source renders a <nav> without an accessible name in the same tag', () => {
    const offenders: string[] = [];
    const named: string[] = [];

    for (const tree of SOURCE_TREES) {
      for (const file of sourceFiles(join(REPO_ROOT, tree))) {
        const source = withoutComments(readFileSync(file, 'utf8'));
        // The WHOLE OPENING TAG, not the line — `[^>]` crosses newlines, so an
        // attribute on a continuation line counts and a multi-line tag is seen.
        for (const match of source.matchAll(/<nav\b[^>]*>/g)) {
          const tag = match[0].replace(/\s+/g, ' ');
          const where = relative(REPO_ROOT, file);
          if (/aria-label=|aria-labelledby=/.test(tag)) named.push(where);
          else offenders.push(`${where} — ${tag.slice(0, 120)}`);
        }
      }
    }

    // POSITIVE CONTROL: the sweep traversed real trees and found real landmarks.
    // A regex that matches nothing at all and one that matches nothing wrong
    // produce the same empty list below, and only this arm tells them apart. The
    // reviewer's own count was nine `<nav>` elements, seven of them named.
    expect(named.length, 'the sweep found no NAMED <nav> at all — it is not looking at the product').toBeGreaterThan(
      3,
    );
    expect(offenders, `unnamed landmarks:\n${offenders.join('\n')}`).toEqual([]);
  });
});
