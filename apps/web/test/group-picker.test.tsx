import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { groupCreatedPayload, rankBetween, type GroupRow } from '@gisik-nokma/domain';
import { GroupPicker, type GroupChoice } from '../src/group-picker.js';
import { groupSeeds } from '../src/group-picker-seeds.js';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * Cases 22.160–22.166 — the four-level group picker (prefixes and groups plan
 * Task 9, R6 / FD3 / FD11).
 *
 * **What these cases are really guarding.** A type-ahead that is allowed to
 * create is a type-ahead that can create a DUPLICATE: "retail" typed under the
 * level-1 group that already holds "Retail" must select the existing one (22.162),
 * and a "Retail" that someone else created while this person was typing must be
 * adopted, not refused and not doubled (22.165). The level lists are scoped to
 * the parent the person picked (22.161) — a same-named group under another
 * level-1 group is a different group, and listing it would let the person file a
 * project under the wrong branch. So the assertions read WHICH group an action
 * selected by id, not by the label that the list happens to show.
 *
 * The picker is controlled and pure of the network: `groups` in, a `GroupChoice`
 * out, and `groupSeeds` turns a choice into the `group.created` events the form
 * submits in the same batch as the project's own claim. jsdom has no layout, so
 * the 44px floor is read from the stylesheet source, as the members cases do.
 */
const GLOBALS_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../app/globals.css'),
  'utf8',
);

const WS = '01J9WORKSPACE00000000000AA';

/** Valid, strictly increasing rank keys, so the fixture is ordered like the server's. */
const R1 = rankBetween(null, null);
const R2 = rankBetween(R1, null);
const R3 = rankBetween(R2, null);

const group = (
  id: string,
  parentId: string | null,
  level: GroupRow['level'],
  name: string,
  rank: string,
): GroupRow => ({ id, parentId, level, name, rank, projectCount: 0, childCount: 0 });

const SHOPS = group('g-shops', null, 1, 'Shops', R1);
const SERVICES = group('g-services', null, 1, 'Services', R2);
const RETAIL = group('g-retail', 'g-shops', 2, 'Retail', R1);
const WHOLESALE = group('g-wholesale', 'g-shops', 2, 'Wholesale', R2);
/** The same NAME as RETAIL, under the other level-1 group: a different group (R4). */
const SERVICES_RETAIL = group('g-services-retail', 'g-services', 2, 'Retail', R1);
const ONLINE = group('g-online', 'g-retail', 3, 'Online', R1);
const MARKETPLACES = group('g-marketplaces', 'g-online', 4, 'Marketplaces', R1);
const GROUPS = [SHOPS, SERVICES, RETAIL, WHOLESALE, SERVICES_RETAIL, ONLINE, MARKETPLACES];

const EMPTY: GroupChoice = { groupId: null, pendingNames: [] };

/** The picker behind the state a form would own, recording every change it reports. */
function Harness(props: {
  groups: GroupRow[];
  initial?: GroupChoice;
  onChange?: (choice: GroupChoice) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<GroupChoice>(props.initial ?? EMPTY);
  return (
    <GroupPicker
      groups={props.groups}
      value={value}
      disabled={props.disabled}
      idPrefix="t"
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

const level = (n: 1 | 2 | 3 | 4) => screen.getByRole('combobox', { name: `Level ${n} group` });
const last = (spy: ReturnType<typeof vi.fn>): GroupChoice => spy.mock.calls.at(-1)![0] as GroupChoice;
/** The options a combobox currently offers, as text, in order. */
const optionTexts = () => screen.queryAllByRole('option').map((option) => option.textContent);

describe('22.160 four comboboxes, each enabled only once the level above has a value', () => {
  it('22.160 — Level 1 group … Level 4 group exist; level N+1 is disabled until level N is set; control: picking Shops enables Level 2 and not Level 3', async () => {
    const user = userEvent.setup();
    render(<Harness groups={GROUPS} />);

    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(level(1)).toBeEnabled();
    for (const n of [2, 3, 4] as const) expect(level(n), `Level ${n} starts disabled`).toBeDisabled();

    await user.click(level(1));
    await user.type(level(1), 'Shops{Enter}');

    expect(level(2), 'control: a set level 1 enables level 2').toBeEnabled();
    expect(level(3), 'control: …and only level 2').toBeDisabled();
    expect(level(4)).toBeDisabled();
  });

  it('22.160 — the disabled prop disables every level, including level 1', () => {
    render(<Harness groups={GROUPS} disabled initial={{ groupId: SHOPS.id, pendingNames: [] }} />);
    for (const n of [1, 2, 3, 4] as const) expect(level(n)).toBeDisabled();
  });
});

describe('22.161 a level lists only the children of the pick above it, containing the typed text', () => {
  it('22.161 — typing "ETAI" in level 2 under Shops lists Retail (ignoring case) and not Wholesale; control: the Retail under Services is not offered, and the one chosen is Shops’s', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} onChange={onChange} />);

    await user.click(level(2));
    expect(optionTexts(), 'an empty box offers every child of Shops, in rank order').toEqual(['Retail', 'Wholesale']);

    await user.type(level(2), 'ETAI');
    expect(optionTexts().slice(0, 1)).toEqual(['Retail']);
    expect(optionTexts()).not.toContain('Wholesale');
    expect(
      optionTexts().filter((text) => text === 'Retail'),
      'control: ONE Retail, because Services’s is another branch',
    ).toHaveLength(1);

    await user.click(screen.getByRole('option', { name: 'Retail' }));
    expect(last(onChange), 'the Retail picked is the one under Shops, by id').toEqual({
      groupId: RETAIL.id,
      pendingNames: [],
    });
  });

  it('22.161 — with Services above, the same text offers Services’s Retail', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness groups={GROUPS} initial={{ groupId: SERVICES.id, pendingNames: [] }} onChange={onChange} />);
    await user.type(level(2), 'ret');
    await user.click(screen.getByRole('option', { name: 'Retail' }));
    expect(last(onChange).groupId).toBe(SERVICES_RETAIL.id);
  });
});

describe('22.162 an exact match, ignoring case, selects the existing group on blur or Enter', () => {
  it('22.162 — "RETAIL" then Tab selects Retail, and "wholesale" then Enter selects Wholesale; control: "RETAI" then Tab does NOT select Retail', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} onChange={onChange} />);

    await user.type(level(2), 'RETAIL');
    await user.tab();
    expect(last(onChange)).toEqual({ groupId: RETAIL.id, pendingNames: [] });
    expect(level(2)).toHaveValue('Retail');
    expect(screen.queryByText('New'), 'an exact match is not a new group').toBeNull();

    // Level 3 is enabled now; use Enter on it with an exact name.
    await user.type(level(3), 'online{Enter}');
    expect(last(onChange)).toEqual({ groupId: ONLINE.id, pendingNames: [] });

    // CONTROL (same it): a near miss is not an exact match.
    await user.type(level(4), 'Marketplace');
    await user.tab();
    expect(last(onChange), 'a partial name becomes a pending NEW group, never a match').toEqual({
      groupId: ONLINE.id,
      pendingNames: ['Marketplace'],
    });
  });
});

describe('22.163 a name with no match becomes a pending New group, and groupSeeds creates it', () => {
  it('22.163 — "Franchise" under Shops then leaving shows "Franchise" with a New tag and pendingNames holds it; groupSeeds emits group.created with the right parent, level and rank and returns its id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} onChange={onChange} />);

    await user.type(level(2), 'Franchise');
    await user.tab();

    expect(level(2)).toHaveValue('Franchise');
    expect(screen.getByText('New'), 'the typed name carries a New tag').toBeInTheDocument();
    expect(last(onChange)).toEqual({ groupId: SHOPS.id, pendingNames: ['Franchise'] });
    expect(level(3), 'a pending group still opens the next level').toBeEnabled();

    await user.type(level(3), 'Kiosks{Enter}');
    expect(last(onChange)).toEqual({ groupId: SHOPS.id, pendingNames: ['Franchise', 'Kiosks'] });
    expect(optionTexts(), 'nothing existing sits under a pending group').toEqual([]);

    let n = 0;
    const { seeds, groupId } = groupSeeds(WS, GROUPS, last(onChange), () => `new-${(n += 1)}`);
    expect(seeds).toHaveLength(2);
    expect(seeds[0]).toMatchObject({
      workspaceId: WS,
      entity: { kind: 'group', id: 'new-1' },
      type: 'group.created',
      payload: { parentId: SHOPS.id, level: 2, name: 'Franchise' },
    });
    expect(seeds[1]).toMatchObject({
      entity: { kind: 'group', id: 'new-2' },
      type: 'group.created',
      payload: { parentId: 'new-1', level: 3, name: 'Kiosks' },
    });
    expect(groupId, 'the deepest NEW id is what the project files under').toBe('new-2');
    // The rank is AFTER Shops's last child (Wholesale), and every payload is one the door accepts.
    const first = seeds[0]!.payload as { rank: string };
    expect(first.rank > WHOLESALE.rank).toBe(true);
    for (const seed of seeds) expect(() => groupCreatedPayload.parse(seed.payload)).not.toThrow();
  });

  it('22.163 — groupSeeds with nothing pending emits nothing and returns the existing pick; a level-1 create has a null parent and sorts after the last level-1 group', () => {
    expect(groupSeeds(WS, GROUPS, { groupId: ONLINE.id, pendingNames: [] }, () => 'x')).toEqual({
      seeds: [],
      groupId: ONLINE.id,
    });
    expect(groupSeeds(WS, GROUPS, EMPTY, () => 'x')).toEqual({ seeds: [], groupId: null });

    const { seeds, groupId } = groupSeeds(WS, GROUPS, { groupId: null, pendingNames: ['Wholesale'] }, () => 'top');
    expect(groupId).toBe('top');
    const payload = seeds[0]!.payload as { parentId: string | null; level: number; rank: string };
    expect(payload.parentId).toBeNull();
    expect(payload.level).toBe(1);
    expect(payload.rank > SERVICES.rank).toBe(true);
  });
});

describe('22.164 clearing a level clears the levels below it', () => {
  it('22.164 — emptying level 2 empties and disables levels 3 and 4 and keeps level 1; control: before, all four were filled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness groups={GROUPS} initial={{ groupId: MARKETPLACES.id, pendingNames: [] }} onChange={onChange} />);

    expect([1, 2, 3, 4].map((n) => (level(n as 1 | 2 | 3 | 4) as HTMLInputElement).value)).toEqual([
      'Shops',
      'Retail',
      'Online',
      'Marketplaces',
    ]);

    await user.clear(level(2));

    expect(last(onChange)).toEqual({ groupId: SHOPS.id, pendingNames: [] });
    expect(level(1)).toHaveValue('Shops');
    expect(level(2)).toHaveValue('');
    expect(level(3)).toHaveValue('');
    expect(level(4)).toHaveValue('');
    expect(level(3)).toBeDisabled();
    expect(level(4)).toBeDisabled();
  });
});

describe('22.165 a group created by someone else first is adopted, not refused and not doubled', () => {
  it('22.165 — a pending "Retail" whose name the re-read groups now contain becomes the existing Retail, with “Using the existing Retail.”; control: a pending name with no match stays pending', async () => {
    const onChange = vi.fn();
    const before = [SHOPS, SERVICES];
    const { rerender } = render(
      <Harness groups={before} initial={{ groupId: SHOPS.id, pendingNames: ['Retail', 'Franchise'] }} onChange={onChange} />,
    );
    expect(level(2)).toHaveValue('Retail');
    expect(screen.getAllByText('New'), 'both are New before the re-read').toHaveLength(2);
    expect(screen.queryByRole('status')).toBeNull();

    // The form submitted, the door answered `group.name-taken`, the form re-read the groups.
    rerender(
      <Harness groups={[SHOPS, SERVICES, RETAIL]} initial={{ groupId: SHOPS.id, pendingNames: ['Retail', 'Franchise'] }} onChange={onChange} />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Using the existing Retail.');
    expect(last(onChange), 'the existing Retail is selected; Franchise is still to be created').toEqual({
      groupId: RETAIL.id,
      pendingNames: ['Franchise'],
    });
    expect(level(2)).toHaveValue('Retail');
    expect(within(level(2).closest('div')!).queryByText('New'), 'Retail is no longer New').toBeNull();
    expect(level(3)).toHaveValue('Franchise');
    expect(screen.getAllByText('New'), 'control: Franchise (no match) stays New').toHaveLength(1);
  });
});

describe('22.166 every level is a 44px target with a visible label, and the keyboard alone sets all four', () => {
  it('22.166 — the input rule floors at 2.75rem and the label is not visually hidden; control: the label text is the combobox’s accessible name', () => {
    const input = ruleFor(GLOBALS_CSS, /^\.gn-group-picker__input\s*\{/);
    expect(input, 'a `.gn-group-picker__input { }` rule').toBeDefined();
    expect(input).toMatch(/min-height:\s*2\.75rem/);
    const label = ruleFor(GLOBALS_CSS, /^\.gn-group-picker__label\s*\{/);
    expect(label, 'a `.gn-group-picker__label { }` rule').toBeDefined();
    expect(label).not.toMatch(/clip|sr-only|visually-hidden|position:\s*absolute/);

    render(<Harness groups={GROUPS} />);
    for (const n of [1, 2, 3, 4] as const) {
      const box = level(n);
      expect(box).toHaveClass('gn-group-picker__input');
      const text = document.querySelector(`label[for="${box.id}"]`);
      expect(text, `Level ${n} has a <label for>`).not.toBeNull();
      expect(text).toHaveTextContent(`Level ${n} group`);
      expect(text).toHaveClass('gn-group-picker__label');
    }
  });

  it('22.166 — Tab, type, arrow and Enter walk Shops › Retail › Online › Marketplaces with no pointer', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness groups={GROUPS} onChange={onChange} />);

    await user.tab();
    expect(level(1)).toHaveFocus();
    await user.keyboard('Sh{ArrowDown}{Enter}');
    expect(last(onChange)).toEqual({ groupId: SHOPS.id, pendingNames: [] });

    await user.tab();
    expect(level(2)).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(last(onChange), 'Down, Down, Up from an empty box lands on the first option, Retail').toEqual({
      groupId: RETAIL.id,
      pendingNames: [],
    });

    await user.tab();
    await user.keyboard('online{Enter}');
    await user.tab();
    await user.keyboard('market{ArrowDown}{Enter}');
    expect(last(onChange)).toEqual({ groupId: MARKETPLACES.id, pendingNames: [] });
    expect([1, 2, 3, 4].map((n) => (level(n as 1 | 2 | 3 | 4) as HTMLInputElement).value)).toEqual([
      'Shops',
      'Retail',
      'Online',
      'Marketplaces',
    ]);
  });
});

describe('22.167 the Create option sits last when nothing matches exactly', () => {
  it('22.167 — under Shops, "Fran" ends the options with Create “Fran”, and the pointer or ArrowDown+Enter on it makes a pending group; control: "retail" (exact) offers no Create option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const first = render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} onChange={onChange} />);
    await user.type(level(2), 'Fran');
    expect(optionTexts().at(-1)).toBe('Create “Fran”');
    await user.click(screen.getByRole('option', { name: 'Create “Fran”' }));
    expect(last(onChange)).toEqual({ groupId: SHOPS.id, pendingNames: ['Fran'] });
    first.unmount();

    const second = render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} onChange={onChange} />);
    await user.type(level(2), 'ale');
    expect(optionTexts(), 'the real match first, Create LAST').toEqual(['Wholesale', 'Create “ale”']);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(last(onChange)).toEqual({ groupId: SHOPS.id, pendingNames: ['ale'] });
    second.unmount();

    render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} />);
    await user.type(level(2), 'retail');
    expect(optionTexts(), 'control: an exact match has no Create option').toEqual(['Retail']);
  });
});

describe('22.168 the picker keeps Enter and Escape to itself', () => {
  it('22.168 — inside a form, Enter in a level does not submit it and Escape with the list OPEN does not reach the outer keydown; control: Escape with the list CLOSED does reach it', async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={(event) => outerKeyDown(event.key)}>
        <form onSubmit={submit}>
          <Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} />
          <button type="submit">Save</button>
        </form>
      </div>,
    );

    await user.click(level(2));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(submit, 'Enter picked an option; it did not submit the form').not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(submit, 'Enter with nothing highlighted resolves the box; still no submit').not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    expect(level(2), 'the list is open before Escape').toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(outerKeyDown, 'Escape with the list open closes it and stays inside').not.toHaveBeenCalledWith('Escape');

    await user.keyboard('{Escape}');
    expect(outerKeyDown, 'control: Escape with the list closed reaches the dialog behind it').toHaveBeenCalledWith('Escape');
  });
});

describe('22.169 aria-activedescendant follows the highlighted option', () => {
  it('22.169 — ArrowDown twice sets aria-activedescendant to the second option and aria-expanded true; control: before any arrow it is absent', async () => {
    const user = userEvent.setup();
    render(<Harness groups={GROUPS} initial={{ groupId: SHOPS.id, pendingNames: [] }} />);
    await user.click(level(2));
    expect(level(2), 'control: nothing highlighted yet').not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    const second = screen.getByRole('option', { name: 'Wholesale' });
    expect(level(2)).toHaveAttribute('aria-activedescendant', second.id);
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(level(2)).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('22.170 groupSeeds refuses a chain deeper than level 4', () => {
  it('22.170 — two pending names under a level-3 pick throw; control: ONE gives a level-4 group.created', () => {
    expect(() => groupSeeds(WS, GROUPS, { groupId: ONLINE.id, pendingNames: ['A', 'B'] }, () => 'x')).toThrow(/pass level 4/);
    const { seeds } = groupSeeds(WS, GROUPS, { groupId: ONLINE.id, pendingNames: ['A'] }, () => 'x');
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.payload).toMatchObject({ parentId: ONLINE.id, level: 4, name: 'A' });
  });
});
