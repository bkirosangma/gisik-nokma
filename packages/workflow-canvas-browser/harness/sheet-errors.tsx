import { createRoot } from 'react-dom/client';
import {
  LinkedFromSection,
  TicketLinksSection,
  makeSubmittedFactory,
  type DataSource,
  type LiveQueryResult,
  type TicketLinkView,
} from '@gisik-nokma/app-core';
import { EMPTY_LINKED_FROM, type LinkedFromPage } from '@gisik-nokma/domain';
import { Sheet } from '@gisik-nokma/ui';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';
// The web app's stylesheet, as the running app loads it beside ui.css (`apps/web/app/layout.tsx`), and its refusal panel.
import '../../../apps/web/app/globals.css';
import { ShellRefusal } from '../../../apps/web/src/shell-refusal.js';

/*
 * Failed reads and writes in a real browser (kg-walk-fixes items 2 and 3, cases 27.077-27.078). Every failure carries the
 * transport's own string, `HttpError`'s `HTTP <status> for <path>` (`packages/app-core/src/online/http.ts`), for the
 * paths `online-data-source.ts` reads, so each sentence holds one unbroken run as long as the real one.
 * - `?view=sheet` (default): the REAL Links and Linked-from sections in the REAL ui `Sheet`, `?links=fail|empty` and
 *   `?refs=fail|none` (default `fail`), then the sheet's other failure sentences in their own classes (the History and
 *   Attachments tabs' read errors, the subtask row's withheld sentence, a write's transport refusal; markup as
 *   `ticket-sheet.tsx` renders it, the text by hand) and the visibility editor's unreached sentence.
 * - `?view=shell`: a page (`.gn-shell`) with the REAL `ShellRefusal`, the shared `.gn-refusal` panels (`--server` as the
 *   account sections draw a read error, `--transport` as the workflow rebind dialog draws a write's), and the Notes
 *   dialog's and scope popover's refusals, and the workflow builder's publish banner.
 * `?style=` and `?theme=` as the canvas harness; neo by default like the shell.
 */
const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.style = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const WS = '01J9GWS0000000000000000001';
const TICKET = '01J9GTKT000000000000000001';
const wire = (path: string) => `HTTP 503 for /v1/workspaces/${WS}${path}`;
const READ = (what: string, path: string) =>
  `${what} could not be read: ${wire(path)}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`;

function result<T>(data: T | null, error: string | null): LiveQueryResult<T> {
  return { data, error, settled: true, hasAnswered: data !== null, reload: () => undefined };
}
const links = params.get('links') === 'empty' ? result<TicketLinkView[]>([], null) : result<TicketLinkView[]>(null, wire(`/tickets/${TICKET}/links`));
const refs = params.get('refs') === 'none' ? result<LinkedFromPage>(null, null) : result<LinkedFromPage>(null, wire(`/references?target=ticket%3A${TICKET}`));
const TICKETS = [
  { ticketId: '01J9GTKT000000000000000133', projectId: 'p', key: 'CCSO-133', title: 'Chiller loses temperature overnight' },
  { ticketId: '01J9GTKT000000000000000134', projectId: 'p', key: 'CCSO-134', title: 'Restock the cold room shelf labels' },
];

const sheet = (
  <Sheet open title="Chiller door seal" onClose={() => undefined}>
    <TicketLinksSection
      dataSource={{} as DataSource}
      workspaceId={WS}
      ticketId={TICKET}
      canEdit
      make={makeSubmittedFactory({ actorId: 'user_harness', origin: 'web' })}
      links={links}
      queryTickets={async (q) => TICKETS.filter((t) => `${t.key} ${t.title}`.toLowerCase().includes(q.toLowerCase()))}
    />
    <LinkedFromSection page={refs} loadMore={async () => EMPTY_LINKED_FROM} hrefOf={() => null} nameOf={(id) => id} />
    {params.get('links') === 'empty' ? null : (
      <>
        <p className="gn-ticket-sheet__history-error">{READ("This ticket's history", `/tickets/${TICKET}/history`)}</p>
        <p className="gn-ticket-sheet__attachments-error">{READ("This ticket's attachments", `/tickets/${TICKET}/attachments`)}</p>
        <p className="gn-ticket-sheet__subtask-withheld">
          {`The workspace's ticket types could not be read, so a subtask cannot be added here. ${wire('/ticket-types')}`}
        </p>
        <p className="gn-ticket-sheet__refusal">{`We could not reach the server for this move: ${wire('/events')}`}</p>
        <div className="gn-visibility">
          <p className="gn-visibility__unreached">
            {`We could not reach the server for this change: ${wire('/events')}. Who can see this ticket is unchanged.`}
          </p>
        </div>
      </>
    )}
  </Sheet>
);

const shell = (
  <main className="gn-shell">
    <ShellRefusal what="The board" message={wire(`/projects/01J9GPRJ000000000000000001/board`)} />
    <p className="gn-refusal gn-refusal--server">{wire('/project-groups')}</p>
    <p className="gn-refusal gn-refusal--transport">{`We could not reach the server for this move: ${wire('/events')}`}</p>
    <p className="gn-notes__dialog-failure">{wire('/notes')}</p>
    <p className="gn-notes__scope-failure">{wire(`/notes/01J9GNOT000000000000000001/scope`)}</p>
    <div className="publish-controls__banner publish-controls__banner--transport">
      <p className="publish-controls__banner-title">This publish did not reach the server.</p>
      <p className="publish-controls__banner-reason">{`We could not reach the server for this publish: ${wire('/workflows/01J9GWFL000000000000000001/publish')}`}</p>
    </div>
  </main>
);

createRoot(document.getElementById('root')!).render(params.get('view') === 'shell' ? shell : sheet);
