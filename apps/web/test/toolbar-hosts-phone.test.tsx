import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent, TicketState, WorkflowDef } from '@gisik-nokma/domain';
import { NewTicketDialog, TicketSheet, type TicketRead } from '@gisik-nokma/app-core';
import { PHONE_TOOLBAR_QUERY, TicketEditorSlot } from '@gisik-nokma/editor';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
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
  // AMENDED 2026-10-02 (23.125): a phone sheet opens on its fields and keeps the description behind a disclosure, so
  // the editor mounts only once it is pressed. The assertions below are unchanged; only the way in is.
  if (phone) fireEvent.click(await within(host).findByRole('button', { name: /^(Add a|Edit) description$/ }));
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
      typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: WF.id }]}
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
  [...toolbar.querySelectorAll<HTMLElement>('.ticket-editor__tool')].map((button) => button.getAttribute('aria-label'));
/** G-7: a sheet cell by its visible label (the sheet is a portal on the body, not inside the toolbar). */
const sheetCell = (name: string): HTMLButtonElement => {
  const cell = [...document.body.querySelectorAll<HTMLButtonElement>('.ticket-editor__sheet-cell')].find((c) => c.querySelector('.ticket-editor__sheet-label')?.textContent === name);
  if (cell === undefined) throw new Error(`no sheet cell named ${name}`);
  return cell;
};

afterEach(() => vi.unstubAllGlobals());

type Mounter = (phone: boolean) => Promise<Mounted & { unmount: () => void }>;

/** One host's phone/desktop pair — the same body serves 21.233 (sheet) and 21.234 (dialog). */
async function phoneBarReachesEveryTool(mount: Mounter): Promise<void> {
  const phone = await mount(true);
  // The phone bar (AMENDED by G-7: seven tools, and the sheet holds the rest): "More tools" is there; the three sheet-only tools are NOT on the bar.
  expect(within(phone.toolbar).getByRole('button', { name: 'More tools' })).toBeInTheDocument();
  const onBar = barTools(phone.toolbar);
  for (const { name } of TRAY_TOOLS) expect(onBar, `${name} must not be on the phone bar`).not.toContain(name);
  expect(onBar).toHaveLength(8); // G-7: seven tools and More (the heading select is not a `.ticket-editor__tool`)

  // Every tray-only tool is REACHABLE: More opens the tray, the tool is in it, pressing it inserts its node.
  for (const { name, node } of TRAY_TOOLS) {
    expect(phone.host.querySelector(`.ProseMirror ${node}`), `${node} before ${name}`).toBeNull();
    fireEvent.click(within(phone.toolbar).getByRole('button', { name: 'More tools' }));
    expect(document.body.querySelector('.ticket-editor__sheet'), `More opens the sheet for ${name}`).not.toBeNull();
    fireEvent.click(sheetCell(name));
    await waitFor(() => expect(phone.host.querySelector(`.ProseMirror ${node}`), `${name} inserts a ${node}`).not.toBeNull());
    // Running a sheet tool closes the sheet (21.140), so the next loop pass opens it again.
    expect(document.body.querySelector('.ticket-editor__sheet')).toBeNull();
  }
  phone.unmount();

  // CONTROL (same `it`): the same mount at desktop width has all seventeen on the bar and no More.
  const desktop = await mount(false);
  expect(barTools(desktop.toolbar)).toHaveLength(ALL_SEVENTEEN);
  for (const { name } of TRAY_TOOLS) expect(barTools(desktop.toolbar)).toContain(name);
  expect(within(desktop.toolbar).queryByRole('button', { name: 'More tools' })).toBeNull();
  desktop.unmount();
}

// 20 s per `it`: see the 21.236 / 21.237 comment below (same real-host mounts).
describe('21.233 the ticket sheet gets the phone bar, and every tool stays reachable', () => {
  it('21.233 at ≤40rem the sheet description editor has More tools and no Code block / Collapsible / Horizontal rule on the bar; each inserts from the tray; desktop has all seventeen', async () => {
    await phoneBarReachesEveryTool(mountSheet);
  });
});

// 20 s per `it`: see the 21.236 / 21.237 comment below (same real-host mounts).
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
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__tool-group', PHONE), 'flex-wrap')).toBe('nowrap'); // G-7: one scrolling row
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar', PHONE), 'padding-left')).toBe('0.25rem');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar', PHONE), 'padding-right')).toBe('0.25rem');
    expect(valueOf(ruleExactly(editorCss, '.ticket-editor__toolbar', PHONE), 'flex-wrap')).toBe('nowrap');
    expect(indexOfRule('.ticket-editor__tool-group', PHONE)).toBeGreaterThan(indexOfRule('.ticket-editor__tool-group', null));
    expect(indexOfRule('.ticket-editor__toolbar', PHONE)).toBeGreaterThan(indexOfRule('.ticket-editor__toolbar', null));
    // The arm is EXACTLY these rules (G-7 added the one-row declarations to the toolbar and the group rules and appended its own block, 25.411–25.416), none scoped under a host (`.gn-notes …` was the Notes-only form that left
    // the sheet and the dialog at 32px with dividers drawn); an added rule or declaration reddens here. The sixth is
    // smoothness G-6's Format button (25.388): the comment composers' footer control, floored at 44px on a phone and
    // placed after its own base rule, which sits below the strip's rules in the file.
    // AMENDED 2026-10-02 (G-7): the arm's first six rules (file order) are the ones below; everything after them is G-7's own
    // block at the foot of the file (the unbox, dock, scroll and sheet rules), each selector pinned by `phone-editors.test.tsx`
    // (25.411–25.416), so the list is no longer the whole arm.
    const fullArm = parseRules(editorCss).filter((rule) => rule.atRule === PHONE);
    expect(fullArm.length, 'G-7 appended its block after the six').toBeGreaterThan(6);
    const arm = fullArm.slice(0, 6);
    expect(arm.map((rule) => rule.selectors.join(', '))).toEqual([
      '.ticket-editor__toolbar',
      '.ticket-editor__tool',
      '.ticket-editor__heading-select',
      '.ticket-editor__tool-divider',
      '.ticket-editor__tool-group',
      '.editor-slot__format',
    ]);
    expect(arm.map((rule) => [...rule.body.matchAll(/(?:^|;|\{)\s*([a-z-]+)\s*:/g)].map((hit) => hit[1]))).toEqual([
      ['padding-left', 'padding-right'],
      ['min-height', 'min-width'],
      ['min-height'],
      ['display'],
      ['flex-wrap'],
      ['min-height', 'min-width'],
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
 *   - sheet:  `.gn-sheet { width: 100%; max-width: none }` in the ≤64rem arm (`ui.css`, 23.053) and
 *             `.gn-sheet__body { padding: 0 1.5rem 1.5rem }` (`ui.css:949`) — the description is a `section` in the body.
 *   - dialog: `.gn-dialog { width: 100% }` in the phone arm (`ui.css:979`) and `.gn-dialog__body` (`ui.css:948`, the same rule).
 */
const bodyRule = (selector: string): string => {
  const hit = parseRules(ui).find((rule) => rule.atRule === null && rule.selectors.includes(selector));
  if (hit === undefined) throw new Error(`no ${selector} rule`);
  return hit.body;
};
/** Left + right padding and margin a declaration block adds, in px (shorthands read as CSS orders them). */
function sideSpace(body: string): number {
  const sides = (value: string | null): number => {
    if (value === null) return 0;
    const parts = value.split(/\s+/).map((part) => px(part, 0));
    if (parts.length === 1) return (parts[0] ?? 0) * 2;
    return (parts[1] ?? 0) + (parts[parts.length === 4 ? 3 : 1] ?? 0);
  };
  const single = (property: string): number => px(valueOf(body, property), 0);
  return (
    sides(valueOf(body, 'padding')) + sides(valueOf(body, 'margin')) +
    single('padding-left') + single('padding-right') + single('margin-left') + single('margin-right')
  );
}
function hostWidths(): { sheetSide: number; dialogSide: number } {
  const side = (selector: string): number => px((valueOf(bodyRule(selector), 'padding') ?? '').split(/\s+/)[1] ?? null, 0);
  // The sheet's full-width rule is the 64rem tablet arm's since UX fixes Task 4 (case 23.053), which covers every phone width too.
  expect(valueOf(ruleExactly(ui, '.gn-sheet', '@media (max-width: 64rem)'), 'width')).toBe('100%');
  expect(valueOf(ruleExactly(ui, '.gn-dialog', PHONE), 'width')).toBe('100%');
  // The model's 24px is only true while NOTHING between the viewport and the toolbar adds side space: no phone arm
  // re-pads either body, and no rule on the wrappers (scrims, the panel, the description section, the dialog's field,
  // the slot) carries a non-zero left/right padding or margin. (The bar's tolerance at 360 is 6.5px, so a stray 1rem
  // would silently invalidate the bound.)
  const globals = readGlobalsCss();
  for (const sheet of [ui, globals]) {
    for (const body of ['.gn-sheet__body', '.gn-dialog__body']) {
      expect(rulesNaming(sheet, body).filter((rule) => rule.atRule === PHONE), `a phone arm re-pads ${body}`).toEqual([]);
    }
  }
  const wrappers = ['.gn-sheet', '.gn-dialog', '.gn-sheet__scrim', '.gn-dialog__scrim', '.gn-ticket-sheet__details', '.gn-ticket-sheet__description', '.gn-new-ticket__field', '.editor-slot'];
  const offenders = [ui, globals, editorCss].flatMap((sheet) =>
    wrappers.flatMap((selector) => rulesNaming(sheet, selector).filter((rule) => sideSpace(rule.body) !== 0).map((rule) => `${selector}: ${rule.body.trim()}`)),
  );
  expect(offenders, 'a wrapper adds side space the packing model does not know about').toEqual([]);
  // CONTROL (same function): the detector sees the body's own 1.5rem, so an empty offender list is not blindness.
  expect(sideSpace(bodyRule('.gn-sheet__body'))).toBe(48);
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

// 20 s per `it`, as notes-css (flake 18.226, #898): each `it` mounts the real sheet (or dialog) twice and packs four widths,
// and asserts geometry, never a duration. The 2026-10-02 LOCAL release gate timed 21.236 out at the 5 s default (load average
// ~74); alone under that load it took 5250 ms, its siblings 21.233 3560 ms, 21.234 1518 ms, 21.237 1401 ms. Reviewer B's LOCAL
// run at load 164: 21.233 5233 ms (timed out at 5 s), 21.234 2934 ms, 21.236 10486 ms, 21.237 8855 ms. 21.235 is a stylesheet
// read (705 ms) and keeps the default. The global `testTimeout` is unchanged.
describe('21.236 / 21.237 the phone bar is at most two rows, and fits its box, in the sheet and in the dialog at 360–466', () => {
  it('21.236 the ticket sheet (viewport − 2 × the sheet body padding) at 360, 390, 430, 466; the pre-#875 bar clips', async () => {
    await twoRowsInHost(mountSheet, hostWidths().sheetSide);
  });
  it('21.237 the new-ticket dialog (viewport − 2 × the dialog body padding) at 360, 390, 430, 466; the pre-#875 bar clips', async () => {
    await twoRowsInHost(mountDialog, hostWidths().dialogSide);
  });
});

