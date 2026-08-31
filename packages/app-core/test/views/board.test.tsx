import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax`, and the repo already
// settled this at packages/ui/test/components.test.tsx. The plan's Task 9
// snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isUlid, type IngestResult } from '@gisik-nokma/domain';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { Board, useBoard } from '../../src/views/board.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
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
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, cards: [] },
      { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, cards: doingCards },
      { stateId: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true, cards: [] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, cards: [] },
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
            { stateId: 'todo', name: 'To do', category: 'open', blocked: false, cards: [GST, LICENCE, INVOICE] },
            { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, cards: [] },
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
            { stateId: 'todo', name: 'To do', category: 'open', blocked: false, cards: [GST] },
            { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, cards: [] },
          ],
        },
        {
          workflowId: 'wf-approval',
          workflowVersion: 1,
          workflowName: 'Approval',
          columns: [
            { stateId: 'review', name: 'In review', category: 'active', blocked: false, cards: [LICENCE] },
            { stateId: 'approved', name: 'Approved', category: 'terminal', blocked: false, cards: [INVOICE] },
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
