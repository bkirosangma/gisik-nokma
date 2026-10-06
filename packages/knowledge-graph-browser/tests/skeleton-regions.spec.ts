import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { dropRules, restoreRegionSpecificity } from './css-controls.js';

/*
 * Every placeholder keeps its container's layout (kg-walk-fixes-2 item 5, planner ruling 15:46; case 27.695), on
 * `harness/skeleton-regions.html` with globals.css, ui.css and editor.css in the order the built app links them.
 * ui.css's region rule was `.gn-skeleton-region { display: block }` (0,1,0): linked after globals.css, and below most of
 * ui.css, it won the tie with a region's own container class, so Home's numbers stacked, the KG view's first-load circle
 * sat off centre and eight more placeholders lost their flex, grid or `contents` while loading. It is
 * `:where(.gn-skeleton-region)` now, zero specificity.
 *
 * - The list is the REPO's: every `<SkeletonRegion … className=…>` under apps/ and packages/ (tests and this harness
 *   excluded), a template class expanded over its prop's declared values, an unresolvable one a failure. At a LITERAL 360
 *   and 1280 each region's computed `display` equals its container's. CONTROL, same leg: the rule given back its old
 *   specificity on the live stylesheet, the regions measured on the stack lose theirs again.
 * - An `li` region (the notes history panel's) is a block, so it draws no marker. CONTROL, same leg: the rule deleted, it is
 *   a `list-item`.
 */

type Entry = { id: string; className: string; as: 'div' | 'section' | 'li' };
const ROOT = resolve(process.cwd(), '../..');
const SKIP = new Set(['node_modules', 'dist', '.next', 'test', 'tests', 'harness', 'e2e', 'e2e-stack', 'e2e-viewport']);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(path);
  }
  return out;
}

/** Every `<SkeletonRegion …>` in the repo's sources, and the ones that name a className, resolved to plain class strings. */
function scan(): { total: number; entries: Entry[]; unresolved: string[] } {
  const entries = new Map<string, Entry>();
  const unresolved: string[] = [];
  let total = 0;
  const roots = [join(ROOT, 'apps'), join(ROOT, 'packages')];
  for (const file of roots.flatMap((r) => sources(r))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<SkeletonRegion\b([^>]*?)>/gs)) {
      total += 1;
      const attrs = m[1]!;
      const as = (attrs.match(/\bas="(div|section|li)"/)?.[1] ?? 'div') as Entry['as'];
      const where = `${relative(ROOT, file)}:${text.slice(0, m.index).split('\n').length}`;
      const plain = attrs.match(/className="([^"]+)"/)?.[1];
      const template = attrs.match(/className=\{`([^`]+)`\}/)?.[1];
      if (plain !== undefined) entries.set(`${plain}|${as}`, { id: where, className: plain, as });
      else if (template !== undefined) {
        // `${prop}`: expanded over the prop's declared string-literal union in the same file (`prop?: 'a' | 'b'`).
        const holes = [...template.matchAll(/\$\{(\w+)\}/g)].map((h) => h[1]!);
        const values = holes.length === 1 ? text.match(new RegExp(`\\b${holes[0]}\\??:\\s*((?:'[^']+'\\s*\\|?\\s*)+);`))?.[1] : undefined;
        if (values === undefined) unresolved.push(`${where} ${template}`);
        else for (const v of values.split('|').map((x) => x.trim().replace(/'/g, ''))) {
          const className = template.replace(/\$\{\w+\}/, v);
          entries.set(`${className}|${as}`, { id: `${where} (${v})`, className, as });
        }
      } else if (/className=/.test(attrs)) unresolved.push(`${where} ${attrs.trim().slice(0, 80)}`);
    }
  }
  return { total, entries: [...entries.values()], unresolved };
}

async function open(page: Page, width: number, entries: Entry[]): Promise<void> {
  await page.addInitScript((list) => {
    window.__regionEntries = list;
  }, entries);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/skeleton-regions.html');
  // Vite may discover a dependency on a fresh cache and reload the page once: read nothing before the load that sticks.
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.innerWidth), 'the literal viewport width took').toBe(width);
  await expect(page.locator('[data-entry]')).toHaveCount(entries.length);
}

/** Each entry's region display against its container's. */
function displays(page: Page): Promise<{ id: string; className: string; region: string; container: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-entry]')].map((holder) => {
      const region = holder.querySelector('.gn-skeleton-region')!;
      const container = holder.querySelector('[data-container]')!;
      return { id: holder.dataset['entry']!, className: container.className, region: getComputedStyle(region).display, container: getComputedStyle(container).display };
    }),
  );
}

const SCAN = scan();

test('27.695 the scan finds the repo\'s regions, and every className resolves', () => {
  expect(SCAN.unresolved, SCAN.unresolved.join('\n')).toEqual([]);
  expect(SCAN.total, 'every <SkeletonRegion> the repo draws').toBeGreaterThanOrEqual(40);
  const classes = SCAN.entries.map((e) => e.className);
  // The haystack holds its subject: the sites the stack measured, Home's numbers and the KG view's circle among them.
  for (const c of ['gn-home__numbers', 'gn-kg__skeleton', 'gn-project__tab-skeleton', 'gn-help', 'workflow-builder-screen', 'gn-invitations', 'gn-field', 'gn-workspace-settings', 'gn-groups']) {
    expect(classes, `the scan found ${c}`).toContain(c);
  }
  expect(classes.filter((c) => c.startsWith('editor-slot ')).length, 'the editor template expanded over its modes').toBeGreaterThanOrEqual(3);
});

for (const width of [360, 1280] as const) {
  test(`27.695 at a literal ${width}px every SkeletonRegion keeps its container's display; CONTROL: the old specificity, they lose it`, async ({ page }) => {
    await open(page, width, SCAN.entries);
    const rows = await displays(page);
    const lost = rows.filter((r) => r.region !== r.container);
    expect(lost.map((r) => `${r.id} ${r.className}: ${r.container} -> ${r.region}`), 'regions whose display is not their container\'s').toEqual([]);
    // The comparison can fail: some containers are not blocks.
    expect(rows.filter((r) => r.container !== 'block').length).toBeGreaterThanOrEqual(5);

    expect(await restoreRegionSpecificity(page), "the region rule's old specificity was restored").toBe(1);
    const bare = (await displays(page)).filter((r) => r.region !== r.container).map((r) => `${r.className}: ${r.container} -> ${r.region}`);
    expect(bare, 'CONTROL: under the old specificity the measured regions lose their container\'s display').toEqual(
      expect.arrayContaining([
        'gn-home__numbers: grid -> block',
        'gn-kg__skeleton: grid -> block',
        'gn-project__tab-skeleton: contents -> block',
        'gn-help: flex -> block',
        'workflow-builder-screen: flex -> block',
        'gn-invitations: flex -> block',
        'gn-field: flex -> block',
        'gn-workspace-settings: flex -> block',
        'gn-groups: flex -> block',
      ]),
    );
  });
}

test('27.695 an li region (the notes history panel) is a block, so it draws no marker; CONTROL: without the rule it is a list-item', async ({ page }) => {
  await open(page, 1280, SCAN.entries);
  const li = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-history] > li.gn-skeleton-region')!).display);
  expect(await li()).toBe('block');
  expect(await dropRules(page, ':where(.gn-skeleton-region)'), 'the region rule was found and deleted').toBe(1);
  expect(await li(), 'CONTROL: an li with no rule is a list-item').toBe('list-item');
});
