import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent, TicketState, WorkflowDef } from '@gisik-nokma/domain';
import { NewTicketDialog, TicketSheet, type TicketRead } from '@gisik-nokma/app-core';
import { PHONE_TOOLBAR_QUERY, TicketEditorSlot } from '@gisik-nokma/editor';
import { parseRules, readUiCss, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { stubServices } from './helpers/stub-services.js';
import { PHONE, SELECT_WIDTH, pack, packingRules, px, readEditorCss, type PackingRules } from './helpers/toolbar-packing.js';
import { NewTicketDescriptionSlot } from '../src/new-ticket-description-slot.js';

/**
 * AUDIT BRD-08 (the editor toolbar in the ticket sheet and the new-ticket dialog at ≤466px): cases 21.233–21.238.
 *
 * #875 made `EditorToolbar` switch to the eight-tool phone bar on `matchMedia('(max-width: 40rem)')` with no host
 * prop, so BOTH hosts get it — but nothing rendered either host at phone width, and the 44px floors and the divider
 * drop lived only under `.gn-notes`. These cases mount the REAL sheet and the REAL dialog with the REAL composer.
 *
 * ⚠ jsdom has no layout: the width cases are the packing MODEL (`helpers/toolbar-packing.ts`), anchored to the
 * 21.137 browser measurement, and the painted half is the 🧪 case 21.238.
 */

// ProseMirror calls `Range#getClientRects` on every change and `elementFromPoint` on a click; jsdom has neither
// (`description-editable.test.tsx` records both). Zero geometry is the honest answer here — nothing below is a layout check.
const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ZERO_RECT as unknown as DOMRect;
}
if (!document.elementFromPoint) document.elementFromPoint = () => null;

const WS = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const TICKET = '01J9TICKET00000000000000000';
const USER = '01J9USER000000000000000000';
const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'doing', rules: [] }],
};
const stamp = { actorId: USER, clientTime: '2026-09-19T07:59:00.000Z', serverTime: '2026-09-19T08:00:00.000Z' };
const ticketState: TicketState = {
  kind: 'ticket', id: TICKET, workspaceId: WS, projectId: PROJECT, typeId: 'task', parentId: null,
  workflowId: WF.id, workflowVersion: WF.version, stateId: 'todo', stateCategory: 'open', assigneeId: null,
  collaboratorIds: [], fields: { title: { value: 'File the GST return', ...stamp } }, transitions: [], closed: null,
};
const ticketRead: TicketRead = {
  ticket: ticketState,
  title: 'File the GST return',
  stateProvenance: { actorId: USER, actorName: 'Anselma Marak', clientTime: stamp.clientTime, serverTime: stamp.serverTime },
  assignedProvenance: null,
  visibility: null,
  parent: { kind: 'ticket', id: PROJECT, title: 'Registrations' },
  rollup: null,
  key: null,
  epic: null,
};

function stubMatchMedia(phone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === PHONE_TOOLBAR_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** The three tools that only the tray holds on a phone (BRD-08's "unreachable by touch"), and what each inserts. */
const TRAY_TOOLS = [
  { name: 'Code block', node: 'pre' },
  { name: 'Collapsible', node: 'div[data-type="details"]' },
  { name: 'Horizontal rule', node: 'hr' },
] as const;
const ALL_SEVENTEEN = 17;

type Mounted = { host: HTMLElement; toolbar: HTMLElement };

/** The REAL sheet with the REAL composer — `description-editable.test.tsx`'s mount, at a chosen width. */
async function mountSheet(phone: boolean): Promise<Mounted & { unmount: () => void }> {
  stubMatchMedia(phone);
  const services = stubServices({
    getTicket: async () => ticketRead,
    getWorkflowDef: async () => WF,
    getTicketHistory: async () => [],
    getMembers: async () => [{ id: USER, name: 'Anselma Marak', role: 'owner' }],
  });
  services.dataSource.ingest = async (events: SubmittedEvent[]) =>
    events.map((event) => ({ status: 'committed' as const, eventId: event.id, seq: 1, serverTime: stamp.serverTime }));
  const view = render(
    <TicketSheet dataSource={services.dataSource} workspaceId={WS} ticketId={TICKET} currentUserId={USER} onClose={() => undefined} editorSlot={TicketEditorSlot} />,
  );
  const host = await screen.findByTestId('field-description');
  await waitFor(() => expect(host.querySelector('.ticket-editor .ProseMirror')).not.toBeNull());
  return { host, toolbar: host.querySelector('.ticket-editor__toolbar') as HTMLElement, unmount: view.unmount };
}

/** The REAL dialog with the web app's own description slot (`NewTicketDescriptionSlot`), at a chosen width. */
async function mountDialog(phone: boolean): Promise<Mounted & { unmount: () => void }> {
  stubMatchMedia(phone);
  const view = render(
    <NewTicketDialog
      workflowStates={() => null}
      open
      userId={USER}
      workspaceId={WS}
      assigneeCandidates={[]}
      typeOptions={[{ id: 'task', name: 'Task' }]}
      parentCandidates={[]}
      onCreate={vi.fn()}
      onClose={() => undefined}
      editorSlot={NewTicketDescriptionSlot}
    />,
  );
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog.querySelector('.ticket-editor .ProseMirror')).not.toBeNull());
  return { host: dialog, toolbar: dialog.querySelector('.ticket-editor__toolbar') as HTMLElement, unmount: view.unmount };
}

const barTools = (toolbar: HTMLElement): (string | null)[] =>
  [...toolbar.querySelectorAll<HTMLElement>(':scope > .ticket-editor__tool-group .ticket-editor__tool')].map((button) => button.getAttribute('aria-label'));
const toolNamed = (root: HTMLElement, name: string): HTMLButtonElement => {
  const found = root.querySelector<HTMLButtonElement>(`.ticket-editor__tool[aria-label="${name}"]`);
  if (found === null) throw new Error(`no toolbar control named ${name}`);
  return found;
};

afterEach(() => vi.unstubAllGlobals());

type Mounter = (phone: boolean) => Promise<Mounted & { unmount: () => void }>;

/** One host's phone/desktop pair — the same body serves 21.233 (sheet) and 21.234 (dialog). */
async function phoneBarReachesEveryTool(mount: Mounter): Promise<void> {
  const phone = await mount(true);
  // The phone bar: "More tools" is there; the three tray-only tools are NOT on the bar.
  expect(within(phone.toolbar).getByRole('button', { name: 'More tools' })).toBeInTheDocument();
  const onBar = barTools(phone.toolbar);
  for (const { name } of TRAY_TOOLS) expect(onBar, `${name} must not be on the phone bar`).not.toContain(name);
  expect(onBar).toHaveLength(9);

  // Every tray-only tool is REACHABLE: More opens the tray, the tool is in it, pressing it inserts its node.
  for (const { name, node } of TRAY_TOOLS) {
    expect(phone.host.querySelector(`.ProseMirror ${node}`), `${node} before ${name}`).toBeNull();
    fireEvent.click(within(phone.toolbar).getByRole('button', { name: 'More tools' }));
    const tray = phone.toolbar.querySelector<HTMLElement>('.ticket-editor__tray');
    expect(tray, `More opens the tray for ${name}`).not.toBeNull();
    fireEvent.click(toolNamed(tray as HTMLElement, name));
    await waitFor(() => expect(phone.host.querySelector(`.ProseMirror ${node}`), `${name} inserts a ${node}`).not.toBeNull());
    // Running a tray tool closes the tray (21.140), so the next loop pass opens it again.
    expect(phone.toolbar.querySelector('.ticket-editor__tray')).toBeNull();
  }
  phone.unmount();

  // CONTROL (same `it`): the same mount at desktop width has all seventeen on the bar and no More.
  const desktop = await mount(false);
  expect(barTools(desktop.toolbar)).toHaveLength(ALL_SEVENTEEN);
  for (const { name } of TRAY_TOOLS) expect(barTools(desktop.toolbar)).toContain(name);
  expect(within(desktop.toolbar).queryByRole('button', { name: 'More tools' })).toBeNull();
  desktop.unmount();
}

describe('21.233 the ticket sheet gets the phone bar, and every tool stays reachable', () => {
  it('21.233 at ≤40rem the sheet description editor has More tools and no Code block / Collapsible / Horizontal rule on the bar; each inserts from the tray; desktop has all seventeen', async () => {
    await phoneBarReachesEveryTool(mountSheet);
  });
});

describe('21.234 the new-ticket dialog gets the phone bar, and every tool stays reachable', () => {
  it('21.234 at ≤40rem the dialog description editor has More tools and no Code block / Collapsible / Horizontal rule on the bar; each inserts from the tray; desktop has all seventeen', async () => {
    await phoneBarReachesEveryTool(mountDialog);
  });
});

// ── 21.235: the editor's OWN phone arm ────────────────────────────────────────────────────────────────────────────
const editorCss = readEditorCss();
/** Index of the rule whose selector list is exactly `selector`, under `atRule`; the LAST such one when `last`. */
function indexOfRule(selector: string, atRule: string | null): number {
  const hits = parseRules(editorCss).flatMap((rule, index) => (rule.atRule === atRule && rule.selectors.join(', ') === selector ? [index] : []));
  if (hits.length === 0) throw new Error(`no rule "${selector}" under ${atRule ?? 'top level'} in editor.css`);
  return hits[hits.length - 1] as number;
}

describe('21.235 editor.css has its own ≤40rem arm: 44px tools and select, no dividers — after the bases', () => {
  it('21.235 the arm sets min-height/min-width 2.75rem, select min-height 2.75rem and hides the divider, after each base; desktop stays 32px', () => {
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool', PHONE), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool', PHONE), 'min-width')).toBe('2.75rem');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__heading-select', PHONE), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-divider', PHONE), 'display')).toBe('none');
    // One sheet, so source order IS the cascade at equal specificity: each phone rule sits after its base.
    for (const base of ['.ticket-editor__tool', '.ticket-editor__heading-select', '.ticket-editor__tool-divider']) {
      expect(indexOfRule(base, PHONE), `${base}: the phone rule comes after the base`).toBeGreaterThan(indexOfRule(base, null));
    }
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-group', PHONE), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar', PHONE), 'padding-left')).toBe('0.25rem');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar', PHONE), 'padding-right')).toBe('0.25rem');
    expect(indexOfRule('.ticket-editor__tool-group', PHONE)).toBeGreaterThan(indexOfRule('.ticket-editor__tool-group', null));
    expect(indexOfRule('.ticket-editor__toolbar', PHONE)).toBeGreaterThan(indexOfRule('.ticket-editor__toolbar', null));
    // The arm is EXACTLY these five rules, none scoped under a host (`.gn-notes …` was the Notes-only form that left
    // the sheet and the dialog at 32px with dividers drawn); an added rule or declaration reddens here.
    const arm = parseRules(editorCss).filter((rule) => rule.atRule === PHONE);
    expect(arm.map((rule) => rule.selectors.join(', '))).toEqual([
      '.ticket-editor__toolbar',
      '.ticket-editor__tool',
      '.ticket-editor__heading-select',
      '.ticket-editor__tool-divider',
      '.ticket-editor__tool-group',
    ]);
    expect(arm.map((rule) => [...rule.body.matchAll(/(?:^|;|\{)\s*([a-z-]+)\s*:/g)].map((hit) => hit[1]))).toEqual([
      ['padding-left', 'padding-right'],
      ['min-height', 'min-width'],
      ['min-height'],
      ['display'],
      ['flex-wrap'],
    ]);
    // …and the GLOBAL sheet no longer carries a Notes-scoped copy of any of them (they would fork the cascade).
    const scoped = parseRules(readGlobalsCss()).filter((rule) => rule.selectors.some((selector) => /\.gn-notes\b.*\.ticket-editor__/.test(selector)));
    expect(scoped.map((rule) => rule.selectors.join(', '))).toEqual([]);
    // CONTROL (same `it`): above the arm the tools are still the desktop 32px and the divider is drawn.
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool'), 'min-height')).toBe('32px');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__heading-select'), 'min-height')).toBe('32px');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-divider'), 'display')).toBeNull();
    // The breakpoint is the one the component switches on (`PHONE_TOOLBAR_QUERY`), so the bar and its floors flip together.
    expect(PHONE).toBe(`@media ${PHONE_TOOLBAR_QUERY}`);
  });
});

// ── 21.236 / 21.237: the two-row bound in each host ──────────────────────────────────────────────────────────────────
const ui = readUiCss();
/**
 * Each host's editor CONTENT width at a phone viewport, read from the rules that make it. Sheet and dialog both
 * fill the viewport at ≤40rem and carry the same 1.5rem side padding on their body, so the slot is the viewport
 * less 2 × 1.5rem; the toolbar fills the slot (`.editor-slot` has no border or side padding).
 *   - sheet:  `.gn-sheet { width: 100%; max-width: none }` in the phone arm (`ui.css:962`) and
 *             `.gn-sheet__body { padding: 0 1.5rem 1.5rem }` (`ui.css:949`) — the description is a `section` in the body.
 *   - dialog: `.gn-dialog { width: 100% }` in the phone arm (`ui.css:979`) and `.gn-dialog__body` (`ui.css:948`, the same rule).
 */
function hostWidths(): { sheetSide: number; dialogSide: number } {
  const bodyRule = (selector: string): string => {
    const hit = parseRules(ui).find((rule) => rule.atRule === null && rule.selectors.includes(selector));
    if (hit === undefined) throw new Error(`no ${selector} rule`);
    return hit.body;
  };
  const side = (selector: string): number => px((valueOf(bodyRule(selector), 'padding') ?? '').split(/\s+/)[1] ?? null, 0);
  expect(valueOf(ruleExactly(ui, '.gn-sheet', PHONE), 'width')).toBe('100%');
  expect(valueOf(ruleExactly(ui, '.gn-dialog', PHONE), 'width')).toBe('100%');
  return { sheetSide: side('.gn-sheet__body'), dialogSide: side('.gn-dialog__body') };
}
const VIEWPORTS = [360, 390, 430, 466] as const;

async function twoRowsInHost(mount: Mounter, side: number): Promise<void> {
  expect(side, 'the host body side padding is read, not assumed').toBe(24);
  const rules: PackingRules = packingRules(editorCss, { phone: true });
  expect(rules.toolWidth).toBe(44);
  expect(rules.dividerWidth).toBe(0);
  const phone = await mount(true);
  for (const viewport of VIEWPORTS) {
    const width = viewport - 2 * side;
    const packed = pack(phone.toolbar, width, rules);
    expect(packed.rows, `phone bar rows at viewport ${viewport} (toolbar ${width}px)`).toBeLessThanOrEqual(2);
    expect(packed.widest, `no row wider than the ${packed.room}px box at ${viewport} — that is the clip`).toBeLessThanOrEqual(packed.room);
  }
  phone.unmount();

  // CONTROL (same `it`): the pre-#875 bar — every tool at the desktop 32px floor, dividers drawn, groups that do not
  // wrap — packed by the same model reproduces the audit's cut row: wider than the box at 360, and more than two rows.
  const desktop = await mount(false);
  const old = packingRules(editorCss, { phone: false });
  expect(old.toolWidth).toBe(34);
  expect(old.groupWraps).toBe(false);
  const before = pack(desktop.toolbar, 360 - 2 * side, old);
  expect(before.widest, 'the pre-#875 bar clips at 360').toBeGreaterThan(before.room);
  expect(before.rows).toBeGreaterThan(2);
  desktop.unmount();
  expect(SELECT_WIDTH).toBe(97.5);
}

describe('21.236 / 21.237 the phone bar is at most two rows, and fits its box, in the sheet and in the dialog at 360–466', () => {
  it('21.236 the ticket sheet (viewport − 2 × the sheet body padding) at 360, 390, 430, 466; the pre-#875 bar clips', async () => {
    await twoRowsInHost(mountSheet, hostWidths().sheetSide);
  });
  it('21.237 the new-ticket dialog (viewport − 2 × the dialog body padding) at 360, 390, 430, 466; the pre-#875 bar clips', async () => {
    await twoRowsInHost(mountDialog, hostWidths().dialogSide);
  });
});

void act;
