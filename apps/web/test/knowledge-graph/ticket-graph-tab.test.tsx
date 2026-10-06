import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentType } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphItemView } from '@gisik-nokma/domain';
import type { KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { Providers } from '../../src/providers.js';
import { stubServices } from '../helpers/stub-services.js';

/** Knowledge Graph view plan, Task 9 (KG-C T9): the ticket sheet's graph tab and its three hosts, cases 27.344 and 27.346. */
const h = vi.hoisted(() => ({ seen: [] as unknown[] }));
vi.mock('next/dynamic', async () => {
  const { createElement, lazy, Suspense } = await import('react');
  return {
    default: (load: () => Promise<ComponentType<object>>) => {
      const Lazy = lazy(() => load().then((component) => ({ default: component })));
      return (props: object) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
    },
  };
});
vi.mock('@gisik-nokma/knowledge-graph', () => ({
  KnowledgeGraph: (props: unknown) => {
    h.seen.push(props);
    return <div data-testid="kg-view" />;
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/w',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { GraphPanel } from '../../src/knowledge-graph/graph-panel.js';
import { TicketGraphTab } from '../../src/knowledge-graph/ticket-graph-tab.js';

const WEB = resolve(import.meta.dirname, '../..');
const WS = '01J9WSGISIKNOKMA0000000000';
const TICKET = '01J9TICKETCENTRE0000000000';
const last = (): KnowledgeGraphProps => h.seen.at(-1) as KnowledgeGraphProps;
const services = () => stubServices({ getMyWorkspaces: async () => [{ id: WS, name: 'Gisik Nokma', prefix: 'GN', role: 'member', archived: false, memberCount: null, nameRestrictedProjectCount: 0, projects: [] }] });

/**
 * The props of every `<TicketSheet` element in a source file, comments stripped: the text from the tag to the `>` or
 * `/>` that closes it at brace depth 0. Scoped to the element, so a comment naming the prop, or the prop on another
 * element, does not count.
 */
function ticketSheetElements(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  for (let at = code.indexOf('<TicketSheet'); at !== -1; at = code.indexOf('<TicketSheet', at + 1)) {
    if (/[A-Za-z]/.test(code[at + '<TicketSheet'.length] ?? '')) continue; // <TicketSheetProps …, not the element
    let depth = 0;
    let end = at;
    for (let i = at; i < code.length; i++) {
      const c = code[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        end = i;
        break;
      }
    }
    out.push(code.slice(at, end + 1));
  }
  return out;
}

const HOSTS = ['app/my-work/page.tsx', 'app/w/[workspaceId]/p/[projectId]/page.tsx', 'src/notes/note-document.tsx'];
const PROP = /(^|\s)knowledgeGraphSlot=\{TicketGraphTab\}(?=\s|\/?>)/;

beforeEach(() => {
  cleanup();
  h.seen.length = 0;
});

describe('the ticket sheet\'s Knowledge Graph tab (KG-C T9)', () => {
  it('27.344 all three ticket-sheet hosts pass knowledgeGraphSlot={TicketGraphTab} on their own <TicketSheet; control: the reader finds each element (its editorSlot), and a comment or another element naming the prop does not count', () => {
    for (const host of HOSTS) {
      const source = readFileSync(resolve(WEB, host), 'utf8');
      const elements = ticketSheetElements(source);
      expect(elements, host).toHaveLength(1);
      // CONTROL: the slice is the element's own props (its editor slot is in it), so the absence below could be seen.
      expect(elements[0], host).toMatch(/(^|\s)editorSlot=\{TicketEditorSlot\}/);
      expect(elements[0], host).toMatch(PROP);
      expect(source, host).toMatch(/^import \{ TicketGraphTab \} from '(\.\.\/)+(src\/)?knowledge-graph\/ticket-graph-tab\.js';$/m);
    }
    // CONTROL, same it: the reader is scoped to the element.
    const commented = "<TicketSheet\n  editorSlot={TicketEditorSlot}\n  /* knowledgeGraphSlot={TicketGraphTab} */\n  // knowledgeGraphSlot={TicketGraphTab}\n/>\n";
    expect(ticketSheetElements(commented)[0]).not.toMatch(PROP);
    const elsewhere = '<TicketSheet editorSlot={TicketEditorSlot} onClose={() => x > 1} />\n<Other knowledgeGraphSlot={TicketGraphTab} />';
    expect(ticketSheetElements(elsewhere)).toHaveLength(1);
    expect(ticketSheetElements(elsewhere)[0]).not.toMatch(PROP);
  });

  it('27.346 the tab centres the graph on its ticket, and an empty ticket\'s Add link returns the sheet to Details (onShowLinks); control: a ticket centre without onShowLinks, and a note centre, get no Add link', async () => {
    const onShowLinks = vi.fn();
    const onOpenTicket = vi.fn();
    render(
      <Providers services={services()}>
        <TicketGraphTab workspaceId={WS} ticketId={TICKET} onOpenTicket={onOpenTicket} onShowLinks={onShowLinks} />
      </Providers>,
    );
    await screen.findByTestId('kg-view');
    expect(last().centre).toBe(`ticket:${TICKET}`);
    expect(last().defaultWorkspaceIds).toEqual([WS]);
    const centre = { ref: `ticket:${TICKET}`, kind: 'ticket', id: TICKET } as GraphItemView;
    expect(last().onAddLink).toBeTypeOf('function');
    last().onAddLink!(centre);
    expect(onShowLinks).toHaveBeenCalledTimes(1);
    // The sheet's own opener reaches the graph's Open ticket.
    last().onOpen({ ...centre, id: 'OTHER' });
    expect(onOpenTicket).toHaveBeenCalledWith('OTHER');

    // CONTROL, same it: the note panel's shape (no onShowLinks) on a TICKET centre has no Add link, and on a note centre.
    cleanup();
    h.seen.length = 0;
    render(
      <Providers services={services()}>
        <GraphPanel centre={`ticket:${TICKET}`} workspaceId={WS} />
      </Providers>,
    );
    await screen.findByTestId('kg-view');
    expect(last().onAddLink).toBeUndefined();
    cleanup();
    h.seen.length = 0;
    render(
      <Providers services={services()}>
        <GraphPanel centre="note:01J9NOTE00000000000000000" workspaceId={WS} />
      </Providers>,
    );
    await screen.findByTestId('kg-view');
    expect(last().centre).toBe('note:01J9NOTE00000000000000000');
    expect(last().onAddLink).toBeUndefined();
  });
});
