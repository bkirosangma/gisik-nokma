import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **P22 — every `role="menu"` in the product carries a name. Case `13.1059`.**
 *
 * The finding: two menus declared `role="menu"` with **no `aria-label` and no
 * `aria-labelledby`** — `apps/web/src/account-menu.tsx:148` and
 * `packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx:47`
 * — while a THIRD menu in the same product, `apps/web/src/last-project-nav.tsx`'s
 * `aria-label="Projects"`, showed the pattern the other two were missing. A menu
 * is a name-requiring role: a screen reader announces it as a set of choices, and
 * without a name the reader is told "menu" and nothing about whose.
 *
 * ## Why the sweep is the witness and the runtime arm is the second one
 *
 * The reviewer's own instrument was a sweep — every `role="…"` on a
 * name-requiring role across six source trees, comments stripped, taking the
 * element's WHOLE OPENING TAG rather than its line. Rebuilt here scoped to the
 * one role this ruling is about, so it reddens on the THIRD menu rather than
 * only on the two that were found. A runtime arm cannot do that: it sees the
 * menus a fixture happens to mount.
 *
 * ⚠ **The sweep counts a DECLARATION, never a rendered name.** A `role="menu"`
 * whose `aria-labelledby` points at an element that does not exist passes here
 * and is unnamed in the browser; `aria-labelledby` is accepted because the
 * product uses it and because resolving it needs a rendered tree this file does
 * not build. **The rendered half is owed in the two files that already mount
 * these menus**: `app-nav.test.tsx` for the account menu and
 * `workflow-builder/inspectors.test.tsx` for the builder's, where the arm reads
 * the name off the DOM rather than out of the source.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(WEB_ROOT, '../..');

/** The product's source trees — the six the finding swept, minus `reference/`. */
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
    return out; // a tree that does not exist is skipped, not failed
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strips `//` and `/* … *\/` comments so a role named in prose is not counted. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('P22 every menu is named', () => {
  it('13.1059 no product source declares role="menu" without an accessible name in the same tag', () => {
    const offenders: string[] = [];
    let seen = 0;

    for (const tree of SOURCE_TREES) {
      for (const file of sourceFiles(join(REPO_ROOT, tree))) {
        const source = withoutComments(readFileSync(file, 'utf8'));
        // The WHOLE OPENING TAG, not the line: an attribute added on a
        // continuation line counts, and an element whose tag spans lines is not
        // missed. `[^>]` matches newlines, so this crosses them.
        for (const match of source.matchAll(/<[a-zA-Z][^>]*role="menu"[^>]*>/g)) {
          seen += 1;
          const tag = match[0];
          if (!/aria-label=|aria-labelledby=/.test(tag)) {
            offenders.push(`${relative(REPO_ROOT, file)} — ${tag.replace(/\s+/g, ' ').slice(0, 120)}`);
          }
        }
      }
    }

    // POSITIVE CONTROL: the sweep traversed real trees and found the product's
    // menus. A regex that matches nothing at all and a regex that matches
    // nothing wrong produce the same empty list below.
    expect(seen, 'the sweep found no role="menu" at all — it is not looking at the product').toBeGreaterThanOrEqual(3);
    expect(offenders, `unnamed menus:\n${offenders.join('\n')}`).toEqual([]);
  });
});
