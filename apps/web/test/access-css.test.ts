import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Access plan Task 8, case 3.999 — the rules exist, inside the plan's own block. */

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'), 'utf8');
const BEGIN = '/* ══ access-and-invites: begin ══';
const END = '/* ══ access-and-invites: end ══ */';

describe('3.999 the access-and-invites CSS block', () => {
  it('3.999 every rendered class has a rule in the block, controls are 44px; CONTROL: markers appear once', () => {
    expect(CSS.split(BEGIN)).toHaveLength(2);
    expect(CSS.split(END)).toHaveLength(2);
    const block = CSS.slice(CSS.indexOf(BEGIN), CSS.indexOf(END));
    for (const cls of ['.gn-outsider-finder', '.gn-outsider-finder__actions', '.gn-outsider-finder__found', '.gn-invite-mint__emailed', '.gn-invite-mint__account']) {
      expect(block, cls).toMatch(new RegExp(`${cls.replace(/[.]/g, '\\.')}\\s*[,{]`));
    }
    expect(block).toMatch(/\.gn-outsider-finder[^{]*\{[^}]*min-height:\s*2\.75rem/);
  });
});
