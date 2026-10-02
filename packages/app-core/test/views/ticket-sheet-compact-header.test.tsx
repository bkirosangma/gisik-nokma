import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import {
  COMPACT_RANGE_MAX,
  COMPACT_RANGE_MIN,
  easeProgress,
  planCompactLine,
  progressFor,
  rangeFor,
} from '../../src/views/sheet-header-compact.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PARENT, TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

/**
 * 25.420–25.431 and 25.435 — G-8: the phone ticket-sheet header compacts with the scroll by TRANSFORMING the same
 * elements (`sheet-header-compact.ts`).
 *
 * jsdom lays nothing out, so the phone is a stubbed `matchMedia`, the scroller's `scrollTop` is a plain
 * writable property, `requestAnimationFrame` is awaited a frame at a time, and the geometry the hook measures is a
 * stubbed `getBoundingClientRect` (7px a character for a crumb part, 390 for the header). What these cases
 * hold is the MODE and the MARKUP — `data-compact`, `--p`, `inert`, the "…" button, the overlays. The painted
 * result (no jitter, the three frames, desktop unchanged) is the browser spec
 * `apps/web/e2e-stack/sheet-header-compact.spec.ts` (25.431–25.433, 25.436, 25.437).
 */

const PHONE = '(max-width: 40rem)';

function stubMedia(opts: { phone: boolean; reduced?: boolean }): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE ? opts.phone : query.includes('reduce') ? opts.reduced === true : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const realRect = Element.prototype.getBoundingClientRect;
function stubGeometry(): void {
  Element.prototype.getBoundingClientRect = function rect(this: Element): DOMRect {
    let width = 0;
    if (this.classList.contains('gn-sheet__header')) width = 390;
    else if (this.parentElement?.classList.contains('gn-ticket-sheet__crumbs')) {
      // A crumb part is 7px a character; the fold button (and an ancestor button) stands for 10px of padding a span does not have.
      width = (this.textContent ?? '').length * 7 + (this.tagName === 'BUTTON' ? 10 : 0);
    }
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0, width, height: width > 0 ? 18 : 0, toJSON: () => ({}) } as DOMRect;
  };
}

function ticketRead(): TicketRead {
  return {
    ticket: ticketStateSeed({
      fields: {
        title: {
          value: 'File the GST return',
          actorId: 'user_kiro',
          clientTime: '2026-08-18T07:59:00.000Z',
          serverTime: '2026-08-18T08:00:00.000Z',
        },
      },
    }),
    title: 'File the GST return',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: { kind: 'ticket', id: PARENT, title: 'Registrations' },
    rollup: null,
    key: 'CCSO-1183',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  };
}

function renderSheet(projectName: string, onClose = vi.fn()) {
  const read = ticketRead();
  const source = createFakeDataSource({
    getTicket: async () => read,
    getWorkflowDef: async () => WF_ERRAND,
    getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
    getTicketHistory: async () => [],
    getTickets: async (projectId) => ({ projectId, rows: [] }),
    getTicketTypes: async () => [
      { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] },
    ],
  });
  render(
    <TicketSheet
      dataSource={source}
      workspaceId={WS}
      ticketId={TICKET}
      currentUserId="user_kiro"
      onClose={onClose}
      workspaceName="Corner"
      projectName={projectName}
    />,
  );
  return onClose;
}

async function settled(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Ticket title')).toHaveValue('File the GST return'), {
    timeout: 4_000,
  });
}

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.gn-sheet')!;
const body = (): HTMLElement => document.querySelector<HTMLElement>('.gn-sheet__body')!;
const moveButton = (): HTMLElement => screen.getByRole('button', { name: 'Move this ticket' });

/** A writable `scrollTop` on the scroller, and a scroll event over it. */
async function scrollTo(top: number): Promise<void> {
  const el = body();
  Object.defineProperty(el, 'scrollTop', { value: top, configurable: true, writable: true });
  // The hook writes `--p` from a requestAnimationFrame: let one frame run.
  await act(async () => {
    fireEvent.scroll(el);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

beforeEach(() => {
  stubGeometry();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Element.prototype.getBoundingClientRect = realRect;
});

describe('the progress and the one-line plan (pure)', () => {
  it('25.420 p = clamp(scrollTop / range), eased, with no snapping; reduced motion is a step at one half', () => {
    expect(progressFor(0, 200, false)).toBe(0);
    expect(progressFor(200, 200, false)).toBe(1);
    expect(progressFor(900, 200, false)).toBe(1);
    expect(progressFor(-40, 200, false)).toBe(0);
    // Eased: strictly between, monotonic, and not the identity (smoothstep: 0.5 maps to 0.5, 0.25 to 0.15625).
    expect(progressFor(50, 200, false)).toBeCloseTo(easeProgress(0.25), 10);
    expect(progressFor(50, 200, false)).toBeLessThan(0.25);
    let previous = -1;
    for (let top = 0; top <= 200; top += 5) {
      const p = progressFor(top, 200, false);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
    // The control: reduced motion is only ever 0 or 1.
    expect(progressFor(99, 200, true)).toBe(0);
    expect(progressFor(100, 200, true)).toBe(1);
    // The range is the header's collapse span, bounded.
    expect(rangeFor(60, 52)).toBe(COMPACT_RANGE_MIN);
    expect(rangeFor(1000, 52)).toBe(COMPACT_RANGE_MAX);
    expect(rangeFor(200, 52)).toBe(148);
  });

  it('25.421 the line folds only when it does not fit: the middle narrows to "…", the first and last stay', () => {
    // workspace, ›, project, ›, key — widths of 40, 6, 60, 6, 70 with a gap of 6 fit in 300.
    const fits = planCompactLine([40, 6, 60, 6, 70], 6, 300);
    expect(fits.folded).toBe(false);
    expect(fits.widths).toEqual([40, 6, 60, 6, 70]);
    // Control: the same parts with a long project do not.
    const long = planCompactLine([40, 6, 420, 6, 70], 6, 300);
    expect(long.folded).toBe(true);
    expect(long.widths[0]).toBe(40);
    expect(long.widths[2]).toBe(14);
    expect(long.widths[4]).toBe(70);
    // With an epic and a parent the whole middle collapses; only the project keeps a "…".
    const many = planCompactLine([40, 6, 200, 6, 200, 6, 200, 6, 70], 6, 300);
    expect(many.folded).toBe(true);
    expect(many.widths).toEqual([40, 6, 14, 0, 0, 0, 0, 6, 70]);
    // Positions are sequential, collapsed parts take no room.
    expect(many.x[2]).toBe(40 + 6 + 6 + 6);
    expect(many.x[7]).toBe(many.x[2]! + 14 + 6);
  });
});

describe('the phone sheet', () => {
  it('25.422 at p = 0 the header is the full layout: nothing is folded, Move is live, no compact controls', async () => {
    stubMedia({ phone: true });
    renderSheet('Shop');
    await settled();
    expect(panel()).toHaveAttribute('data-compact', 'full');
    expect(panel().style.getPropertyValue('--p')).toBe('0');
    expect(moveButton()).not.toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Show the full breadcrumb' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show the full title' })).toBeNull();
    // The body reserves the header's FULL height once, by custom property (CSS turns it into padding).
    expect(panel().style.getPropertyValue('--gh-h0')).not.toBe('');
    expect(panel().style.getPropertyValue('--gh-h1')).not.toBe('');
    // F2 (G-8 FIX 1): `data-top` marks p = 0, where CSS lays every crumb out wrapped and whole; the first pixel of scroll takes it off
    // (the one-line nowrap form), and the top again puts it back. Mutants: never set; set while p > 0.
    expect(panel()).toHaveAttribute('data-top');
    await scrollTo(10);
    expect(Number(panel().style.getPropertyValue('--p'))).toBeGreaterThan(0);
    expect(panel()).not.toHaveAttribute('data-top');
    await scrollTo(0);
    expect(panel()).toHaveAttribute('data-top');
  });

  it('25.423 at p = 1 the header is compact: Move is inert, the small title is a button; back at the top, full again', async () => {
    stubMedia({ phone: true });
    renderSheet('Shop');
    await settled();
    await scrollTo(500);
    expect(panel()).toHaveAttribute('data-compact', 'compact');
    expect(panel().style.getPropertyValue('--p')).toBe('1');
    expect(panel()).toHaveAttribute('data-settled');
    expect(moveButton()).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Show the full title' })).toHaveAttribute('aria-expanded', 'false');
    // The ✕ stays: it is the same close button, still reachable.
    expect(screen.getByRole('button', { name: 'Close sheet' })).toBeInTheDocument();
    await scrollTo(0);
    expect(panel()).toHaveAttribute('data-compact', 'full');
    expect(panel().style.getPropertyValue('--p')).toBe('0');
    expect(panel()).not.toHaveAttribute('data-settled');
    expect(moveButton()).not.toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Show the full title' })).toBeNull();
  });

  it('25.424 the "…" button exists only when the line does not fit (a short and a long project name)', async () => {
    stubMedia({ phone: true });
    renderSheet('Shop');
    await settled();
    await scrollTo(500);
    expect(screen.queryByRole('button', { name: 'Show the full breadcrumb' })).toBeNull();
    cleanup();

    renderSheet('A project with a name long enough that the whole line cannot fit on a phone at all');
    await settled();
    // Not folded while the header is full.
    expect(screen.queryByRole('button', { name: 'Show the full breadcrumb' })).toBeNull();
    await scrollTo(500);
    const fold = screen.getByRole('button', { name: 'Show the full breadcrumb' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    // The nav is still a landmark and still holds the workspace and the key.
    const nav = screen.getByRole('navigation', { name: 'Ticket location' });
    expect(nav).toContainElement(screen.getByTestId('sheet-crumb-workspace'));
    expect(nav).toContainElement(screen.getByTestId('sheet-crumb-ticket'));

    // F3 (G-8 FIX 1): the fold button renders the lone "…" glyph (CSS shows it, and hides the name, once the header has settled at p = 1);
    // its accessible name stays "Show the full breadcrumb", and the glyph is not read out twice.
    const dots = fold.querySelector('.gn-ticket-sheet__fold-dots');
    expect(dots).toHaveTextContent('…');
    expect(dots).toHaveAttribute('aria-hidden', 'true');
    expect(fold.querySelector('.gn-ticket-sheet__fold-label')).toHaveTextContent('A project with a name long enough');

    // G10 (mutant: the collapsed crumbs are never made inert): the folded-away crumbs (the parent and its separators) are out of the
    // tab order at compact; the control: they are focusable again at full.
    const collapsed = (): HTMLElement[] => Array.from(nav.querySelectorAll<HTMLElement>('[data-collapsed]'));
    expect(collapsed().length).toBeGreaterThan(0);
    for (const item of collapsed()) expect(item).toHaveAttribute('inert');
    // The kept crumbs (workspace, the "…", the key) are NOT inert.
    expect(fold).not.toHaveAttribute('inert');
    expect(screen.getByTestId('sheet-crumb-ticket')).not.toHaveAttribute('inert');
    // G15 (mutant: no re-measure when the mode flips): the project crumb became the fold button on the flip, and the measure ran AGAIN
    // against it (the stub gives a button 10px a span lacks): its natural width is the new element's.
    const name = 'A project with a name long enough that the whole line cannot fit on a phone at all';
    expect(screen.getByTestId('sheet-crumb-project').style.getPropertyValue('--gw0')).toBe(String(name.length * 7 + 10 + 7));
    await scrollTo(0);
    expect(panel()).toHaveAttribute('data-compact', 'full');
    for (const item of collapsed()) expect(item).not.toHaveAttribute('inert');
  });

  it('25.425 the breadcrumb overlay opens on "…" and collapses on an outside tap, Escape and any scroll, leaving scrollTop alone', async () => {
    stubMedia({ phone: true });
    const onClose = renderSheet('A project with a name long enough that the whole line cannot fit on a phone at all');
    await settled();
    await scrollTo(500);
    const overlay = (): HTMLElement | null => screen.queryByRole('group', { name: 'Full breadcrumb' });
    const open = (): void => {
      fireEvent.click(screen.getByRole('button', { name: 'Show the full breadcrumb' }));
    };

    open();
    expect(overlay()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show the full breadcrumb' })).toHaveAttribute('aria-expanded', 'true');
    // The overlay shows the whole path, the project by name.
    expect(overlay()).toHaveTextContent('A project with a name long enough');
    expect(body().scrollTop).toBe(500);

    // Outside tap.
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(overlay()).toBeNull());
    expect(body().scrollTop).toBe(500);

    // Escape: collapses the overlay and does NOT close the sheet; a second Escape (nothing open) does.
    open();
    expect(overlay()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(overlay()).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Any scroll.
    open();
    expect(overlay()).not.toBeNull();
    await scrollTo(510);
    await waitFor(() => expect(overlay()).toBeNull());

    // A tap inside the overlay keeps it; tapping "…" again toggles it shut.
    open();
    fireEvent.pointerDown(overlay()!);
    expect(overlay()).not.toBeNull();
    open();
    await waitFor(() => expect(overlay()).toBeNull());

    // G12 (mutant: back at the top an open overlay stays open): the scroll-close does not cover a mode flip that has no scroll event (a
    // re-measure after a title edit finds the scroller at the top). Open the overlay, put the scroller at 0 WITHOUT a scroll event,
    // then edit the title (a re-measure): the mode flips to full and the overlay closes. Control: before the edit it was open.
    open();
    expect(overlay()).not.toBeNull();
    Object.defineProperty(body(), 'scrollTop', { value: 0, configurable: true, writable: true });
    expect(overlay()).not.toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Ticket title'), { target: { value: 'File the GST return, now' } });
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(panel()).toHaveAttribute('data-compact', 'full');
    await waitFor(() => expect(overlay()).toBeNull());
  });

  it('25.426 only one overlay is open at a time, and the title overlay brings Move back beside the full title', async () => {
    stubMedia({ phone: true });
    renderSheet('A project with a name long enough that the whole line cannot fit on a phone at all');
    await settled();
    await scrollTo(500);
    const crumbs = (): HTMLElement | null => screen.queryByRole('group', { name: 'Full breadcrumb' });
    const title = (): HTMLElement | null => screen.queryByRole('group', { name: 'Full title' });

    fireEvent.click(screen.getByRole('button', { name: 'Show the full breadcrumb' }));
    expect(crumbs()).not.toBeNull();
    // Opening the title overlay replaces it (one state, not two).
    fireEvent.click(screen.getByRole('button', { name: 'Show the full title' }));
    expect(crumbs()).toBeNull();
    expect(title()).not.toBeNull();
    expect(title()).toHaveTextContent('File the GST return');
    expect(screen.getByRole('button', { name: 'Show the full title' })).toHaveAttribute('aria-expanded', 'true');

    // Move is the header's own button, now live (not inert), with the same name and the same action.
    expect(moveButton()).not.toHaveAttribute('inert');
    expect(panel()).toHaveAttribute('data-peek', 'title');
    fireEvent.click(moveButton());
    expect(await screen.findByRole('dialog', { name: /Move/ })).toBeInTheDocument();
  });

  it('25.427 collapsing the title overlay makes Move inert again', async () => {
    stubMedia({ phone: true });
    renderSheet('Shop');
    await settled();
    await scrollTo(500);
    expect(moveButton()).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Show the full title' }));
    expect(moveButton()).not.toHaveAttribute('inert');
    fireEvent.pointerDown(document.body);
    // Inert at once (the collapse is ~140 ms), and the overlay itself leaves afterwards.
    expect(moveButton()).toHaveAttribute('inert');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Full title' })).toBeNull());
    expect(panel()).not.toHaveAttribute('data-peek');
    expect(moveButton()).toHaveAttribute('inert');
  });

  it('25.435 a press on Move while the title overlay is open is not an outside tap: Move stays live and its click opens the dialog (G-8 FIX 1 F1; G14)', async () => {
    stubMedia({ phone: true });
    renderSheet('A project with a name long enough that the whole line cannot fit on a phone at all');
    await settled();
    await scrollTo(500);
    const titleGroup = (): HTMLElement | null => screen.queryByRole('group', { name: 'Full title' });

    fireEvent.click(screen.getByRole('button', { name: 'Show the full title' }));
    expect(titleGroup()).not.toBeNull();
    // A real finger or mouse sends pointerdown BEFORE click; jsdom's fireEvent.click alone does not (the gap that hid F1).
    fireEvent.pointerDown(moveButton());
    expect(moveButton()).not.toHaveAttribute('inert');
    expect(titleGroup()).not.toBeNull();
    expect(panel()).toHaveAttribute('data-peek-state', 'open');
    fireEvent.click(moveButton());
    const moveDialog = await screen.findByRole('dialog', { name: /Move/ });
    // The overlay stays open under the Move dialog, so it must not act on what happens INSIDE that dialog: a press in it is not an outside
    // tap (it would turn Move inert under the dialog, and focus would return to a dead button), and the first Escape goes to the dialog.
    fireEvent.pointerDown(moveDialog);
    expect(titleGroup()).not.toBeNull();
    expect(moveButton()).not.toHaveAttribute('inert');
    fireEvent.keyDown(moveDialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Move/ })).toBeNull());
    expect(titleGroup()).not.toBeNull();
    expect(moveButton()).not.toHaveAttribute('inert');
    expect(screen.getByRole('dialog', { name: 'File the GST return' })).toBeInTheDocument();
    cleanup();

    // The control, in the same it(): a press on the sheet body is an outside tap, and Move goes inert.
    // Mutant "the Move exemption removed" fails the first half; "no outside tap" fails this half.
    renderSheet('Shop');
    await settled();
    await scrollTo(500);
    fireEvent.click(screen.getByRole('button', { name: 'Show the full title' }));
    expect(moveButton()).not.toHaveAttribute('inert');
    fireEvent.pointerDown(body());
    expect(moveButton()).toHaveAttribute('inert');
    await waitFor(() => expect(titleGroup()).toBeNull());
    cleanup();

    // G14 (mutant: the "…" opener loses data-peek-opener): the outside-tap listener only exists while an overlay is open, so the opening
    // press is never seen by it; the press that matters is the SECOND one, which toggles the overlay shut. Without the marker its
    // pointerdown starts the close, and the click that follows finds a closing overlay and re-opens it.
    renderSheet('A project with a name long enough that the whole line cannot fit on a phone at all');
    await settled();
    await scrollTo(500);
    const fold = screen.getByRole('button', { name: 'Show the full breadcrumb' });
    fireEvent.pointerDown(fold);
    fireEvent.click(fold);
    expect(screen.queryByRole('group', { name: 'Full breadcrumb' })).not.toBeNull();
    expect(panel()).toHaveAttribute('data-peek-state', 'open');
    fireEvent.pointerDown(fold);
    fireEvent.click(fold);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Full breadcrumb' })).toBeNull());
    fireEvent.pointerDown(fold);
    fireEvent.click(fold);
    expect(screen.queryByRole('group', { name: 'Full breadcrumb' })).not.toBeNull();
    // And a pointerdown on Move while only the CRUMB overlay is open is still an outside tap (Move is exempt for the title overlay only).
    fireEvent.pointerDown(moveButton());
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Full breadcrumb' })).toBeNull());
  });

  it('25.428 reduced motion switches full and compact at one half, with no in-between value and no overlay transition', async () => {
    stubMedia({ phone: true, reduced: true });
    renderSheet('Shop');
    await settled();
    // The range in jsdom is the minimum (nothing is laid out), so the half-way point is half of it.
    const half = COMPACT_RANGE_MIN / 2;
    await scrollTo(half - 1);
    expect(panel().style.getPropertyValue('--p')).toBe('0');
    expect(panel()).toHaveAttribute('data-compact', 'full');
    await scrollTo(half);
    expect(panel().style.getPropertyValue('--p')).toBe('1');
    expect(panel()).toHaveAttribute('data-compact', 'compact');
    // Control: with motion allowed the same offset is in between.
    cleanup();
    stubMedia({ phone: true, reduced: false });
    renderSheet('Shop');
    await settled();
    await scrollTo(half - 1);
    const p = Number(panel().style.getPropertyValue('--p'));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    // Closing an overlay under reduced motion is immediate.
    cleanup();
    stubMedia({ phone: true, reduced: true });
    renderSheet('Shop');
    await settled();
    await scrollTo(500);
    fireEvent.click(screen.getByRole('button', { name: 'Show the full title' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group', { name: 'Full title' })).toBeNull();
  });

  it('25.429 the sheet keeps its accessible names at every p: the dialog is the title, the title field is labelled, the nav is a landmark', async () => {
    stubMedia({ phone: true });
    renderSheet('Shop');
    await settled();
    for (const top of [0, 30, 60, 90, 500]) {
      await scrollTo(top);
      expect(screen.getByRole('dialog', { name: 'File the GST return' })).toBeInTheDocument();
      expect(screen.getByLabelText('Ticket title')).toHaveValue('File the GST return');
      expect(screen.getByRole('navigation', { name: 'Ticket location' })).toBeInTheDocument();
    }
    // The compact controls are real buttons and focusable.
    const hit = screen.getByRole('button', { name: 'Show the full title' });
    hit.focus();
    expect(hit).toHaveFocus();
    const close = screen.getByRole('button', { name: 'Close sheet' });
    close.focus();
    expect(close).toHaveFocus();
  });
});

describe('the desktop control', () => {
  it('25.430 above 40rem nothing changes: no data-compact, no custom properties, no compact controls, Move not inert, scroll does nothing', async () => {
    stubMedia({ phone: false });
    renderSheet('A project with a name long enough that the whole line cannot fit on a phone at all');
    await settled();
    await scrollTo(500);
    expect(panel()).not.toHaveAttribute('data-compact');
    expect(panel().style.getPropertyValue('--p')).toBe('');
    expect(panel().style.getPropertyValue('--gh-h0')).toBe('');
    expect(moveButton()).not.toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Show the full breadcrumb' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show the full title' })).toBeNull();
    // The project crumb is still the link/span it always was, with its own testid.
    expect(screen.getByTestId('sheet-crumb-project').tagName).toBe('SPAN');
  });
});
