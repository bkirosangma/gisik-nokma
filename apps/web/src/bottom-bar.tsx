'use client';

import Link from 'next/link';
import { Sheet } from '@gisik-nokma/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BAR_DESTINATIONS,
  DEFAULT_BAR,
  MAX_SLOTS,
  readBottomBar,
  rememberBottomBar,
  resetBottomBar,
  type BarDestination,
} from '@gisik-nokma/app-core';
import { useInboxUnread } from './inbox-nav-link.js';
import { useKeyboardOpen } from './use-keyboard-open.js';
import {
  DEFAULT_PROJECT_TAB,
  PROJECT_TAB_CHANGED_EVENT,
  readProjectTab,
  rememberProjectTab,
  useLastProject,
  type ProjectTab,
} from './use-last-project.js';

/**
 * The phone bottom bar (mobile-web plan Task 3; spec P2–P4; cases 21.020–21.032).
 *
 * Four slots the person chose (default Board · My work · Notes · Inbox) and **More**, which is always
 * the fifth control and never a slot: what is not in the bar is in More, so editing the bar cannot
 * strand a destination. The choice lives per device and per user (`@gisik-nokma/app-core`'s
 * `bottom-bar.ts`).
 *
 * ## What each destination is
 *
 * The project's five views are NOT URLs (plan FD4): the page keeps its tab in state and remembers it
 * per project. So Board / List / Calendar / Timeline / Backlog are links to the last project that
 * `useLastProject` knows (`/w/<ws>/p/<project>`), and a click first writes the tab with
 * `rememberProjectTab`, which is what the page reads on arrival. With no project yet they go to the
 * workspace home, whose project grid is the way to pick one. My work and Members are plain routes.
 * Notes and Inbox are global.
 *
 * ## It does not offer a link that cannot resolve (plan FD5, case 21.027)
 *
 * `workspaceId` is `AppNav`'s EFFECTIVE workspace — `undefined` while the nav's own `noWorkspace`
 * holds, which includes a remembered id whose name never resolved. With none, the scoped slots are not
 * rendered, and the empty places are not padded: the bar is Notes, Inbox and More.
 *
 * ## Out of the way of the keyboard (Review Focus 3, `useKeyboardOpen`)
 *
 * `data-keyboard="open"` hides the bar (the stylesheet), so it can never cover a field being typed in.
 *
 * ## Sheets
 *
 * More and Edit are `Sheet`s portalled to `document.body`: the bar is `position: fixed`, and a sheet
 * that lived inside it would be clipped to the bar's own box by anything that creates a containing
 * block. One is open at a time — "Edit bottom bar" closes More as it opens.
 */

type Scope = 'tab' | 'workspace' | 'global';
type Destination = { id: BarDestination; label: string; scope: Scope; tab?: ProjectTab; icon: ReactNode };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="gn-bottom-bar__icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const DESTINATIONS: Record<BarDestination, Destination> = {
  board: { id: 'board', label: 'Board', scope: 'tab', tab: 'board', icon: <Icon><rect x="3.5" y="4" width="4.5" height="16" rx="1.2" /><rect x="9.75" y="4" width="4.5" height="10" rx="1.2" /><rect x="16" y="4" width="4.5" height="13" rx="1.2" /></Icon> },
  list: { id: 'list', label: 'List', scope: 'tab', tab: 'list', icon: <Icon><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20" /><circle cx="4.5" cy="6.5" r="0.9" /><circle cx="4.5" cy="12" r="0.9" /><circle cx="4.5" cy="17.5" r="0.9" /></Icon> },
  calendar: { id: 'calendar', label: 'Calendar', scope: 'tab', tab: 'calendar', icon: <Icon><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon> },
  timeline: { id: 'timeline', label: 'Timeline', scope: 'tab', tab: 'timeline', icon: <Icon><path d="M4 7h9M8 12h12M6 17h8" /></Icon> },
  backlog: { id: 'backlog', label: 'Backlog', scope: 'tab', tab: 'backlog', icon: <Icon><path d="M4 6h16M4 11h16M4 16h8" /><path d="M16 16h4M18 14v4" /></Icon> },
  'my-work': { id: 'my-work', label: 'My work', scope: 'workspace', icon: <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></Icon> },
  members: { id: 'members', label: 'Members', scope: 'workspace', icon: <Icon><circle cx="9" cy="9" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9.5" r="2.2" /><path d="M16.5 14.2c2.6 0 4 1.7 4 4.3" /></Icon> },
  notes: { id: 'notes', label: 'Notes', scope: 'global', icon: <Icon><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M14 3.5V8h5M9 12.5h7M9 16h7" /></Icon> },
  inbox: { id: 'inbox', label: 'Inbox', scope: 'global', icon: <Icon><path d="M3.5 13.5l2.4-7.2A1.5 1.5 0 0 1 7.3 5.2h9.4a1.5 1.5 0 0 1 1.4 1.1l2.4 7.2" /><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.2 2h-5.6l-1.2-2z" /></Icon> },
};

/** A tab written by the page (or a slot) is re-read here so the indicator follows without a navigation. */
function useProjectTab(projectId: string | undefined, userId: string): ProjectTab | null {
  const [tab, setTab] = useState<ProjectTab | null>(null);
  useEffect(() => {
    const read = (): void => setTab(projectId === undefined ? null : readProjectTab(projectId, userId));
    read();
    window.addEventListener(PROJECT_TAB_CHANGED_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(PROJECT_TAB_CHANGED_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [projectId, userId]);
  return tab;
}

export function BottomBar({
  workspaceId,
  projectId,
  userId,
  pathname,
}: {
  /** The nav's EFFECTIVE workspace: `undefined` when it has none that resolves (FD5). */
  workspaceId: string | undefined;
  /** The project in the route, if the route is a project's. */
  projectId: string | undefined;
  userId: string;
  pathname: string;
}) {
  // The default first, the remembered bar in an effect: the markup the server sent is what hydrates.
  const [slots, setSlots] = useState<BarDestination[]>([...DEFAULT_BAR]);
  useEffect(() => {
    setSlots(readBottomBar(userId));
  }, [userId]);

  const [sheet, setSheet] = useState<'none' | 'more' | 'edit'>('none');
  const keyboardOpen = useKeyboardOpen();
  const unread = useInboxUnread();
  const lastProject = useLastProject(workspaceId, projectId, userId);
  const targetProject = projectId ?? (lastProject.status === 'remembered' ? lastProject.projectId : undefined);
  const activeTab = useProjectTab(projectId, userId);

  const scoped = (id: BarDestination): boolean => DESTINATIONS[id].scope !== 'global';
  const resolvable = (id: BarDestination): boolean => !scoped(id) || workspaceId !== undefined;

  /** Where a destination goes, whether it is the page the person is on, and what a click records first. */
  function resolve(id: BarDestination): { href: string; current: boolean; onClick?: () => void } {
    const d = DESTINATIONS[id];
    if (d.scope === 'global') {
      const path = id === 'notes' ? '/notes' : '/inbox';
      return { href: path, current: id === 'notes' ? pathname === path || pathname.startsWith(`${path}/`) : pathname === path };
    }
    if (d.scope === 'workspace') {
      const href = `/w/${workspaceId}/${id}`;
      return { href, current: pathname === href };
    }
    const tab = d.tab as ProjectTab;
    if (targetProject === undefined) return { href: `/w/${workspaceId}`, current: false };
    const onProject = projectId !== undefined && pathname.startsWith(`/w/${workspaceId}/p/${projectId}`);
    return {
      href: `/w/${workspaceId}/p/${targetProject}`,
      current: onProject && (activeTab ?? DEFAULT_PROJECT_TAB) === tab,
      onClick: () => rememberProjectTab(targetProject, tab, userId),
    };
  }

  function commit(next: BarDestination[]): void {
    setSlots(next);
    rememberBottomBar(userId, next);
  }

  const visible = slots.filter(resolvable);
  const close = (): void => setSheet('none');

  return (
    <>
      <nav className="gn-bottom-bar" aria-label="Phone" data-keyboard={keyboardOpen ? 'open' : undefined}>
        {visible.map((id) => {
          const d = DESTINATIONS[id];
          const { href, current, onClick } = resolve(id);
          const dot = id === 'inbox' && unread > 0;
          return (
            <Link
              key={id}
              href={href}
              className="gn-bottom-bar__item"
              aria-current={current ? 'page' : undefined}
              aria-label={dot ? `Inbox, ${unread} unread notification${unread === 1 ? '' : 's'}` : undefined}
              onClick={onClick}
            >
              {d.icon}
              {dot ? <span className="gn-bottom-bar__dot" aria-hidden="true" /> : null}
              <span className="gn-bottom-bar__label">{d.label}</span>
              <span className="gn-bottom-bar__indicator" aria-hidden="true" />
            </Link>
          );
        })}
        <button type="button" className="gn-bottom-bar__item" aria-haspopup="dialog" aria-expanded={sheet === 'more'} onClick={() => setSheet('more')}>
          <Icon><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></Icon>
          <span className="gn-bottom-bar__label">More</span>
          <span className="gn-bottom-bar__indicator" aria-hidden="true" />
        </button>
      </nav>
      {sheet === 'more'
        ? createPortal(
            <Sheet open title="More" onClose={close}>
              <MoreBody
                slots={slots}
                workspaceId={workspaceId}
                resolvable={resolvable}
                resolve={resolve}
                onNavigate={close}
                onEdit={() => setSheet('edit')}
              />
            </Sheet>,
            document.body,
          )
        : null}
      {sheet === 'edit'
        ? createPortal(
            <Sheet open title="Edit bottom bar" onClose={close}>
              <EditBody
                slots={slots}
                onChange={commit}
                onReset={() => {
                  setSlots([...DEFAULT_BAR]);
                  resetBottomBar(userId);
                }}
              />
            </Sheet>,
            document.body,
          )
        : null}
    </>
  );
}

function MoreBody({
  slots,
  workspaceId,
  resolvable,
  resolve,
  onNavigate,
  onEdit,
}: {
  slots: readonly BarDestination[];
  workspaceId: string | undefined;
  resolvable: (id: BarDestination) => boolean;
  resolve: (id: BarDestination) => { href: string; current: boolean; onClick?: () => void };
  onNavigate: () => void;
  onEdit: () => void;
}) {
  // Exactly what the bar does not carry — and, like the bar, nothing that cannot resolve.
  const rest = BAR_DESTINATIONS.filter((id) => !slots.includes(id) && resolvable(id));
  return (
    <nav className="gn-bar-sheet" aria-label="More destinations">
      <ul className="gn-bar-sheet__list">
        {rest.map((id) => {
          const { href, current, onClick } = resolve(id);
          return (
            <li key={id}>
              <Link href={href} className="gn-bar-sheet__row" aria-current={current ? 'page' : undefined} onClick={() => { onClick?.(); onNavigate(); }}>
                {DESTINATIONS[id].icon}
                <span>{DESTINATIONS[id].label}</span>
              </Link>
            </li>
          );
        })}
        {workspaceId !== undefined ? (
          <li>
            <Link href={`/settings?workspaceId=${workspaceId}`} className="gn-bar-sheet__row" onClick={onNavigate}>
              <span>Settings</span>
            </Link>
          </li>
        ) : null}
        <li>
          <Link href="/account" className="gn-bar-sheet__row" onClick={onNavigate}>
            <span>Account</span>
          </Link>
        </li>
        <li>
          <Link href="/help" className="gn-bar-sheet__row" onClick={onNavigate}>
            <span>Help</span>
          </Link>
        </li>
      </ul>
      <button type="button" className="gn-bar-sheet__row gn-bar-sheet__row--edit" onClick={onEdit}>
        <span>Edit bottom bar</span>
      </button>
    </nav>
  );
}

function EditBody({
  slots,
  onChange,
  onReset,
}: {
  slots: readonly BarDestination[];
  onChange: (next: BarDestination[]) => void;
  onReset: () => void;
}) {
  const full = slots.length >= MAX_SLOTS;
  const available = BAR_DESTINATIONS.filter((id) => !slots.includes(id));
  const move = (index: number, by: -1 | 1): void => {
    const next = [...slots];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item as BarDestination);
    onChange(next);
  };
  return (
    <div className="gn-bar-sheet">
      <section>
        <h3 className="gn-bar-sheet__heading">In the bar</h3>
        {slots.length === 0 ? <p className="gn-bar-sheet__note">Nothing here — the bar shows only More.</p> : null}
        <ul className="gn-bar-sheet__list">
          {slots.map((id, index) => {
            const label = DESTINATIONS[id].label;
            return (
              <li key={id} className="gn-bar-sheet__edit-row">
                <span className="gn-bar-sheet__edit-label">{DESTINATIONS[id].icon}{label}</span>
                <button type="button" className="gn-bar-sheet__tool" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button type="button" className="gn-bar-sheet__tool" aria-label={`Move ${label} down`} disabled={index === slots.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button type="button" className="gn-bar-sheet__tool" aria-label={`Remove ${label}`} onClick={() => onChange(slots.filter((slot) => slot !== id))}>−</button>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="gn-bar-sheet__heading">Available{full ? ' — the bar is full' : ''}</h3>
        <ul className="gn-bar-sheet__list">
          {available.map((id) => (
            <li key={id} className="gn-bar-sheet__edit-row">
              <span className="gn-bar-sheet__edit-label">{DESTINATIONS[id].icon}{DESTINATIONS[id].label}</span>
              <button type="button" className="gn-bar-sheet__tool" aria-label={`Add ${DESTINATIONS[id].label}`} disabled={full} onClick={() => onChange([...slots, id])}>+</button>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="gn-bar-sheet__row gn-bar-sheet__row--edit" onClick={onReset}>
        <span>Reset to default</span>
      </button>
    </div>
  );
}
