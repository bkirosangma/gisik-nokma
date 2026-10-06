import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleReload, type WorkspaceRef } from '@gisik-nokma/app-core';
import { GRAPH_CHIP_ORDER, type GraphItemKind, type GraphItemView, type HomeResponse } from '@gisik-nokma/domain';
import type { GraphZonesSummary, KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { Providers, resetLastKnownUser } from '../src/providers.js';
import { PHONE_QUERY } from '../src/use-is-phone.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 27.646–27.652 and 27.657 (Knowledge Graph spec E §2.2–§2.3, plan Task 4): Home's graph, Start from and lighting, rendered
 * through `HomeScreen` with the REAL `Providers` and a stub `DataSource`. `KnowledgeGraph` is spec C's and is proven in a
 * real browser (`packages/knowledge-graph-browser/tests/home.spec.ts`, 27.653–27.656); here the ONE door to it,
 * `HomeGraphCanvas`, is a probe that records every props object it receives, so each case reads what Home handed the view
 * and calls the view's callbacks (`onZones`, `onEscape`, `onHopsChange`) the way the view would. The rest of the canvas
 * module (its placeholder) is the real one.
 */
const h = vi.hoisted(() => ({ calls: [] as unknown[], withSelect: false, push: vi.fn() }));
vi.mock('../src/home/home-graph-canvas.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/home/home-graph-canvas.js')>();
  const { useState } = await import('react');
  const { Select } = await import('@gisik-nokma/ui');
  /** C's bar holds a real ui `Select` (its Workspaces picker); the probe draws one when a case asks for it (27.651). */
  function BarSelect() {
    const [value, setValue] = useState<string[]>(['ws_a']);
    const options = [
      { value: 'ws_a', label: 'Kalita Tea' },
      { value: 'ws_b', label: 'Studio' },
    ];
    return <Select multiple aria-label="Workspaces" options={options} value={value} onChange={setValue} />;
  }
  return {
    ...real,
    HomeGraphCanvas: (props: object) => {
      h.calls.push(props);
      return <div data-testid="kg-probe">{h.withSelect ? <BarSelect /> : null}</div>;
    },
  };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { homeNodeIds } from '../src/home/home-graph.js';
import { highlightNote } from '../src/home/home-highlight-note.js';
import { HomeScreen } from '../src/home/home-screen.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const CSS = readFileSync(resolve(WEB, 'app/globals.css'), 'utf8');
const UI_CSS = readFileSync(resolve(WEB, '../../packages/ui/src/ui.css'), 'utf8');
const NOTIFICATIONS = { notifications: { unreadCount: async () => 0 } };
const ALL_OFF = ['false', 'false', 'false', 'false', 'false', 'false'];

function workspace(id: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return { id, name: 'Kalita Tea', prefix: 'KT', role: 'owner', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [], ...over };
}
/** Six non-empty, DISJOINT id lists, so a swapped list or an empty `Set()` cannot pass (27.648). */
function home(workspaceId: string, over: { counts?: Partial<HomeResponse['counts']>; ids?: Partial<HomeResponse['ids']> } = {}): HomeResponse {
  return {
    workspaceId,
    generatedAt: '2026-10-06T04:30:00.000Z',
    dueSoonDays: 3,
    counts: { tickets: 4, open: 3, pastDue: 2, dueSoon: 1, members: 1, notes: 1, ...over.counts },
    ids: { tickets: ['t_all1'], open: ['t_op1'], pastDue: ['t_pd1', 't_pd2'], dueSoon: ['t_ds1'], members: ['u_1'], notes: ['n_1'], ...over.ids },
  };
}
/** Each case answers for a workspace id of its own: the read cache (`home:<id>`) is module state. */
function renderHome(workspaceId: string, answer: () => HomeResponse = () => home(workspaceId), getMyWorkspaces?: () => Promise<WorkspaceRef[]>) {
  const services = stubServices(
    { getMyWorkspaces: getMyWorkspaces ?? (async () => [workspace(workspaceId)]), getHome: async () => answer() },
    NOTIFICATIONS,
  );
  render(
    <Providers services={services}>
      <HomeScreen />
    </Providers>,
  );
  return services;
}

/** `window.matchMedia` for `useIsPhone`: the phone query answers `media.phone`, and `flipPhone` fires its `change`. */
const media = { phone: false, listeners: new Set<() => void>() };
function matchMediaStub(query: string): MediaQueryList {
  return {
    get matches() {
      return query === PHONE_QUERY && media.phone;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => {
      if (query === PHONE_QUERY) media.listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      media.listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}
function flipPhone(next: boolean): void {
  media.phone = next;
  act(() => {
    for (const listener of [...media.listeners]) listener();
  });
}

const calls = (): KnowledgeGraphProps[] => h.calls as KnowledgeGraphProps[];
function last(): KnowledgeGraphProps {
  const props = calls()[calls().length - 1];
  if (props === undefined) throw new Error('the graph never mounted');
  return props;
}
const mounted = () => screen.findByTestId('kg-probe');
const tile = (name: string) => screen.getByRole('button', { name });
const pressedStates = () => [...document.querySelectorAll('button.gn-home__number')].map((b) => b.getAttribute('aria-pressed'));
const noteText = () => document.querySelector('.gn-home__note-text')?.textContent;
const showMore = () => screen.queryByRole('button', { name: 'Show more hops' });
/** What the view reports after a layout (`onZones`). */
function report(z: { clear: readonly string[]; fog?: readonly string[]; beyond?: number; clearHop?: number; capped?: boolean }): void {
  const zones: GraphZonesSummary = { clear: new Set(z.clear), fog: new Set(z.fog ?? []), beyond: z.beyond ?? 0, clearHop: z.clearHop ?? 2, capped: z.capped ?? false };
  act(() => last().onZones!(zones));
}
function item(kind: GraphItemKind, id: string, workspaceId: string | null = 'ws_9'): GraphItemView {
  return { ref: `${kind}:${id}`, kind, id, workspaceId, projectId: null, label: id, title: null, category: null, hop: 1, out: false, suggested: false };
}

beforeEach(() => {
  h.calls.length = 0;
  h.withSelect = false;
  h.push.mockClear();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  resetLastKnownUser();
  media.phone = false;
  media.listeners.clear();
  vi.stubGlobal('matchMedia', matchMediaStub);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('27.646 Home mounts the view in its configuration, the hops following the breakpoint until picked', () => {
  it('27.646 desktop: config "home", centre "workspace:ws_1", hops 2 and C\'s required props; a phone flip gives config "phone" and hops 1, and back', async () => {
    const services = renderHome('ws_1', () => home('ws_1'), async () => [
      workspace('ws_1', { projects: [{ id: 'p_live', name: 'Mobile web', archived: false }, { id: 'p_old', name: 'Retired', archived: true }] as WorkspaceRef['projects'] }),
    ]);
    await mounted();
    expect(last().config).toBe('home');
    expect(last().centre).toBe('workspace:ws_1'); // a literal: a wrong kgNodeId would agree with itself
    expect(last().hops).toBe(2);
    // C's required and Home-only props (planner ruling 2026-10-04 Q5): the app's gateway, the scope read (archived left
    // out), the workspace as the default scope, every chip including Projects, and no Hops control in the bar.
    expect(last().source).toBe(services.graph);
    expect(last().scope).toEqual({ workspaces: [{ id: 'ws_1', name: 'Kalita Tea', projects: [{ id: 'p_live', name: 'Mobile web' }] }] });
    expect(last().defaultWorkspaceIds).toEqual(['ws_1']);
    expect(last().groups).toEqual(GRAPH_CHIP_ORDER);
    expect(last().groups).toContain('projects');
    expect(last().showHops).toBe(false);

    // Desktop → phone: C's phone form (one hop, the folded bar, the inspector card), as the mockup's phone Home and
    // `GraphPanel` choose it; Home passes hops 1 too.
    flipPhone(true);
    expect(last().config).toBe('phone');
    expect(last().hops).toBe(1);
    // Phone → desktop (planner ruling 2026-10-04 Q8): the default follows the breakpoint, never read once.
    flipPhone(false);
    expect(last().config).toBe('home');
    expect(last().hops).toBe(2);
  });

  it('27.646 mounted on a phone: every props object carries config "phone" and hops 1 (the list is non-empty)', async () => {
    media.phone = true;
    renderHome('ws_646p');
    await mounted();
    expect(calls().length).toBeGreaterThan(0);
    expect(new Set(calls().map((p) => p.hops))).toEqual(new Set([1]));
    expect(new Set(calls().map((p) => p.config))).toEqual(new Set(['phone']));
  });

  it('27.646 the pick holds: Show more hops on desktop gives 3, and 3 stays through a phone flip and back', async () => {
    const user = userEvent.setup();
    renderHome('ws_646k');
    await mounted();
    await user.click(await screen.findByRole('button', { name: '2 Past due' }));
    report({ clear: ['ticket:t_pd1'], fog: ['ticket:t_pd2'] }); // one further out, so the control shows
    await user.click(showMore()!);
    expect(last().hops).toBe(3);
    flipPhone(true);
    expect(last().hops).toBe(3);
    flipPhone(false);
    expect(last().hops).toBe(3);
  });

  it('27.646 Open: a note, a project and a workspace open their page; a ticket, a person and a concept get no Open (Home has no sheet)', async () => {
    renderHome('ws_646o');
    await mounted();
    const kinds: GraphItemKind[] = ['ticket', 'person', 'concept', 'note', 'project', 'workspace'];
    expect(kinds.map((kind) => last().canOpen!(item(kind, 'x_1')))).toEqual([false, false, false, true, true, true]);
    act(() => last().onOpen(item('note', 'n_1')));
    expect(h.push).toHaveBeenLastCalledWith('/notes/n_1');
    act(() => last().onOpen(item('project', 'p_1', 'ws_9')));
    expect(h.push).toHaveBeenLastCalledWith('/w/ws_9/p/p_1');
    act(() => last().onOpen(item('workspace', 'ws_9', 'ws_9')));
    expect(h.push).toHaveBeenLastCalledWith('/w/ws_9');
    // Control: the kinds with no page go nowhere.
    h.push.mockClear();
    act(() => last().onOpen(item('ticket', 't_1')));
    act(() => last().onOpen(item('person', 'u_1', null)));
    expect(h.push).not.toHaveBeenCalled();
  });

  it('27.646 the scope read: its placeholder while pending, its refusal when refused, never an endless placeholder', async () => {
    let n = 0;
    renderHome('ws_646s', () => home('ws_646s'), async () => {
      n += 1;
      return n === 1 ? [workspace('ws_646s')] : new Promise<WorkspaceRef[]>(() => undefined);
    });
    // The numbers answered (the page's own read); the graph's scope read has not: the canvas's placeholder holds its box.
    await screen.findByRole('button', { name: '2 Past due' });
    await waitFor(() => expect(document.querySelector('.gn-home__graph-placeholder')).not.toBeNull());
    expect(screen.queryByTestId('kg-probe')).toBeNull();

    cleanup();
    let m = 0;
    renderHome('ws_646r', () => home('ws_646r'), async () => {
      m += 1;
      if (m === 1) return [workspace('ws_646r')];
      throw new Error('HTTP 500 for /v1/me/workspaces');
    });
    expect(await screen.findByText('HTTP 500 for /v1/me/workspaces')).toBeInTheDocument();
    expect(document.querySelector('.gn-home__graph-placeholder')).toBeNull();
    expect(screen.queryByTestId('kg-probe')).toBeNull();
  });
});

describe('27.647 Start from: This workspace | Me', () => {
  it('27.647 Me centres "person:u_kiro" and This workspace "workspace:ws_647"; control: the lit number and its set are unchanged across the switch', async () => {
    const user = userEvent.setup();
    renderHome('ws_647');
    await mounted();
    const startFrom = screen.getByRole('tablist', { name: 'Start from' });
    expect(within(startFrom).getAllByRole('tab').map((t) => t.textContent)).toEqual(['This workspace', 'Me']);
    expect(last().centre).toBe('workspace:ws_647');

    // Precondition for the control: a number IS lit (otherwise "unchanged" is null → null).
    await user.click(tile('2 Past due'));
    const lit = last().highlight;
    expect(lit).toBeInstanceOf(Set);
    expect(lit!.size).toBeGreaterThan(0);
    expect(tile('2 Past due')).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(startFrom).getByRole('tab', { name: 'Me' }));
    expect(last().centre).toBe('person:u_kiro');
    expect(last().highlight).toEqual(lit);
    expect(tile('2 Past due')).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(startFrom).getByRole('tab', { name: 'This workspace' }));
    expect(last().centre).toBe('workspace:ws_647');
  });
});

describe('27.648 a pressed number lights its items on the graph', () => {
  it('27.648 each number passes its own ids as graph refs (tickets, people, notes); a reload re-passes the new set; control: nothing pressed passes null', async () => {
    const user = userEvent.setup();
    let answer = home('ws_648');
    renderHome('ws_648', () => answer);
    await mounted();
    expect(last().highlight).toBeNull();

    const cases: Array<[string, string[]]> = [
      ['2 Past due', ['ticket:t_pd1', 'ticket:t_pd2']],
      ['1 Members', ['person:u_1']],
      ['1 Notes', ['note:n_1']],
      ['4 Tickets', ['ticket:t_all1']],
      ['3 Open', ['ticket:t_op1']],
      ['1 Due in 3 days', ['ticket:t_ds1']],
    ];
    for (const [name, refs] of cases) {
      await user.click(tile(name));
      expect(last().highlight).toEqual(new Set(refs));
    }
    // Control: pressing the lit one again clears it, and the view is told null, not an empty set.
    await user.click(tile('1 Due in 3 days'));
    expect(last().highlight).toBeNull();

    // A reload (a stream frame) with new Past due ids, the count still above 0 (Review Focus 5).
    await user.click(tile('2 Past due'));
    answer = home('ws_648', { counts: { pastDue: 1 }, ids: { pastDue: ['t_pd3'] } });
    act(() => scheduleReload('ws_648', 0));
    await waitFor(() => expect(last().highlight).toEqual(new Set(['ticket:t_pd3'])));
    expect(last().highlight!.has('ticket:t_pd1')).toBe(false);
  });

  it('27.648 homeNodeIds maps each number to its kind', () => {
    expect(homeNodeIds('members', ['u_1', 'u_2'])).toEqual(new Set(['person:u_1', 'person:u_2']));
    expect(homeNodeIds('notes', ['n_1'])).toEqual(new Set(['note:n_1']));
    expect(homeNodeIds('dueSoon', ['t_1'])).toEqual(new Set(['ticket:t_1']));
  });
});

describe('27.649 the highlight note', () => {
  it('27.649 highlightNote: all lit, none lit, a zero, and the noun following lit (not total)', () => {
    expect(highlightNote({ key: 'pastDue', total: 3, lit: 3, further: 0, dueSoonDays: 3 })).toEqual({ text: '3 past due, lit up on the graph.', further: 0 });
    expect(highlightNote({ key: 'pastDue', total: 3, lit: 0, further: 5, dueSoonDays: 3 })).toEqual({ text: 'None to light up.', further: 5 });
    expect(highlightNote({ key: 'pastDue', total: 0, lit: 0, further: 5, dueSoonDays: 3 })).toEqual({ text: '', further: 0 });
    expect(highlightNote({ key: 'notes', total: 2, lit: 1, further: 1, dueSoonDays: 3 })).toEqual({ text: '1 note, lit up on the graph. 1 more are further out.', further: 1 });
    expect(highlightNote({ key: 'dueSoon', total: 2, lit: 2, further: 0, dueSoonDays: 0 })).toEqual({ text: '2 due today, lit up on the graph.', further: 0 });
  });

  it('27.649 the rendered note is polite and empty with nothing lit; it says nothing until the graph has reported a layout', async () => {
    const user = userEvent.setup();
    renderHome('ws_649');
    await mounted();
    const note = document.querySelector('.gn-home__note')!;
    expect(note.getAttribute('aria-live')).toBe('polite');
    expect(note.textContent).toBe(''); // never toHaveTextContent(''), which matches anything

    await user.click(tile('2 Past due'));
    // No layout reported yet: no claim about the graph ("None to light up." would be false while it loads).
    expect(note.textContent).toBe('');
    report({ clear: ['ticket:t_pd1', 'ticket:t_pd2'] });
    expect(screen.getByText('2 past due, lit up on the graph.').closest('[aria-live="polite"]')).toBe(note);
    report({ clear: ['workspace:ws_649'] });
    expect(noteText()).toBe('None to light up.');
    // Control: clearing the number empties the note again.
    await user.click(tile('2 Past due'));
    expect(note.textContent).toBe('');
  });

  it('27.649 the note row keeps one height: it is as tall as Start from (2.75rem segments in a 0.25rem track), which holds the 2.75rem button; a phone keeps two text lines', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-home__graph-head'), 'min-height')).toBe('3.25rem');
    expect(valueOf(ruleExactly(UI_CSS, '.gn-button'), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(CSS, '.gn-home__note'), 'line-height')).toBe('1.25rem');
    expect(valueOf(ruleExactly(CSS, '.gn-home__note', '@media (max-width: 40rem)'), 'min-height')).toBe('2.5rem');
  });
});

describe('27.650 fog and beyond are further out, with Show more hops', () => {
  const ids = ['pd1', 'pd2', 'pd3', 'pd4', 'pd5'];
  const answer = (workspaceId: string) => () => home(workspaceId, { counts: { pastDue: 5 }, ids: { pastDue: ids } });
  // lit = |{pd1, pd2}| = 2; further = fog.size + beyond = 2 + 4 = 6 (total − lit = 3 would differ)
  const partial = { clear: ['ticket:pd1', 'ticket:pd2', 'ticket:x1'], fog: ['ticket:pd3', 'ticket:f1'], beyond: 4 };

  it('27.650 all clear: no further out and no button; partial: "6 more are further out." and Show more hops to 3, then 4, then gone; "all" shows none', async () => {
    const user = userEvent.setup();
    renderHome('ws_650', answer('ws_650'));
    await mounted();
    await user.click(tile('5 Past due'));
    // Control first, at hops 2 (where a button could show): all five clear.
    report({ clear: ids.map((id) => `ticket:${id}`) });
    expect(noteText()).toBe('5 past due, lit up on the graph.');
    expect(showMore()).toBeNull();

    report(partial);
    expect(noteText()).toBe('2 past due, lit up on the graph. 6 more are further out.');
    expect(showMore()).not.toBeNull();
    await user.click(showMore()!);
    expect(last().hops).toBe(3);
    await user.click(showMore()!);
    expect(last().hops).toBe(4);
    expect(showMore()).toBeNull();

    // `'all'` (planner ruling 2026-10-04 Q7), from the view's own control: never compared numerically, no button.
    act(() => last().onHopsChange!('all'));
    expect(last().hops).toBe('all');
    report(partial);
    expect(noteText()).toBe('2 past due, lit up on the graph. 6 more are further out.');
    expect(showMore()).toBeNull();
  });

  it('27.650 on a phone: the same partial report says "6 more are further out." and offers no Show more hops', async () => {
    media.phone = true;
    const user = userEvent.setup();
    renderHome('ws_650p', answer('ws_650p'));
    await mounted();
    await user.click(tile('5 Past due'));
    report(partial);
    expect(noteText()).toBe('2 past due, lit up on the graph. 6 more are further out.');
    expect(showMore()).toBeNull();
  });
});

describe('27.651 Escape: a menu first, then the highlight, then the view\'s Back', () => {
  it('27.651 the view\'s onEscape (the LATEST one) clears a lit number and answers true; a second answers false (C goes Back)', async () => {
    const user = userEvent.setup();
    renderHome('ws_651');
    await mounted();
    await user.click(tile('2 Past due'));
    expect(tile('2 Past due')).toHaveAttribute('aria-pressed', 'true');
    expect(last().highlight).not.toBeNull();

    let answer: boolean | undefined;
    act(() => {
      answer = last().onEscape!();
    });
    expect(answer).toBe(true);
    expect(pressedStates()).toEqual(ALL_OFF);
    expect(last().highlight).toBeNull();

    act(() => {
      answer = last().onEscape!();
    });
    expect(answer).toBe(false);
  });

  it('27.651 an Escape that closes the bar\'s open Select leaves the number lit; control: the same Escape from the tile clears it', async () => {
    h.withSelect = true;
    const user = userEvent.setup();
    renderHome('ws_651s');
    await mounted();
    await user.click(tile('2 Past due'));
    await user.click(document.querySelector<HTMLElement>('.gn-select__trigger-open')!);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(tile('2 Past due')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(tile('2 Past due'), { key: 'Escape' });
    expect(pressedStates()).toEqual(ALL_OFF);
  });
});

describe('27.652 capped ids: further out is what the graph reports, not the uncapped remainder', () => {
  it('27.652 2,500 past due with 2,000 ids, all clear, 300 in fog and 150 beyond: "450 more are further out."; control: no fog and none beyond reads no remainder', async () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `pd${String(i).padStart(4, '0')}`);
    const user = userEvent.setup();
    renderHome('ws_652', () => home('ws_652', { counts: { pastDue: 2500 }, ids: { pastDue: ids } }));
    await mounted();
    await user.click(tile('2500 Past due'));
    const clear = ids.map((id) => `ticket:${id}`);
    const fog300 = Array.from({ length: 300 }, (_, i) => `ticket:f${i}`); // none of them in ids.pastDue
    report({ clear, fog: fog300, beyond: 150, capped: true });
    expect(noteText()).toBe('2000 past due, lit up on the graph. 450 more are further out.');

    report({ clear, fog: [], beyond: 0, capped: true });
    expect(noteText()).toBe('2000 past due, lit up on the graph.');
    expect(showMore()).toBeNull();
  });
});

/**
 * 27.657's census: what a file under `apps/web/src` or `apps/web/app` may import from `@gisik-nokma/knowledge-graph`.
 * The one allowed runtime entry is `/ids` (C's sigma-free entry); `import type` is erased at build; the package root
 * loads ONLY through `import()` in the two client-only doors. Comments are stripped first, so a docblock naming the
 * package is not an import. Statements are matched from the start of a line, the clause holding no quote or semicolon,
 * so one statement's `from` is never read as another's.
 */
const KG = '@gisik-nokma/knowledge-graph';
const DYNAMIC_DOORS = new Set(['src/home/home-graph-canvas.tsx', 'src/knowledge-graph/graph-panel.tsx']);
function kgImportViolations(file: string, source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const out: string[] = [];
  const runtimeOk = (spec: string) => spec === `${KG}/ids`;
  for (const m of code.matchAll(/^\s*(import|export)\s+(type\s+)?[^;'"`]*?\bfrom\s*['"](@gisik-nokma\/knowledge-graph(?:\/[^'"]*)?)['"]/gm)) {
    if (m[2] === undefined && !runtimeOk(m[3]!)) out.push(`${file}: ${m[1]} … from '${m[3]}'`);
  }
  for (const m of code.matchAll(/^\s*import\s*['"](@gisik-nokma\/knowledge-graph(?:\/[^'"]*)?)['"]/gm)) {
    if (!runtimeOk(m[1]!)) out.push(`${file}: import '${m[1]}'`);
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"](@gisik-nokma\/knowledge-graph(?:\/[^'"]*)?)['"]\s*\)/g)) {
    if (!(DYNAMIC_DOORS.has(file) && m[1] === KG)) out.push(`${file}: import('${m[1]}')`);
  }
  return out;
}
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.(ts|tsx)$/.test(name) ? [relative(WEB, path)] : [];
  });
}

describe('27.657 the SSR seam: Sigma loads client-only, through one door', () => {
  it('27.657 no file under src/ or app/ imports the package root at runtime; the canvas loads it with next/dynamic and ssr: false; control: every planted form is flagged, /ids and import type are not', () => {
    const files = [...sourcesUnder(join(WEB, 'src')), ...sourcesUnder(join(WEB, 'app'))];
    // The walk is non-empty and reaches Home.
    expect(files).toContain('src/home/home-graph.tsx');
    expect(files).toContain('src/home/home-graph-canvas.tsx');
    expect(files.flatMap((file) => kgImportViolations(file, readFileSync(join(WEB, file), 'utf8')))).toEqual([]);

    const canvas = readFileSync(join(WEB, 'src/home/home-graph-canvas.tsx'), 'utf8');
    expect(canvas).toContain('dynamic(');
    expect(canvas).toMatch(/\bssr:\s*false\b/);
    expect(canvas).toMatch(/import\(\s*'@gisik-nokma\/knowledge-graph'\s*\)/);
    expect(canvas).not.toMatch(/from\s*['"]@gisik-nokma\/knowledge-graph['"]/);

    // Control, every planted form flagged (a regex walker misses side-effect and re-export imports).
    const home = 'src/home/home-graph.tsx';
    expect(kgImportViolations(home, `import { KnowledgeGraph } from '${KG}';`)).toHaveLength(1);
    expect(kgImportViolations(home, `import { KnowledgeGraph } from "${KG}";`)).toHaveLength(1);
    expect(kgImportViolations(home, `import {\n  KnowledgeGraph,\n} from '${KG}';`)).toHaveLength(1);
    expect(kgImportViolations(home, `import { type GraphSource, KnowledgeGraph } from '${KG}';`)).toHaveLength(1);
    expect(kgImportViolations(home, `import '${KG}';`)).toHaveLength(1);
    expect(kgImportViolations(home, `export { KnowledgeGraph } from '${KG}';`)).toHaveLength(1);
    expect(kgImportViolations(home, `const C = dynamic(() => import('${KG}'), { ssr: false });`)).toHaveLength(1);
    expect(kgImportViolations(home, `import { kgNodeId } from '${KG}/engine';`)).toHaveLength(1);
    expect(kgImportViolations('src/home/home-graph-canvas.tsx', `const C = dynamic(() => import('${KG}/sigma'), { ssr: false });`)).toHaveLength(1);
    // …and the allowed forms are not.
    expect(kgImportViolations(home, `import { kgNodeId } from '${KG}/ids';`)).toEqual([]);
    expect(kgImportViolations(home, `import type { GraphSource, HopChoice } from '${KG}';`)).toEqual([]);
    expect(kgImportViolations(home, `// import { KnowledgeGraph } from '${KG}';\n/* import('${KG}') */`)).toEqual([]);
    expect(kgImportViolations('src/home/home-graph-canvas.tsx', `const C = dynamic(() => import('${KG}'), { ssr: false });`)).toEqual([]);
    expect(kgImportViolations(home, `import { Button } from '@gisik-nokma/ui';\nimport type { ScopeChoices } from '${KG}';`)).toEqual([]);
  });
});
