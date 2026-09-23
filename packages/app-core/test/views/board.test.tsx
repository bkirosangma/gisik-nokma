import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax`, and the repo already
// settled this at packages/ui/test/components.test.tsx. The plan's Task 9
// snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isUlid, type IngestResult } from '@gisik-nokma/domain';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import {
  Board,
  EMPTY_BOARD_COPY,
  EMPTY_BOARD_UNWIRED_COPY,
  EMPTY_COLUMN_COPY,
  useBoard,
} from '../../src/views/board.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { formatDate } from '../../src/provenance.js';
import { TICKET, WS, boardCardSeed, claim } from '../helpers/seed.js';

/**
 * ADAPTATION. The plan's Task 9 fixtures reach into the board they just built
 * (`board.groups[0].columns[1].cards = [...]`) to vary a card. Under this
 * repo's `noUncheckedIndexedAccess` every one of those indexed reads is
 * `T | undefined` and the file does not compile, so the variation is a
 * PARAMETER of the fixture instead of a mutation after the fact. Same board,
 * same columns, same assertions.
 */
function errandGroup(doingCards: BoardCard[] = [boardCardSeed()]): BoardGroup {
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [] },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: doingCards },
      { stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true, creatable: true, cards: [] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
    ],
  };
}

function errandBoard(doingCards?: BoardCard[]): BoardView {
  return { projectId: 'prj_1', groups: [errandGroup(doingCards)] };
}

describe('Board — columns are exactly the workflow states, never invented (spec §7)', () => {
  it('renders every declared column, empty ones included, and nothing else', () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    const columns = screen.getAllByRole('region');
    expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual([
      'To do',
      'Doing',
      'Waiting on counterparty',
      'Done',
    ]);
  });

  it('marks a blocked state visibly', () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    expect(screen.getByRole('region', { name: 'Waiting on counterparty' }).className).toContain(
      'gn-board__column--blocked',
    );
  });

  it('names the workflow per group when a project mixes workflows', () => {
    const board: BoardView = {
      projectId: 'prj_1',
      groups: [
        errandGroup(),
        { workflowId: 'wf-approval', workflowVersion: 1, workflowName: 'Approval', columns: [] },
      ],
    };
    render(<Board board={board} onOpenTicket={() => {}} />);
    expect(screen.getByText('Errand')).toBeInTheDocument();
    expect(screen.getByText('Approval')).toBeInTheDocument();
  });
});

/**
 * BINDING SEMANTIC 3. Regrouping rearranges tickets; it never removes one.
 * Every other board test in the plan renders at most ONE card per column, so
 * a defect that drops cards past the first in a column passes all of them.
 * These render the SAME three tickets under one workflow and under two, and
 * hold both renders to the same totals — and to the counts the column headers
 * themselves claim.
 */
describe('Board — grouping is a rearrangement, never a filter (invariant 5)', () => {
  const GST = boardCardSeed({ ticketId: '01J9GTKA000000000000000001', title: 'File the GST return' });
  const LICENCE = boardCardSeed({ ticketId: '01J9GTKA000000000000000002', title: 'Renew the trade licence' });
  const INVOICE = boardCardSeed({ ticketId: '01J9GTKA000000000000000003', title: 'Chase the Tura invoice' });

  /** All three tickets on one workflow, stacked in a single column. */
  function oneWorkflow(): BoardView {
    return {
      projectId: 'prj_1',
      groups: [
        {
          workflowId: 'wf-errand',
          workflowVersion: 1,
          workflowName: 'Errand',
          columns: [
            { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [GST, LICENCE, INVOICE] },
            { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
          ],
        },
      ],
    };
  }

  /** The same three tickets, split across two workflows and four columns. */
  function twoWorkflows(): BoardView {
    return {
      projectId: 'prj_1',
      groups: [
        {
          workflowId: 'wf-errand',
          workflowVersion: 1,
          workflowName: 'Errand',
          columns: [
            { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [GST] },
            { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [] },
          ],
        },
        {
          workflowId: 'wf-approval',
          workflowVersion: 1,
          workflowName: 'Approval',
          columns: [
            { stateId: 'review', name: 'In review', category: 'active', blocked: false, creatable: true, cards: [LICENCE] },
            { stateId: 'approved', name: 'Approved', category: 'terminal', blocked: false, creatable: false, cards: [INVOICE] },
          ],
        },
      ],
    };
  }

  function renderedTitles(): string[] {
    return screen
      .getAllByRole('listitem')
      .map((slot) => slot.querySelector('.gn-board-card__title')?.textContent ?? '');
  }

  function badgeTotal(container: HTMLElement): number {
    return [...container.querySelectorAll('.gn-board__count')].reduce(
      (total, badge) => total + Number(badge.textContent),
      0,
    );
  }

  it('PLANTED DEFECT: the same ticket set grouped two ways renders the same tickets', () => {
    const flat = render(<Board board={oneWorkflow()} onOpenTicket={() => {}} />);
    const flatTitles = renderedTitles();
    flat.unmount();
    render(<Board board={twoWorkflows()} onOpenTicket={() => {}} />);
    const groupedTitles = renderedTitles();
    expect(flatTitles).toHaveLength(3);
    expect([...groupedTitles].sort()).toEqual([...flatTitles].sort());
  });

  it('PLANTED DEFECT: the column count badges and the rendered cards agree, in both groupings', () => {
    // A card-dropping defect leaves `column.cards.length` telling the truth
    // while the column under it shows fewer tickets than it has just claimed.
    const flat = render(<Board board={oneWorkflow()} onOpenTicket={() => {}} />);
    expect(badgeTotal(flat.container)).toBe(3);
    expect(renderedTitles()).toHaveLength(3);
    flat.unmount();
    const grouped = render(<Board board={twoWorkflows()} onOpenTicket={() => {}} />);
    expect(badgeTotal(grouped.container)).toBe(3);
    expect(renderedTitles()).toHaveLength(3);
  });
});

describe('Board card — the provenance unfold (honesty contract 1)', () => {
  /* 13.302 — the provenance control unfolds to text carrying BOTH an actor and
   * a time, in one asserted string. The sibling below pins the nameless-claim
   * arm, so the actor is never dropped for want of a display name. */
  it('unfolds to "marked <state> by <who> on <when>"', async () => {
    const user = userEvent.setup();
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'who · when' }));
    expect(screen.getByText('marked Doing by Anselma Marak on 19 Aug 2026')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: a nameless claim still names the actor by id — never anonymous', async () => {
    const user = userEvent.setup();
    const board = errandBoard([boardCardSeed({ stateProvenance: claim({ actorName: null }) })]);
    render(<Board board={board} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'who · when' }));
    expect(screen.getByText('marked Doing by user_anselma on 19 Aug 2026')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: parent progress shows restricted children — "5 of 8 done · 2 restricted" with only 6 visible', () => {
    const board = errandBoard([
      boardCardSeed({ rollup: { totalChildren: 8, terminalChildren: 5, restrictedCount: 2 } }),
    ]);
    render(<Board board={board} onOpenTicket={() => {}} />);
    expect(screen.getByText('5 of 8 done · 2 restricted')).toBeInTheDocument();
  });

  /* 13.301 — the reopen-cause chip. Present-arm only: every card in this render
   * carries a `cause`, so nothing here asserts the chip is ABSENT when it is
   * null. That is the reserved case's own shape ("renders for a seeded reopened
   * card"), recorded in `test-cases/13-deployment-dogfooding.md` rather than
   * widened here. */
  it('renders the reopen cause — a reopen is never an anonymous flip', () => {
    const board = errandBoard([
      boardCardSeed({ cause: { kind: 'reopened-for-child', childTicketId: 't_child' } }),
    ]);
    render(<Board board={board} onOpenTicket={() => {}} />);
    expect(screen.getByText('reopened — live work added')).toBeInTheDocument();
  });

  it('badges a claim in transit as visually distinct, and only then', () => {
    const board = errandBoard([boardCardSeed({ pending: true })]);
    const { rerender } = render(<Board board={board} onOpenTicket={() => {}} />);
    expect(screen.getByText('claim in transit')).toBeInTheDocument();
    rerender(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    expect(screen.queryByText('claim in transit')).not.toBeInTheDocument();
  });

  /**
   * Case 13.463 (board-prototype-port Task 6, 2026-09-16). `gn-board-card--pending`
   * carries the spec's dashed in-transit outline (`ui.css`) and has no rule of
   * its own reason to exist unless `BoardCardView` actually adds it — this is
   * that wiring's only test, positive AND negative in the same case (not just
   * "renders when pending"): deleting the ternary in `board.tsx` and hard-coding
   * `'gn-board-card'` fails the first assertion, and hard-coding the pending
   * class onto every card fails the second — the same both-arms discipline the
   * "claim in transit" chip test just above already holds itself to.
   */
  it('outlines the card container itself while a claim is in transit, and only then', () => {
    const board = errandBoard([boardCardSeed({ pending: true })]);
    const { rerender, container } = render(<Board board={board} onOpenTicket={() => {}} />);
    const pendingCard = container.querySelector('.gn-board-card');
    expect(pendingCard?.className).toContain('gn-board-card--pending');

    rerender(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    const settledCard = container.querySelector('.gn-board-card');
    expect(settledCard?.className).not.toContain('gn-board-card--pending');
  });

  it('opens the ticket on title click', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<Board board={errandBoard()} onOpenTicket={onOpenTicket} />);
    await user.click(screen.getByRole('button', { name: 'File the GST return' }));
    expect(onOpenTicket).toHaveBeenCalledWith(TICKET);
  });
});

/**
 * BINDING SEMANTIC 5. Every instant this client renders goes through the
 * domain's one `formatIstInstant`. The unfold test above proves only that the
 * default machine agrees with it — this machine's zone IS Asia/Kolkata, so a
 * `toLocaleDateString` inlined into the card prints "19 Aug 2026" and passes
 * every other assertion in this file. Under a zone fourteen hours ahead the
 * same recorded instant falls on the 20th, and only the device-reading defect
 * moves with it.
 */
describe('Board card — one clock, and it is not the viewer’s laptop', () => {
  function unfoldUnder(zone: string): string {
    const original = process.env.TZ;
    process.env.TZ = zone;
    try {
      const view = render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
      const fold = screen.getByRole('button', { name: 'who · when' });
      act(() => {
        fold.click();
      });
      const text = view.container.querySelector('.gn-board-card__provenance')?.textContent ?? '';
      view.unmount();
      return text;
    } finally {
      // `process.env.TZ = undefined` assigns the STRING "undefined", which ICU
      // resolves to GMT — so the naive restore does not restore, it switches
      // every app-core file scheduled after this one in the same worker to UTC.
      // It corrupts ONLY when TZ was unset, which is the default here and in
      // CI: present in exactly the runs nobody inspects, absent from the runs
      // that would catch it. That is this helper's own defect wearing the
      // costume the helper exists to strip off.
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  }

  it('PLANTED DEFECT: the unfold reads the same IST day from a zone fourteen hours ahead', () => {
    expect(unfoldUnder('Pacific/Kiritimati')).toBe('marked Doing by Anselma Marak on 19 Aug 2026');
  });

  it('PLANTED DEFECT: and from a zone eleven hours behind — two zones, one answer', () => {
    expect(unfoldUnder('Pacific/Niue')).toBe('marked Doing by Anselma Marak on 19 Aug 2026');
    expect(unfoldUnder('Pacific/Kiritimati')).toEqual(unfoldUnder('Pacific/Niue'));
  });

  it('PLANTED DEFECT: no zone can move the rendered day off the recorded one', () => {
    expect(unfoldUnder('Pacific/Kiritimati')).not.toContain('20 Aug');
    expect(unfoldUnder('Pacific/Niue')).not.toContain('18 Aug');
  });

  /**
   * THE PROBE THAT KEEPS THE THREE TESTS ABOVE FROM BEING VACUOUS, and it is
   * not ceremony. Under vitest's `threads` pool, `process.env.TZ = zone` does
   * not move the clock AT ALL — a worker thread does not get the process-level
   * reconfiguration — so `unfoldUnder` returns the ambient rendering for every
   * zone and all three assertions above pass while proving nothing. Measured:
   * `npx vitest run --pool=threads test/views/board.test.tsx` was 32/32 green
   * before this probe existed, and two zones render identically inside a
   * `new Worker(...)` while differing on the main thread.
   *
   * `test/provenance.test.ts` has carried this probe since T6, which is why
   * the same condition surfaces there as a failure and surfaced here as three
   * green tests. A claim about a zone needs a check that the zone can move.
   */
  it('the harness above really can move the ambient zone — otherwise it proves nothing', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const east = new Date('2026-08-19T10:05:00.000Z').toLocaleString();
      process.env.TZ = 'Pacific/Niue';
      const west = new Date('2026-08-19T10:05:00.000Z').toLocaleString();
      expect(east).not.toBe(west);
    } finally {
      // The delete-when-unset form. `provenance.test.ts:104,130` still carry
      // the naive spelling this describe had to be fixed for — same class,
      // latent, no observable harm today; recorded, owner Plan 6a.
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('PLANTED DEFECT: the zone swap hands the worker back exactly the TZ it borrowed', () => {
    // This test SETS the two configurations rather than observing whichever it
    // inherits, and that is not tidiness. Written the observing way — read
    // `process.env.TZ`, unfold, assert it came back — it passed against the
    // naive `process.env.TZ = original`, and was caught only by mutating it:
    // the three tests above had already run, so by the time it looked, the
    // corruption it was written to catch had ALREADY happened and its baseline
    // was the string "undefined". Restoring "undefined" to "undefined" is a
    // faithful restore. A check that reads ambient state cannot witness that
    // state being corrupted.
    const outer = process.env.TZ;
    try {
      // (a) the gate's default configuration, stated instead of inherited.
      delete process.env.TZ;
      unfoldUnder('Pacific/Kiritimati');
      expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
      expect(process.env.TZ).toBeUndefined();

      // (b) and the configuration in which the naive spelling works — which is
      // why the defect lives in exactly the runs nobody inspects.
      process.env.TZ = 'Pacific/Niue';
      unfoldUnder('Pacific/Kiritimati');
      expect(process.env.TZ).toBe('Pacific/Niue');
    } finally {
      if (outer === undefined) delete process.env.TZ;
      else process.env.TZ = outer;
    }
  });
});

/**
 * BINDING SEMANTIC 4. `pending` is a fact about THIS browser between submit
 * and the server's answer. The server's answer stays three-member.
 */
describe('`pending` is a client-side view flag, not a server status', () => {
  it('rides on BoardCard, and IngestResult still admits exactly committed | invalid | refused', () => {
    const inTransit: BoardCard = boardCardSeed({ pending: true });
    expect(inTransit.pending).toBe(true);
    // If a future edit widens IngestResult with a fourth 'pending' member,
    // this directive stops being needed and `pnpm --filter
    // @gisik-nokma/app-core typecheck` fails HERE, naming the union.
    // @ts-expect-error 'pending' is not an IngestResult status.
    const notAServerAnswer: IngestResult = { status: 'pending', eventId: TICKET, seq: 1, serverTime: 'x' };
    expect(notAServerAnswer).toBeDefined();
  });
});

/**
 * BINDING SEMANTIC 7 (coordination amendment 10). Views speak to the world
 * through `DataSource` and nothing else. A keyword hunt over raw source would
 * fire on the prose in these modules' own comments — the seam comments name
 * Task 7's transport on purpose — so the scan strips comments first, and is
 * proved to strip them before it is trusted.
 */
const VIEWS_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '../../src/views');

/**
 * `fetch` UNQUALIFIED, not `fetch(` — an aliased reference
 * (`const f = globalThis.fetch; f(url)`) is the same door with the handle
 * moved, and `WebSocket` without its `new` for the same reason. The word
 * boundary already spares `refetch`: there is no boundary between its `e` and
 * its `f`, which the tests below hold.
 */
const NETWORK_APIS = [
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsendBeacon\b/,
];

/**
 * react, the shared packages, and relative paths inside app-core. Nothing else.
 *
 * The `(\/|$)` is the whole guard. Without it this is a PREFIX test, and
 * `react-router-dom`, `reactive-http-transport`, `@gisik-nokma/uix-evil` and
 * `@gisik-nokma/domain-hax` all read as allowed — a scan that names four
 * packages and admits every package whose name begins with one of them.
 */
const ALLOWED_IMPORTS = /^(react(\/|$)|@gisik-nokma\/(ui|domain|rule-engine)(\/|$)|\.\.?\/)/;

/**
 * Four spellings reach a module and `from '…'` is one of them. Reading that
 * one alone leaves `import './x.js'`, `await import('https://evil/x.js')` and
 * `require('axios')` invisible to a guard whose whole job is to name them.
 */
const IMPORT_FORMS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
];

/**
 * `import(...)` and `require(...)` are read as CALLS, not as quoted literals,
 * because their argument need not be one. A template literal or a
 * concatenation carries a specifier that a quoted-literal pattern extracts as
 * NOTHING — not as a suspicious entry, as an empty result — so the guard would
 * report the file clean. An argument that is not exactly one quoted string is
 * reported as `<computed>`, which no allow-list entry matches: a view module
 * assembling its import target at runtime is precisely what this scan exists
 * to see.
 */
const CALL_IMPORT = /\b(?:import|require)\s*\(([^)]*)\)/g;
const ONE_STRING_LITERAL = /^\s*(['"])([^'"]*)\1\s*$/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function networkTells(source: string): string[] {
  const code = stripComments(source);
  return NETWORK_APIS.filter((pattern) => pattern.test(code)).map((pattern) => pattern.source);
}

function importsOf(source: string): string[] {
  const code = stripComments(source);
  const found = IMPORT_FORMS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[1] ?? ''),
  );
  for (const call of code.matchAll(CALL_IMPORT)) {
    const literal = ONE_STRING_LITERAL.exec(call[1] ?? '');
    found.push(literal ? (literal[2] ?? '') : '<computed>');
  }
  return found;
}

/**
 * Recursive, because `src/views/<subdir>/` is a directory the flat walk scanned
 * with nothing at all while `it('has views to scan at all')` stayed green
 * beside it — a guard reporting success over files it never opened.
 */
function viewFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .map((entry) => String(entry))
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'));
}

describe('the view-import scan is proven against planted defects before it is trusted', () => {
  it('catches a real network call', () => {
    expect(networkTells("const r = fetch('/v1/board');")).toHaveLength(1);
    expect(networkTells('const s = new WebSocket(url);')).toHaveLength(1);
  });

  it('PLANTED DEFECT: catches the same APIs reached without a call and without a `new`', () => {
    expect(networkTells('const f = globalThis.fetch; f(url);')).toHaveLength(1);
    expect(networkTells("navigator.sendBeacon('/v1/events', body);")).toHaveLength(1);
    expect(networkTells('const S = globalThis.WebSocket; new S(url);')).toHaveLength(1);
  });

  it('is not fooled by the word in a comment, nor by "refetch"', () => {
    expect(networkTells('// the real fetch(url) lives in Plan 6 Task 7')).toEqual([]);
    expect(networkTells('/* fetch( */ const x = 1;')).toEqual([]);
    expect(networkTells('function refetch() { return 1; }')).toEqual([]);
  });

  it('reads import specifiers, and not the ones inside comments', () => {
    expect(importsOf("import { A } from '../online/http.js';")).toEqual(['../online/http.js']);
    expect(importsOf("// consumed from '../online/http.js' by nobody here")).toEqual([]);
  });

  it('PLANTED DEFECT: reads the three import spellings that carry no `from`', () => {
    expect(importsOf("import './register-transport.js';")).toEqual(['./register-transport.js']);
    expect(importsOf("await import('https://evil.example/x.js');")).toEqual([
      'https://evil.example/x.js',
    ]);
    expect(importsOf("const a = require('axios');")).toEqual(['axios']);
  });

  it('PLANTED DEFECT: a specifier the scan cannot READ is reported, not skipped', () => {
    // The failure mode being closed is silence: a quoted-literal pattern
    // returns `[]` for both of these, and `[]` is what a clean file returns.
    expect(importsOf('await import(`https://evil.example/${x}.js`);')).toEqual(['<computed>']);
    expect(importsOf("const a = require('react' + '-router-dom');")).toEqual(['<computed>']);
    expect(ALLOWED_IMPORTS.test('<computed>')).toBe(false);
  });

  it('PLANTED DEFECT: `import type` is an import, and a type-only door is still a door', () => {
    expect(importsOf("import type { Something } from 'react-router-dom';")).toEqual([
      'react-router-dom',
    ]);
  });

  it('PLANTED DEFECT: an allowed package NAME is not an allowed package PREFIX', () => {
    for (const specifier of [
      'react',
      'react/jsx-runtime',
      '@gisik-nokma/ui',
      '@gisik-nokma/domain',
      '@gisik-nokma/rule-engine',
      '../data-source.js',
      './rollup-text.js',
    ]) {
      expect(ALLOWED_IMPORTS.test(specifier), `${specifier} must be allowed`).toBe(true);
    }
    for (const specifier of [
      'react-router-dom',
      'reactive-http-transport',
      '@gisik-nokma/uix-evil',
      '@gisik-nokma/domain-hax',
      'axios',
      'https://evil.example/x.js',
    ]) {
      expect(ALLOWED_IMPORTS.test(specifier), `${specifier} must be refused`).toBe(false);
    }
  });

  it('PLANTED DEFECT: the file walk descends into subdirectories', () => {
    // Uses the real tree rather than a written fixture: `src/` holds no `.tsx`
    // of its own and `src/views/board.tsx` is reachable only by descending, so
    // the flat walk below is this assertion's own positive control — it shows
    // exactly what the recursion adds.
    const parent = join(VIEWS_DIRECTORY, '..');
    const flat = readdirSync(parent).map((entry) => String(entry));
    expect(viewFiles(parent)).toContain(`views${sep}board.tsx`);
    // The control is the same directory walked flat: it cannot see the file
    // the recursive walk finds. Stated as "does not contain THIS file" rather
    // than "contains no .tsx at all", which would start failing the day a
    // legitimate `.tsx` lands directly in `src/` — for a reason having nothing
    // to do with recursion.
    expect(flat).not.toContain(`views${sep}board.tsx`);
    expect(flat).not.toContain('board.tsx');
  });
});

describe('views never speak HTTP — the DataSource is the only seam (amendment 10)', () => {
  const files = viewFiles(VIEWS_DIRECTORY);

  it('has views to scan at all', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('PLANTED DEFECT: no view module calls a network API directly', () => {
    const hits = files.flatMap((name) =>
      networkTells(readFileSync(join(VIEWS_DIRECTORY, name), 'utf8')).map((tell) => `${name}: ${tell}`),
    );
    expect(hits, `network calls inside views:\n${hits.join('\n')}`).toEqual([]);
  });

  it('PLANTED DEFECT: no view module imports anything but react, the shared packages and its own', () => {
    const hits = files.flatMap((name) =>
      importsOf(readFileSync(join(VIEWS_DIRECTORY, name), 'utf8'))
        .filter((specifier) => !ALLOWED_IMPORTS.test(specifier))
        .map((specifier) => `${name}: ${specifier}`),
    );
    expect(hits, `forbidden imports inside views:\n${hits.join('\n')}`).toEqual([]);
  });
});

/**
 * A SANCTIONED MOCKED-CONTRACT SEAM. `createFakeDataSource` stands in for the
 * `DataSource` these hooks consume; it is NOT the contract. The real online
 * source is Plan 6 Task 7 (typed reads + `POST /v1/events`), its socket half
 * is Plan 6 Task 8 (`/v1/stream`, `subscribe`), and the offline replica
 * answering the same signatures is Plan 10. Until those land, the debounce
 * and the refetch proved below are real and the transport under them is not.
 */
const STREAM_EVENT_ID = '01J9GEVT000000000000000002';
const STREAM_ACTOR_ID = '01J9GACT000000000000000000';

describe('useBoard — loads, then refetches on stream frames', () => {
  function Harness({ source }: { source: ReturnType<typeof createFakeDataSource> }) {
    const { data } = useBoard(source, WS, 'prj_1');
    return <div>{data === null ? 'loading' : `groups:${data.groups.length}`}</div>;
  }

  it('the ids this suite puts on a typed EventEnvelope are ULID-shaped, per the domain', () => {
    // seed.ts's actor ids are deliberately non-ULID where nothing validates
    // them. An EventEnvelope is a different thing: it is the shape the ledger
    // door parses, so the ids on one are checked by the domain's own
    // predicate rather than by a regex written here.
    expect(isUlid(STREAM_EVENT_ID)).toBe(true);
    expect(isUlid(STREAM_ACTOR_ID)).toBe(true);
    expect(isUlid(WS)).toBe(true);
    expect(isUlid(TICKET)).toBe(true);
  });

  it('renders the loaded board and reloads after an event frame', async () => {
    vi.useFakeTimers();
    try {
      let groups = 0;
      const source = createFakeDataSource({
        getBoard: async () => ({
          projectId: 'prj_1',
          groups: Array.from({ length: ++groups }, () => errandGroup()),
        }),
      });
      render(<Harness source={source} />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(screen.getByText('groups:1')).toBeInTheDocument();
      act(() => {
        source.pushStreamItem({ type: 'caught-up', workspaceId: WS, seq: 1 });
        source.pushStreamItem({
          type: 'event',
          envelope: {
            id: STREAM_EVENT_ID,
            workspaceId: WS,
            entity: { kind: 'ticket', id: TICKET },
            type: 'ticket.assigned',
            version: 1,
            payload: { assigneeId: null },
            actorId: STREAM_ACTOR_ID,
            origin: 'web',
            clientTime: '2026-08-19T09:59:00.000Z',
            serverTime: '2026-08-19T10:00:00.000Z',
            seq: 2,
            // The workspace stream position, required since Plan 6 Task 8 widened
            // `ServerStreamFrame`'s event member from `EventEnvelope` to `LedgerEvent`.
            // `seq` above is the per-entity counter; these are different numbers on
            // purpose, so nothing here can pass by confusing the two.
            workspaceSeq: 9,
          },
        });
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      // ADAPTATION, not preference. The plan closes with
      // `await waitFor(() => …)`, and RTL's waitFor detects only JEST fake
      // timers (`typeof jest !== 'undefined' && setTimeout._isMockFunction`).
      // Under `vi.useFakeTimers()` it polls on a REAL interval the faked
      // clock never fires and hangs to the test timeout even when the
      // assertion is already true — verified by awaiting waitFor on a static
      // <div>. The `runAllTimersAsync` inside `act` above has already flushed
      // both the debounce and the reload promise.
      expect(screen.getByText('groups:2')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * F2, and the reason it needed a test rather than a mutation. `useBoard`
 * shipped keyed on nothing: `reload` was `useCallback(…, [])` and the only
 * effect's deps were `[source, workspaceId, debounceMs, reload]`, none of
 * which move when `projectId` does. Pointing the Board at another project left
 * the previous project's columns on screen AS the current project's,
 * self-correcting only if an unrelated stream frame happened to arrive. No
 * test varied `projectId`, so there was nothing to mutate — an UNCONSTRAINED
 * PATH, and these three are the constraints.
 */
describe('useBoard — a project switch is a different question, and it gets asked', () => {
  function Switcher({
    source,
    projectId,
  }: {
    source: ReturnType<typeof createFakeDataSource>;
    projectId: string;
  }) {
    const { data } = useBoard(source, WS, projectId);
    return <div>{data === null ? 'loading' : `board:${data.projectId}`}</div>;
  }

  it('PLANTED DEFECT: a changed projectId refetches, and the old project never renders as the new one', async () => {
    vi.useFakeTimers();
    try {
      const asked: string[] = [];
      const source = createFakeDataSource({
        getBoard: async (projectId: string) => {
          asked.push(projectId);
          return { projectId, groups: [errandGroup()] };
        },
      });
      const view = render(<Switcher source={source} projectId="prj_A" />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(asked).toEqual(['prj_A']);
      expect(screen.getByText('board:prj_A')).toBeInTheDocument();

      view.rerender(<Switcher source={source} projectId="prj_B" />);
      // Asserted BEFORE the flush, and that placement is the whole test.
      // `setData(null)` on key change is the half of the fix that bounds the
      // wrong-project window to the switch itself — and after the flush the new
      // answer has already overwritten the old one, so a check placed there
      // passes with the clear deleted. It did: mutation M-A removed both clear
      // lines and all 128 tests stayed green. RTL's `rerender` is act-wrapped,
      // so passive effects have run when it returns while `getBoard`'s promise
      // continuation, a microtask, cannot have.
      expect(screen.queryByText('board:prj_A')).not.toBeInTheDocument();
      expect(screen.getByText('loading')).toBeInTheDocument();
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(asked).toEqual(['prj_A', 'prj_B']);
      expect(screen.getByText('board:prj_B')).toBeInTheDocument();
      expect(screen.queryByText('board:prj_A')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('PLANTED DEFECT: the switch does not re-open the stream — the subscription is keyed on the workspace', async () => {
    vi.useFakeTimers();
    try {
      const source = createFakeDataSource({
        getBoard: async (projectId: string) => ({ projectId, groups: [] }),
      });
      const view = render(<Switcher source={source} projectId="prj_A" />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      view.rerender(<Switcher source={source} projectId="prj_B" />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      // The cheap fix for the test above is to put `load` in the subscription
      // effect's deps. It works, and it resubscribes on every project switch —
      // and `subscribe` is called with cursor 0, so each re-open replays the
      // whole workspace from the start. That hardcoded cursor is Plan 6 Task
      // 8's to fix; this assertion is what stops this hook multiplying it.
      expect(source.subscriptions).toEqual([{ workspaceId: WS, afterSeq: 0 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PLANTED DEFECT: an answer arriving for the project we left is dropped, not rendered', async () => {
    const resolvers = new Map<string, (board: BoardView) => void>();
    const source = createFakeDataSource({
      getBoard: (projectId: string) =>
        new Promise<BoardView>((resolve) => {
          resolvers.set(projectId, resolve);
        }),
    });
    const view = render(<Switcher source={source} projectId="prj_A" />);
    view.rerender(<Switcher source={source} projectId="prj_B" />);
    expect([...resolvers.keys()]).toEqual(['prj_A', 'prj_B']);

    await act(async () => {
      resolvers.get('prj_B')?.({ projectId: 'prj_B', groups: [] });
    });
    expect(screen.getByText('board:prj_B')).toBeInTheDocument();

    // prj_A's load was issued for a question nobody is showing any more.
    // Rendering its answer would put project A's board under project B's
    // heading — the same dishonesty the missing refetch caused, arriving by
    // the other road. This guards the KEY only: two loads for the SAME key
    // still resolve last-one-wins (F6, owner Plan 6 Task 7/8).
    await act(async () => {
      resolvers.get('prj_A')?.({ projectId: 'prj_A', groups: [] });
    });
    expect(screen.getByText('board:prj_B')).toBeInTheDocument();
    expect(screen.queryByText('board:prj_A')).not.toBeInTheDocument();
  });
});

/**
 * Plan 6 Task 15b, item 4. Cases 3.112–3.114
 * (`test-cases/03-foundation-ledger.md`). 3.114's second `it` is AMENDED
 * 2026-09-16 by board-prototype-port Task 7 (Ruling R6) — see that test's own
 * comment for what changed and why. Cases 13.465–13.467
 * (`test-cases/13-deployment-dogfooding.md`) cover Task 7's additions: the
 * per-column empty state, R6 itself, and Ruling 19 (13.467, the isNarrowed
 * fix found in Task 7's review).
 */
describe('3.112 an empty board says words, not nothing', () => {
  const emptyBoard: BoardView = { projectId: 'prj_1', groups: [] };

  /**
   * PLANTED DEFECT — the whole reason this branch exists.
   *
   * `mapBoardView` folds the server's flat `columns` array into groups, so a
   * `columns: []` response yields `groups: []`. That response is ORDINARY:
   * `routes/board.ts`'s gate docblock records that a workspace member who is
   * not on a project-mode project passes the door and gets 200 with an empty
   * board. Before this branch, `board.groups.map` over `[]` rendered an empty
   * `<div class="gn-board">` — loaded, refused nothing, said nothing, and
   * indistinguishable from a board still painting.
   */
  /* 13.303 — the empty board's pinned copy. The literal is asserted BESIDE its
   * use, so a re-export of a different string cannot satisfy the render
   * assertion; `queryAllByRole('region')` empty keeps it off scaffolding. */
  it('renders the pinned copy where it used to render an empty div', () => {
    // WIRED (V1, 2026-09-21): the pinned copy INSTRUCTS — "create one" — and
    // since the ruling it renders only where a create handler exists, so this
    // case hands one down. The unwired arm has its own case below (3.113).
    render(<Board board={emptyBoard} onOpenTicket={() => {}} onCreateTicket={() => {}} />);
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
    expect(EMPTY_BOARD_COPY).toBe('No tickets here yet — create one.');
    // No scaffolding: not one column region is drawn for a board with no groups.
    expect(screen.queryAllByRole('region')).toEqual([]);
  });

  /**
   * 3.113 BOTH ARMS of the optional affordance, because a wrapper that always
   * passed `onCreateTicket` would make the no-handler arm a HARNESS vacuity —
   * the default under test supplied by the harness testing it.
   */
  it('3.113 offers the create affordance when the shell handed one down', async () => {
    const clicks: number[] = [];
    render(
      <Board board={emptyBoard} onOpenTicket={() => {}} onCreateTicket={() => clicks.push(1)} />,
    );
    const button = screen.getByRole('button', { name: 'Create a ticket' });
    await userEvent.setup().click(button);
    expect(clicks).toEqual([1]);
  });

  it('3.113 says the situation and offers NO button when the shell handed none', () => {
    render(<Board board={emptyBoard} onOpenTicket={() => {}} />);
    // V1 (2026-09-21): the UNWIRED copy states the fact and instructs nothing.
    // The pinned sentence above tells the reader to create a ticket, and a mount
    // with no handler made that impossible from where it was read; the ruling's
    // remedy is that the words follow the control.
    expect(screen.getByText(EMPTY_BOARD_UNWIRED_COPY)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_BOARD_COPY)).toBeNull();
    // A no-op button here would look like a way out of an empty project and
    // would not be one.
    expect(screen.queryByRole('button', { name: 'Create a ticket' })).toBeNull();
  });

  /**
   * 3.114 — the branch discriminates. A `return` placed above the group loop
   * unconditionally, or a condition on `columns` rather than `groups`, would
   * make every board empty; this is the control that catches it.
   */
  it('3.114 CONTROL — a board WITH groups renders columns and never the empty copy', () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    expect(screen.queryByText(EMPTY_BOARD_COPY)).toBeNull();
    expect(screen.getAllByRole('region')).toHaveLength(4);
  });

  /**
   * AMENDED 2026-09-16 (board-prototype-port Task 7, Ruling R6 — case 13.466
   * takes over this property with a richer, two-column fixture; this one
   * stays as R6's minimal single-column reproduction rather than being
   * deleted). Pre-R6 this asserted
   * ~~`expect(screen.queryByText(EMPTY_BOARD_COPY)).toBeNull()`~~ — true only
   * because the old gate was `board.groups.length === 0`, and this fixture
   * HAS a group. R6 widens the gate to `totalCards === 0` (`board.tsx`'s
   * `emptyBanner`), which this fixture also satisfies — its one column holds
   * no cards — so the sentence now renders ABOVE the rail instead of being
   * silently absent. What the title's original claim ("is NOT an empty
   * board") still gets right, UNCHANGED by R6: the columns keep rendering —
   * `getByRole('region', ...)` below is untouched and still passes. Only the
   * silence is gone.
   */
  it('3.114 a group whose columns are all empty says the pinned sentence too, since R6 — and still renders its columns', () => {
    const noCards: BoardView = {
      projectId: 'prj_1',
      groups: [
        {
          workflowId: 'wf-errand',
          workflowVersion: 1,
          workflowName: 'Errand',
          columns: [{ stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [] }],
        },
      ],
    };
    render(<Board board={noCards} onOpenTicket={() => {}} onCreateTicket={() => {}} />);
    // The columns ARE the workflow's states and rendering them is the
    // promise this file's first describe makes — unchanged by R6.
    expect(screen.getByRole('region', { name: 'To do' })).toBeInTheDocument();
    // R6: zero cards in total, even with a group present, says the sentence.
    // (Wired, since V1: this fixture's own subject is R6's gate, not the
    // handler's presence, which 3.113 owns.)
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
  });
});

/**
 * Board-prototype-port Task 7 (2026-09-16) — the per-column empty state
 * (spec Board `:354-399`) and Ruling R6 (the whole-board sentence widened to
 * gate on zero CARDS rather than zero groups; `board.tsx`'s `emptyBanner`).
 * Cases 13.465 (per-column empty state) and 13.466 (R6) —
 * `test-cases/13-deployment-dogfooding.md`.
 */
describe('Board — the per-column empty state and Ruling R6 (Task 7)', () => {
  it('13.465 an empty column renders its own empty state; a column holding a card does not', () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    // errandBoard(): 'To do', 'Waiting on counterparty' and 'Done' hold no
    // cards; 'Doing' holds one (boardCardSeed()'s default) — three empty
    // states, not four, is the positive control this case's own name asks for.
    expect(screen.getAllByText(EMPTY_COLUMN_COPY)).toHaveLength(3);
    const doing = screen.getByRole('region', { name: 'Doing' });
    expect(within(doing).queryByText(EMPTY_COLUMN_COPY)).toBeNull();
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByText(EMPTY_COLUMN_COPY)).toBeInTheDocument();
  });

  it('13.465 offers "Add a ticket" only when the shell handed a create handler down, both arms', async () => {
    const user = userEvent.setup();
    const clicks: number[] = [];
    const { rerender } = render(
      <Board board={errandBoard()} onOpenTicket={() => {}} onCreateTicket={() => clicks.push(1)} />,
    );
    const todo = screen.getByRole('region', { name: 'To do' });
    await user.click(within(todo).getByRole('button', { name: 'Add a ticket' }));
    expect(clicks).toEqual([1]);

    rerender(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    const todoAgain = screen.getByRole('region', { name: 'To do' });
    expect(within(todoAgain).queryByRole('button', { name: 'Add a ticket' })).toBeNull();
    // The words stay even with no handler — a no-op button here would look
    // like a way out of an empty column and would not be one, the same
    // "control that lies" discipline `emptyBanner`'s own docblock already
    // holds itself to.
    expect(within(todoAgain).getByText(EMPTY_COLUMN_COPY)).toBeInTheDocument();
  });

  /**
   * THE R6 CASE ITSELF, 13.466 — the exact scenario the spec's own R6 section
   * names: "a project that has a workflow attached and zero tickets... skips
   * the pinned sentence entirely, and draws a rail of empty column trays."
   * No EXISTING assertion in this file could witness it before this task:
   * 3.112's fixture has zero GROUPS, not zero cards with a group present, and
   * that fixture passes on the pre-R6 gate exactly as it does on the new
   * one — see this task's own report for the reverted-condition mutation
   * that proves THIS test, and only this one plus the amended 3.114 above,
   * depend on the widened gate.
   */
  it('13.466 says something, and still shows the columns, when a workflow is attached but nothing is in it', () => {
    const board: BoardView = {
      projectId: 'p1',
      groups: [
        {
          workflowId: 'wf1',
          workflowVersion: 1,
          workflowName: 'Default',
          columns: [
            { stateId: 's1', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [] },
            { stateId: 's2', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
          ],
        },
      ],
    };
    render(<Board board={board} onOpenTicket={() => {}} onCreateTicket={() => {}} />);

    // The sentence: pre-R6 this case rendered NOTHING, because the branch
    // was gated on `groups.length === 0` and there is one group.
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
    // And the rail survives — it is the one place the workflow's states show.
    expect(screen.getByText('To do')).toBeInTheDocument();
    expect(screen.getByText('Doing')).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(2);
  });
});

/**
 * Starting-status design (2026-09-23) — the board's empty-column "Add a
 * ticket" is gated on `column.creatable`, not merely on `onCreateTicket`
 * being passed, and the handler is now called WITH that column's own
 * `{workflowId, stateId}` rather than unscoped. `errandGroup`'s own fixture
 * (above) already carries `creatable: true` on 'todo'/'doing'/'waiting' and
 * `creatable: false` on the terminal 'done' column — the same values a real
 * `isCreatableState` derivation would produce — so these cases exercise the
 * gate directly rather than inventing a parallel fixture.
 */
describe('Board — "Add a ticket" is gated on column.creatable (starting-status design, 2026-09-23)', () => {
  it('13.1431 a creatable empty column shows "Add a ticket", and the click passes the column\'s own selection', async () => {
    const user = userEvent.setup();
    const selections: Array<{ workflowId: string; stateId: string } | undefined> = [];
    render(
      <Board
        board={errandBoard()}
        onOpenTicket={() => {}}
        onCreateTicket={(selection) => selections.push(selection)}
      />,
    );
    const todo = screen.getByRole('region', { name: 'To do' });
    await user.click(within(todo).getByRole('button', { name: 'Add a ticket' }));
    expect(selections).toEqual([{ workflowId: 'wf-errand', stateId: 'todo' }]);
  });

  it('13.1432 a creatable:false empty column shows the copy only — no icon, no button — while its creatable sibling still shows the button (control)', () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} onCreateTicket={() => {}} />);
    const done = screen.getByRole('region', { name: 'Done' });
    expect(within(done).getByText(EMPTY_COLUMN_COPY)).toBeInTheDocument();
    expect(within(done).queryByRole('button', { name: 'Add a ticket' })).toBeNull();
    // The control, same render: 'To do' is empty too, `creatable: true`, and
    // still shows the button — so the absence above is `creatable`'s doing,
    // not a blanket regression of the empty-column action.
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByRole('button', { name: 'Add a ticket' })).toBeInTheDocument();
  });

  it('13.1433 the empty-board "Create a ticket" button calls onCreateTicket with NO argument — control, same render: a creatable empty column in the SAME board still calls it WITH its own selection', async () => {
    const user = userEvent.setup();
    const calls: Array<Array<{ workflowId: string; stateId: string } | undefined>> = [];
    // `errandBoard()` (this file's own fixture, above): one group, `totalCards
    // > 0` from `boardCardSeed()`'s default card in `doing` — NOT the fixture
    // for this case. Zero cards everywhere, so BOTH the whole-board banner
    // AND the 'To do' column's own empty state render on the SAME screen —
    // the case R6 names, and the one render that can hold both calls apart.
    const board = errandBoard([]);
    render(
      <Board
        board={board}
        onOpenTicket={() => {}}
        onCreateTicket={(...args) => calls.push(args)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Create a ticket' }));
    // NOT `[undefined]` — the handler is called with ZERO arguments, so a
    // regression that hands the click event through as `selection` (`onClick=
    // {onCreateTicket}`) shows as `calls[0]` holding a `MouseEvent`, and a
    // regression that passes `undefined` explicitly shows as length 1.
    expect(calls).toEqual([[]]);

    // CONTROL, same render, same `it`: the empty 'To do' column's OWN "Add a
    // ticket" — a DIFFERENT button, on the SAME screen — calls the SAME
    // handler WITH its column's own identity, so the assertion above is not
    // vacuously true of a handler that never receives an argument at all.
    calls.length = 0;
    const todo = screen.getByRole('region', { name: 'To do' });
    await user.click(within(todo).getByRole('button', { name: 'Add a ticket' }));
    expect(calls).toEqual([[{ workflowId: 'wf-errand', stateId: 'todo' }]]);
  });
});

/**
 * Board-prototype-port Task 7 fix, Ruling 19 (2026-09-16, found in review).
 * `page.tsx` hands `Board` an ALREADY-NARROWED view (`boardNarrowing.view`) —
 * cards dropped by the client-side board filter, never columns or groups.
 * R6's `totalCards` fold reads exactly those narrowed cards, so without a
 * signal distinguishing "genuinely zero tickets" from "a filter hid them
 * all", a search matching nothing renders `EMPTY_BOARD_COPY` — "create
 * one" — over a project that holds real tickets, contradicting the "N of M
 * shown" strip one row above it and pointing at the wrong remedy. `isNarrowed`
 * is the fix: `Board`'s own docblock on the prop carries the full account.
 * Case 13.467.
 */
describe('Board — Ruling 19: isNarrowed suppresses the pinned sentence when cards were filtered, not absent', () => {
  /**
   * The SAME fixture for both arms below, deliberately: two columns, neither
   * holding a card. On its own this is indistinguishable from R6's genuine
   * empty-workflow case (13.466) — nothing about the `BoardView` itself says
   * whether a filter did this. Only `isNarrowed` discriminates, so holding
   * the fixture constant while flipping only that flag is the direct proof
   * that the flag — and nothing else — is what changes the outcome.
   */
  const narrowedAwayBoard: BoardView = {
    projectId: 'prj_1',
    groups: [
      {
        workflowId: 'wf1',
        workflowVersion: 1,
        workflowName: 'Default',
        columns: [
          { stateId: 's1', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [] },
          { stateId: 's2', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
        ],
      },
    ],
  };

  it('13.467 a narrowed-to-zero board suppresses EMPTY_BOARD_COPY — the rail and per-column empty states still render', () => {
    render(<Board board={narrowedAwayBoard} onOpenTicket={() => {}} isNarrowed />);
    // The wrong-remedy sentence must NOT appear over a filtered board.
    expect(screen.queryByText(EMPTY_BOARD_COPY)).toBeNull();
    // The rail is untouched by `isNarrowed` — it is not the invariant this
    // prop protects, and the columns are still the one place a person can
    // clear their narrowing and look again.
    expect(screen.getByText('To do')).toBeInTheDocument();
    expect(screen.getByText('Doing')).toBeInTheDocument();
    // The per-column empty state is explicitly NOT changed by this ruling
    // (coordinator: "recorded and deferred... not overruling a considered
    // judgement mid-task") — both columns still carry it.
    expect(screen.getAllByText(EMPTY_COLUMN_COPY)).toHaveLength(2);
  });

  it('13.467 the IDENTICAL board, not narrowed, still says the R6 sentence — proving the flag is what discriminates', () => {
    // Wired (V1, 2026-09-21): this case is about `isNarrowed`, and the sentence
    // it discriminates on is `EMPTY_BOARD_COPY` — which since the ruling renders
    // only where a create handler was handed down. The unwired arm's own copy is
    // asserted by 3.113, so wiring here changes nothing this case is measuring.
    render(
      <Board
        board={narrowedAwayBoard}
        onOpenTicket={() => {}}
        onCreateTicket={() => {}}
        isNarrowed={false}
      />,
    );
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
  });

  it('13.467 CONTROL — omitting isNarrowed entirely behaves exactly like isNarrowed={false} (the default is "not narrowed")', () => {
    render(<Board board={narrowedAwayBoard} onOpenTicket={() => {}} onCreateTicket={() => {}} />);
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
  });
});

/**
 * 3.155/3.156 — the two `data-testid` hooks Plan 11 T13's E2E needs to
 * address one specific column or ticket among structurally identical
 * siblings, house style `field-${fieldId}` (disambiguation only — every
 * interaction still goes through role/accessible-name, never the testid
 * itself).
 */
describe('Board — entity-keyed data-testid hooks (Plan 11 T13)', () => {
  it('3.155 keys each column by its own stateId, one id per sibling', () => {
    render(<Board board={errandBoard()} onOpenTicket={() => {}} />);
    expect(screen.getByTestId('board-column-todo')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-doing')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-done')).toBeInTheDocument();
  });

  it('3.156 keys each card slot by its own ticketId, distinguishing two siblings', () => {
    const GST = boardCardSeed({ ticketId: '01J9GTKA000000000000000001', title: 'File the GST return' });
    const LICENCE = boardCardSeed({ ticketId: '01J9GTKA000000000000000002', title: 'Renew the trade licence' });
    render(<Board board={errandBoard([GST, LICENCE])} onOpenTicket={() => {}} />);
    const gstCard = screen.getByTestId('ticket-card-01J9GTKA000000000000000001');
    const licenceCard = screen.getByTestId('ticket-card-01J9GTKA000000000000000002');
    expect(gstCard).not.toBe(licenceCard);
    expect(within(gstCard).getByText('File the GST return')).toBeInTheDocument();
    expect(within(licenceCard).getByText('Renew the trade licence')).toBeInTheDocument();
  });
});

/**
 * 13.1177 — ruling E5-2 (`review-ux-exec5`). The Board drew NO due date at all:
 * `BoardCard` carried none while `TicketCard.dueDate` was already on every
 * card the board is projected from and `ListRow` read it, so a ticket a week
 * overdue was indistinguishable from an undated one on the project's DEFAULT
 * tab. The export draws the label in the card's meta line and colours it
 * `di.late ? "var(--danger)" : "var(--label2)"`. Both halves are asserted
 * here — plus the FOUR control arms the late tone needs, because a tone that
 * is always on and a tone that is never on both satisfy a one-armed
 * assertion:
 *
 *   - a FUTURE date draws the label in the ordinary tone;
 *   - a date due TODAY is not late (the comparison is `<`, not `<=`);
 *   - with NO `today` the label draws in the ordinary tone — the prop's own
 *     absence path, and the reason the tone is injected rather than read from
 *     a device clock;
 *   - a card claiming NO date draws no label at all, which is what stops the
 *     first case passing on a span that is simply always rendered.
 *
 * `formatDate` is the expectation rather than a literal because the label's
 * contract IS the product's one date formatter (`provenance.ts`) — the same
 * one the List's due cell renders through. A hard-coded `'14 Sep 2026'` would
 * pin the spelling and miss a formatter that changed under both views at once.
 */
describe('13.1177 the board card draws the due label, and the late tone (ruling E5-2)', () => {
  const TODAY = '2026-09-21';
  const DUE = '2026-09-14';

  const cardDue = (date: string) => boardCardSeed({ dueDate: { date, claim: claim() } });

  it('13.1177 draws a claimed due date in the card', () => {
    render(<Board board={errandBoard([cardDue(DUE)])} onOpenTicket={() => {}} today={TODAY} />);
    expect(screen.getByText(formatDate(DUE)).className).toContain('gn-board-card__due');
  });

  it('13.1177 a date that has passed carries the late tone', () => {
    render(<Board board={errandBoard([cardDue(DUE)])} onOpenTicket={() => {}} today={TODAY} />);
    expect(screen.getByText(formatDate(DUE)).className).toContain('gn-board-card__due--late');
  });

  it('13.1177 CONTROL — the same label for a FUTURE date is drawn without the late tone', () => {
    const future = '2026-09-30';
    render(<Board board={errandBoard([cardDue(future)])} onOpenTicket={() => {}} today={TODAY} />);
    const label = screen.getByText(formatDate(future));
    expect(label.className).toContain('gn-board-card__due');
    expect(label.className).not.toContain('--late');
  });

  it('13.1177 CONTROL — a ticket due TODAY is not late', () => {
    render(<Board board={errandBoard([cardDue(TODAY)])} onOpenTicket={() => {}} today={TODAY} />);
    const label = screen.getByText(formatDate(TODAY));
    expect(label.className).toContain('gn-board-card__due');
    expect(label.className).not.toContain('--late');
  });

  it('13.1177 CONTROL — with no today the label still draws, in the ordinary tone', () => {
    render(<Board board={errandBoard([cardDue(DUE)])} onOpenTicket={() => {}} />);
    const label = screen.getByText(formatDate(DUE));
    expect(label.className).toContain('gn-board-card__due');
    expect(label.className).not.toContain('--late');
  });

  it('13.1177 CONTROL — a card claiming no date draws no due label', () => {
    render(<Board board={errandBoard([boardCardSeed()])} onOpenTicket={() => {}} today={TODAY} />);
    const card = screen.getByTestId(`ticket-card-${TICKET}`);
    expect(card.querySelector('.gn-board-card__due')).toBeNull();
  });
});

/**
 * V1 (round-2 ruling, IMPORTANT, 2026-09-21) — the empty state's instruction and
 * its control are ONE decision.
 *
 * `EMPTY_BOARD_COPY` says *"No tickets here yet — create one."* and the button
 * beneath it renders only when `onCreateTicket` is passed. **Every mount in the
 * product passed nothing** — measured at the ruling: `grep -rn 'onCreateTicket='
 * apps/web/app apps/web/src` answered 0 across 63 files while the string appears
 * 18 times in `board.tsx` — so the sentence told the reader to do something the
 * mount made impossible, and the column's `+` glyph painted with nothing behind
 * it.
 *
 * The fix has two halves and this case pins both: the WORDS follow the control
 * (an unwired board states the situation instead of instructing), and the `+`
 * glyph is never drawn unaccompanied. The shell's own half — the project page
 * lifting `CreateTicketFlow`'s open state and passing a real handler — is
 * asserted where that mount lives (`apps/web/test/project-create-gate.test.tsx`).
 */
describe('V1 the empty board never instructs an action it cannot offer', () => {
  const emptyBoard: BoardView = { projectId: 'prj_1', groups: [] };

  it('13.1162 unwired: states the situation, offers no button, draws no + glyph', () => {
    render(<Board board={emptyBoard} onOpenTicket={() => {}} />);
    expect(screen.getByText(EMPTY_BOARD_UNWIRED_COPY)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_BOARD_COPY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create a ticket' })).toBeNull();
    // The glyph is the one part of an empty column that reads as a control.
    expect(document.querySelector('.gn-board__column-empty-icon')).toBeNull();
  });

  it('13.1162 wired: instructs, and the instruction has a control — on the board and in every empty column', () => {
    const clicks: number[] = [];
    const oneEmptyColumn: BoardView = {
      projectId: 'prj_1',
      groups: [
        {
          workflowId: 'wf-errand',
          workflowVersion: 1,
          workflowName: 'Errand',
          columns: [
            { stateId: 's1', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [] },
          ],
        },
      ],
    };
    render(
      <Board
        board={oneEmptyColumn}
        onOpenTicket={() => {}}
        onCreateTicket={() => clicks.push(1)}
      />,
    );
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
    // Both affordances: the banner's, and the empty COLUMN's own "Add a ticket".
    expect(screen.getByRole('button', { name: 'Create a ticket' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a ticket' })).toBeInTheDocument();
    // And the glyph accompanies the control rather than replacing one.
    expect(document.querySelector('.gn-board__column-empty-icon')).not.toBeNull();
  });
});

/**
 * 13.1237-13.1238 — the priority badge (spec 2026-09-22).
 *
 * A small `P1`/`P2`/`P3` on the card's meta line, `title` attributed like the
 * due label's, with `--p1` taking the danger tone. **P2 is the DEFAULT and is
 * still DRAWN** — the value is a fact on every card, and a card without one is
 * not a state this product has — so there is no absence arm to test and the
 * `13.1238` case is the control that says so.
 */
describe('13.1237 the board card draws the priority badge; P1 carries the danger tone', () => {
  const cardAt = (value: 'P1' | 'P2' | 'P3', ticketId: string) =>
    boardCardSeed({ ticketId, priority: { value, claim: claim({ actorName: 'Kiro' }) } });

  it('13.1237 P1 is drawn in the danger tone, with the claimant as its title', () => {
    render(<Board board={errandBoard([cardAt('P1', 'p-one')])} onOpenTicket={() => {}} />);
    const badge = screen.getByText('P1');
    expect(badge.className).toContain('gn-board-card__priority');
    expect(badge.className).toContain('gn-board-card__priority--p1');
    // The attribution travels with the level, the same `'s claim` sentence the
    // due label and every sheet claim line uses — a badge with no claimant
    // would read as a fact the system established.
    expect(badge).toHaveAttribute('title', "Kiro's claim");
  });

  it('13.1238 CONTROL — P2 and P3 are drawn WITHOUT the tone, and the badge is on EVERY card', () => {
    render(
      <Board
        board={errandBoard([cardAt('P2', 'p-two'), cardAt('P3', 'p-three')])}
        onOpenTicket={() => {}}
      />,
    );
    expect(screen.getByText('P2').className).not.toContain('--p1');
    expect(screen.getByText('P3').className).not.toContain('--p1');
    // TWO badges for TWO cards — the positive half of "no absence arm", and the
    // assertion that stops the case passing on a board that drew one card.
    expect(screen.getAllByText(/^P[123]$/)).toHaveLength(2);
  });
});

/**
 * 13.1281 — the prototype's meta line (`desktop.dc.html:2496-2504`: `bits = [t.id, …,
 * dueLabel].join(" · ")`), with the KEY first (owner, 2026-09-22). The due half keeps
 * the product's one date formatter and its late tone (13.1177) — the prototype's
 * `Due 19 Oct` spelling is not transcribed, because a second date spelling on one
 * card is the drift ruling E5-2 closed. A `null` key (a workspace whose ledger holds
 * no prefix, or the offline replica) draws the due label alone: no dash, no
 * placeholder key.
 */
describe('13.1281 the board card meta line leads with the ticket key', () => {
  const DUE = '2026-10-19';
  it('13.1281 draws `KEY · <due>` in one meta line, key first', () => {
    render(<Board board={errandBoard([boardCardSeed({ key: 'GN-1101', dueDate: { date: DUE, claim: claim() } })])} onOpenTicket={() => {}} />);
    const key = screen.getByText('GN-1101');
    expect(key.className).toContain('gn-board-card__key');
    const line = key.closest<HTMLElement>('.gn-board-card__meta-line')!;
    expect(line.textContent).toBe(`GN-1101 · ${formatDate(DUE)}`);
    expect(within(line).getByText(formatDate(DUE)).className).toContain('gn-board-card__due');
  });
  it('13.1281 CONTROL — a null key draws the due label alone, with no separator', () => {
    render(<Board board={errandBoard([boardCardSeed({ key: null, dueDate: { date: DUE, claim: claim() } })])} onOpenTicket={() => {}} />);
    const line = screen.getByText(formatDate(DUE)).closest<HTMLElement>('.gn-board-card__meta-line')!;
    expect(line.textContent).toBe(formatDate(DUE));
    expect(line.querySelector('.gn-board-card__key')).toBeNull();
  });
  it('13.1281 CONTROL — a key with no due date draws the key alone', () => {
    render(<Board board={errandBoard([boardCardSeed({ key: 'GN-1102', dueDate: null })])} onOpenTicket={() => {}} />);
    expect(screen.getByText('GN-1102').closest('.gn-board-card__meta-line')!.textContent).toBe('GN-1102');
  });
});
