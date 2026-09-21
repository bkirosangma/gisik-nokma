# Ticket Sheet Prototype Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-seat the ticket sheet's sections into the prototype's order and dress its editors, rows, subtasks and visibility control in the prototype's clothes — with nothing the sheet can do today gained or lost.

**Architecture:** One new `Popover` primitive in `packages/ui` (react-aria overlays, the pieces `Select` already uses); one shared editor chrome in `packages/editor`'s `TicketEditorSlot` (toolbar tray, sunken body, footer row) reached through one additive optional field on the `EditorSlotProps` contract; then `ticket-sheet.tsx` is re-ordered section by section, each move witnessed by a structural test. The "nothing lost" contract is a ratchet: the two suites that pin the sheet and the visibility editor keep every case, with a short enumerated list of permitted mechanical edits.

**Tech Stack:** TypeScript, React 18, `@react-aria/overlays` + `@react-aria/focus`, Tiptap (`packages/editor`), vitest + Testing Library (jsdom), shared CSS tokens in `packages/ui/src/ui.css`, Node 22, pnpm + turbo.

**Spec:** `docs/superpowers/specs/2026-09-22-sheet-prototype-parity-design.md` — read it first. **Two deviations from the spec, decided here and recorded in Task 5 and Task 7:** (a) the visibility trigger keeps the EXISTING pill ground (`--gn-fill-quaternary`) with the dot carrying the colour, because the product has no success/purple tint tokens (`tokens.ts:199-202` refuses them by name) and the spec forbids new tokens; (b) the comment composer's sentence *Posting records an event citing you.* reaches the footer through one additive optional contract field, `footerNote?: string`, which touches two fixture files outside the two ratcheted suites (named in Task 7).

## Global Constraints

- **Never commit or push to `main`.** Branch from `origin/main` AFTER the priority built-in PR (`docs/superpowers/plans/2026-09-22-priority-builtin.md`) has landed — both edit the same rows of `ticket-sheet.tsx`. Suggested branch `rel/sheet-prototype-parity`; the owner's spec/plan branch is `owner/sheet-prototype-parity`. One commit per task; PR `--base main`; the controller lands.
- **Node 22** for every run; paste `NODE=v22.*` beside every summary you cite.
- **Build before suites:** `pnpm turbo run build` before any package's vitest, and again after editing `packages/ui` or `packages/editor` (app-core imports them by name through `dist`).
- **Never pipe a test run into `head`.** `pnpm --filter <pkg> test > /tmp/parity-<lane>-<task>.log 2>&1; tail -25 <log>`.
- **Same-commit rule:** `Features.md` and the `test-cases/` file change in the commit that changes the behaviour they describe. New cases start `❌` only if their test is not in the same commit; every `✅` id appears literally in a test.
- **Case-id blocks (allocated in the tables — `test-cases/16-remaining-doors.md` "THE BLOCKS", `test-cases/13-hig-per-screen.md` "§13 blocks"):** §16 **`16.110`–`16.129`**, §13 **`13.1267`–`13.1286`** (§13 cases file in `13-board-prototype-port.md`). Never mint from the tip; if a block is spent, STOP and ask the controller.
- **The ratchet:** `packages/app-core/test/views/ticket-sheet.test.tsx` has **140** `it(` and `test/views/visibility-editor.test.tsx` has **30** at `origin/main` `5de12392`. Both counts are **≥** those when this lands, and every pre-existing case passes with ONLY these edits: (1) a visibility case opens the menu before touching a radio (via the `openMenu()` helper Task 5 adds); (2) an attachments case switches to the Attachments tab first; (3) `16.81` expects three tabs; (4) Task 7's two fixture edits in `comments-thread.test.tsx` and `ticket-sheet-comments.test.tsx`. **Any other failing pre-existing case is a functionality change — stop and report it, do not "fix" the test.**
- **Text is unchanged unless a task says so.** Section headings become uppercase by CSS `text-transform`, never by retyping, so every `getByText` on them keeps matching.
- **No new colour tokens, no literal colours.** Every rule uses an existing `--gn-*` token.
- **Every control keeps a 44px tap target** (`min-height: 2.75rem` on buttons the repo's `tap-targets.ts` measures), a visible `:focus-visible` ring, and a `cursor: pointer`.
- **Never `AskUserQuestion`.** Questions go into your progress line.

---

## File map

| File | Responsibility |
|---|---|
| `packages/ui/src/components/popover.tsx` (new), `packages/ui/src/index.ts` | `Popover` primitive |
| `packages/ui/test/popover.test.tsx` (new) | open/close/Escape/outside-click/focus-return |
| `packages/editor/src/components/TicketEditorSlot.tsx`, `TicketEditor.tsx`, `styles/editor.css` | shared chrome, footer row, `footerNote`, `hintSlot`, `Post` |
| `packages/app-core/src/views/editor-slot.tsx`, `packages/editor/test/ticket-editor-slot.test.tsx` | the contract's other two declarations |
| `packages/app-core/src/views/ticket-sheet.tsx` | order, chips line, tabs, State row, Attachments tab, visibility row, subtasks |
| `packages/app-core/src/views/visibility-editor.tsx` | trigger pill + popover + viewer chips |
| `packages/app-core/src/views/comments-thread.tsx` | drops its own hint `<p>` (sentence moves to the composer footer) |
| `packages/ui/src/ui.css` | `.gn-popover`, `.gn-ticket-sheet__chips`, `--tinted`, `__caption`, subtask card, add row, viewer chips |
| `packages/app-core/test/views/*.test.tsx` | amended + new cases |
| `docs/manual.md` → `packages/app-core/src/help/content.generated.ts`, `Features.md`, `test-cases/` | copy and catalogue |

---

## Task 1: `Popover` primitive in `packages/ui`

**Backend:** claude-sonnet (an accessibility overlay; focus and dismissal semantics must be right the first time — everything in Task 5 stands on it).

**Files:**
- Create: `packages/ui/src/components/popover.tsx`
- Modify: `packages/ui/src/index.ts` (export)
- Modify: `packages/ui/src/ui.css` (after `.gn-select__panel`, `:2875`)
- Test: `packages/ui/test/popover.test.tsx` (new)
- Catalogue: `test-cases/13-board-prototype-port.md` (`13.1267`–`13.1269`), `Features.md` §3 shared-components bullet

**Interfaces — Produces:**
```ts
export type PopoverProps = {
  triggerRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  'aria-label': string;
  children: ReactNode;
};
export function Popover(props: PopoverProps): ReactElement | null;
```
Renders nothing when `open` is false; otherwise a portal to `document.body` holding `<div role="dialog" aria-label class="gn-popover">` positioned `bottom end` of the trigger, focus trapped and restored, closed by Escape, outside click, or the hidden `DismissButton`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/ui/test/popover.test.tsx
import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Popover } from '../src/components/popover.js';

function Host() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button ref={ref} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Trigger
      </button>
      <p>outside</p>
      <Popover triggerRef={ref} open={open} onClose={() => setOpen(false)} aria-label="Choices">
        <label><input type="radio" name="x" /> One</label>
        <button type="button">Apply</button>
      </Popover>
    </div>
  );
}
afterEach(cleanup);

describe('Popover', () => {
  it('13.1267 opens as a named dialog portalled to body, moves focus inside, and Escape closes it and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    const dialog = screen.getByRole('dialog', { name: 'Choices' });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Trigger' }));
  });

  it('13.1268 an outside click closes it; a click INSIDE does not (the control)', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Trigger' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    fireEvent.mouseUp(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run RED** — `pnpm --filter @gisik-nokma/ui test -- test/popover > /tmp/parity-t1-red.log 2>&1; tail -20 /tmp/parity-t1-red.log`. Expected: module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/ui/src/components/popover.tsx
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@react-aria/focus';
import { DismissButton, useOverlay, useOverlayPosition } from '@react-aria/overlays';

export type PopoverProps = {
  triggerRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive tech. Required, so it cannot be forgotten. */
  'aria-label': string;
  children: ReactNode;
};

/**
 * A small anchored dialog — the product's first popover (the visibility menu,
 * spec 2026-09-22). Built from the SAME react-aria pieces `select.tsx` uses, for
 * the same reasons its `SelectPanel` docblock gives: `FocusScope restoreFocus`
 * returns focus to the trigger when the portal unmounts, `useOverlay` closes on
 * Escape and outside interaction, `DismissButton` gives screen-reader users a
 * way out. `role="dialog"` and not `menu`: the content is a fieldset with radios
 * and a button, not a list of commands.
 */
export function Popover({ triggerRef, open, onClose, 'aria-label': ariaLabel, children }: PopoverProps): ReactElement | null {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { overlayProps, placement } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement: 'bottom end',
    offset: 6,
    isOpen: open,
    onClose,
  });
  const { overlayProps: dismissProps } = useOverlay(
    { isOpen: open, onClose, isDismissable: true, shouldCloseOnBlur: false },
    overlayRef,
  );
  if (!open) return null;
  return createPortal(
    <div {...overlayProps} {...dismissProps} ref={overlayRef} role="dialog" aria-label={ariaLabel} className="gn-popover" data-placement={placement}>
      <FocusScope contain restoreFocus autoFocus>
        <DismissButton onDismiss={onClose} />
        {children}
        <DismissButton onDismiss={onClose} />
      </FocusScope>
    </div>,
    document.body,
  );
}
```
Note `useOverlay`'s `overlayProps` and `useOverlayPosition`'s both carry `style`/handlers; spread positioning first, dismiss second, as `select.tsx:206` merges them. If `mergeProps` from `@react-aria/utils` is already a dependency, use it instead of the double spread.

`packages/ui/src/index.ts`: `export { Popover, type PopoverProps } from './components/popover.js';`

`ui.css`, after `.gn-select__panel`'s block:
```css
/* Popover (spec 2026-09-22) — the visibility menu's container. The same raised
   surface and overlay shadow the select panel uses (`.gn-select__panel` above),
   because both are anchored surfaces over the sheet and two treatments for one
   role is the drift this file's comments exist to prevent. */
.gn-popover {
  position: absolute;
  z-index: 30;
  padding: 0.75rem;
  border-radius: var(--gn-radius-control);
  background: var(--gn-surface-overlay);
  box-shadow: var(--gn-shadow-overlay);
  max-width: min(22rem, calc(100vw - 2rem));
}
```
(Confirm `--gn-surface-overlay`/`--gn-shadow-overlay` are the tokens `.gn-select__panel` uses; copy its exact pair.)

- [ ] **Step 4: Run GREEN** — same command; then `pnpm --filter @gisik-nokma/ui typecheck && pnpm --filter @gisik-nokma/ui build`.

- [ ] **Step 5: Catalogue and Features** — `13.1267`, `13.1268` ✅ in `13-board-prototype-port.md` under a new `### Popover (sheet prototype parity, 2026-09-22)` heading; `Features.md` §3: extend the shared-components bullet (the one naming `SegmentedControl`) with `Popover` — one sentence, the file path.

- [ ] **Step 6: Commit** — `git commit -m "ui: Popover primitive on react-aria overlays (13.1267-13.1268)"`.

---

## Task 2: Shared editor chrome — toolbar tray, sunken body, footer row, `footerNote`, `Post`

**Backend:** deepseek.

**Files:**
- Modify: `packages/editor/src/components/TicketEditorSlot.tsx` (the `return (` block, `:~150-200`; the `EditorSlotProps` type `:~80-115`)
- Modify: `packages/editor/src/components/TicketEditor.tsx:14-50` (props), `:175-190` (render)
- Modify: `packages/editor/src/styles/editor.css:106-200`, `:301-310`
- Modify: `packages/app-core/src/views/editor-slot.tsx:93-135` (contract), `:170` (`PlainTextEditorSlot` ignores the new field — no change needed, it destructures only `doc, placeholder`)
- Modify: `packages/editor/test/ticket-editor-slot.test.tsx:88-104` (the transcribed contract copy)
- Test: `packages/editor/test/ticket-editor-slot.test.tsx` (new cases), `packages/editor/test/editor-css-binding.test.ts` (new; pattern: `packages/app-core/test/views/ticket-sheet-crumb-css-binding.test.tsx`)
- Catalogue: `test-cases/13-board-prototype-port.md` (`13.1270`–`13.1272`), `Features.md` §9 editor bullet

**Interfaces — Produces:** `EditorSlotProps.footerNote?: string` (all three declarations); `TicketEditorProps.hintSlot?: 'below' | 'none'` (default `'below'`); the comment submit reads `Post`.

- [ ] **Step 1: Failing tests**

In `ticket-editor-slot.test.tsx`, add `footerNote?: string;` to `AppCoreEditorSlotProps` (after `labelledBy?: string;`) and append:
```tsx
describe('13.1270 the composer chrome', () => {
  it('draws a footer row holding the submit control, labelled Post in comment mode and Save description in description mode', () => {
    const c = render(<TicketEditorSlot mode="comment" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} />);
    const footer = c.container.querySelector('.editor-slot__footer');
    expect(footer).not.toBeNull();
    expect(footer!.contains(c.getByRole('button', { name: 'Post' }))).toBe(true);
    c.unmount();
    const d = render(<TicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="ws" ticketId="t" submit={async () => true} />);
    expect(d.container.querySelector('.editor-slot__footer')!.contains(d.getByRole('button', { name: 'Save description' }))).toBe(true);
  });
  it('13.1271 the footer note sits in the footer in comment mode; the Markdown hint sits in the footer in description mode; neither is drawn twice', () => {
    const c = render(<TicketEditorSlot mode="comment" doc={null} readOnly={false} workspaceId="ws" ticketId="t" footerNote="Posting records an event citing you." />);
    const footer = c.container.querySelector('.editor-slot__footer')!;
    expect(footer.textContent).toContain('Posting records an event citing you.');
    expect(c.container.querySelectorAll('.ticket-editor__hint')).toHaveLength(0);
    c.unmount();
    const d = render(<TicketEditorSlot mode="description" doc={null} readOnly={false} workspaceId="ws" ticketId="t" />);
    expect(d.container.querySelector('.editor-slot__footer')!.textContent).toContain('Markdown:');
    expect(d.container.querySelectorAll('.editor-slot__hint')).toHaveLength(1);
  });
});
```
Create `packages/editor/test/editor-css-binding.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css = readFileSync(new URL('../src/styles/editor.css', import.meta.url), 'utf8');
describe('13.1272 editor chrome css binding', () => {
  it('declares the footer, hint and sunken body rules the slot renders', () => {
    for (const selector of ['.editor-slot {', '.editor-slot__footer {', '.editor-slot__hint {', '.editor-slot .ticket-editor__toolbar {', '.editor-slot .ticket-editor__content {']) {
      expect(css, selector).toContain(selector);
    }
    expect(css).toMatch(/\.editor-slot__submit\s*\{[^}]*min-height:\s*2\.75rem/);
  });
});
```

- [ ] **Step 2: RED** — `pnpm --filter @gisik-nokma/editor test > /tmp/parity-t2-red.log 2>&1; tail -25 /tmp/parity-t2-red.log`.

- [ ] **Step 3: Implement**

Contract (both `packages/app-core/src/views/editor-slot.tsx` `EditorSlotProps` and `packages/editor/src/components/TicketEditorSlot.tsx` `EditorSlotProps`), after `labelledBy`:
```ts
  /**
   * One sentence for the composer's footer, left of the submit control — the
   * prototype's `cmtHint` slot (`desktop.dc.html:1329`). Optional and additive
   * (spec 2026-09-22); the read-only `PlainTextEditorSlot` ignores it, as it
   * ignores every capability field. In comment mode it REPLACES the Markdown
   * hint (the prototype's comment composer has none); in description mode the
   * Markdown hint keeps the slot and this field is not read.
   */
  footerNote?: string;
```
`TicketEditor.tsx`: add `hintSlot?: 'below' | 'none';` to props (docblock: default `'below'` keeps every other mount identical; the slot passes `'none'` and draws the hint in its footer). Render: `{editable && (props.hintSlot ?? 'below') === 'below' ? <p className="ticket-editor__hint">{MARKDOWN_HINT}</p> : null}`.

`TicketEditorSlot.tsx` render:
```tsx
  const isComment = props.mode === 'comment';
  return (
    <div className="editor-slot">
      <TicketEditor
        /* …existing props unchanged… */
        hintSlot="none"
      />
      <div className="editor-slot__footer">
        {/* Left: the prototype's hint slot. Comment → the host's sentence; description → the Markdown hint. */}
        <p className="editor-slot__hint">
          {isComment ? (props.footerNote ?? '') : props.readOnly ? '' : MARKDOWN_HINT}
        </p>
        <button type="button" className="editor-slot__submit" /* …existing attrs unchanged… */>
          {isComment ? 'Post' : 'Save description'}
        </button>
      </div>
      {disabledReason !== undefined && ( /* unchanged hidden span */ )}
    </div>
  );
```
Import `MARKDOWN_HINT` from `'./EditorToolbar.js'`.

`editor.css`:
```css
/* The composer chrome (spec 2026-09-22), transcribed from the prototype's
   description box (`desktop.dc.html:1168-1173`) and comment box (`:1298-1331`):
   a fill tray for the tools, a sunken field for the words, a footer row. */
.editor-slot {
  border-radius: var(--gn-radius-control);
  background: var(--gn-surface-sunken);
  box-shadow: var(--gn-shadow-sunken);
  overflow: hidden;
}
.editor-slot .ticket-editor__toolbar { margin-top: 0; border-radius: 0; }
.editor-slot .ticket-editor__content { min-height: 6rem; padding: 0.75rem 0.875rem; font-size: 1.0625rem; line-height: 1.375rem; }
.editor-slot__footer {
  display: flex;
  gap: 0.625rem;
  align-items: center;
  padding: 0.5rem 0.625rem;
  background: var(--gn-fill-quaternary);
}
.editor-slot__hint { flex: 1; margin: 0; font-size: 0.75rem; line-height: 1rem; opacity: 0.7; }
.editor-slot__submit {
  min-height: 2.75rem; /* 44px floor; the prototype draws 40 */
  padding: 0 1.125rem;
  border: none;
  border-radius: var(--gn-radius-control);
  background: var(--gn-accent);
  color: var(--gn-accent-text);
  box-shadow: var(--gn-shadow-raised);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.editor-slot__submit:disabled { opacity: 0.55; cursor: not-allowed; }
.editor-slot__submit:focus-visible { outline: 2px solid var(--gn-focus-ring); outline-offset: 2px; }
```
Remove `.editor-slot__submit` from the shared `border: none; background: none` rule at `:301` (keep `.evidence-picker__cancel` there). Confirm `--gn-surface-sunken`, `--gn-shadow-sunken`, `--gn-focus-ring` exist in `ui.css` (they do per the token inventory); editor.css already consumes `--gn-*` tokens.

- [ ] **Step 4: GREEN** — `pnpm turbo run build > /tmp/parity-t2-build.log 2>&1; pnpm --filter @gisik-nokma/editor test > /tmp/parity-t2-green.log 2>&1; tail -25 …; pnpm --filter @gisik-nokma/editor typecheck; pnpm --filter @gisik-nokma/app-core typecheck`. Then `pnpm --filter @gisik-nokma/web test -- test/description-editable > /tmp/parity-t2-web.log 2>&1` (it queries `Save description` — unchanged, must pass).

- [ ] **Step 5: Catalogue and Features** — `13.1270`–`13.1272` ✅; `Features.md` §9 editor bullet gains the footer row, `Post`, `footerNote`, `hintSlot`.

- [ ] **Step 6: Commit** — `git commit -m "editor: one composer chrome — tray, sunken body, footer row; footerNote; Post (13.1270-13.1272)"`.

---

## Task 3: Header chips line, parent line, three tabs, Attachments tab

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/views/ticket-sheet.tsx:456` (tab type), `:2475-2483` (tabs), `:2545-2560` (state line → moves in Task 4), `:2704-2725` (parent), `:3105-3135` (attachments)
- Modify: `packages/ui/src/ui.css` (`.gn-ticket-sheet__chips`)
- Test: `packages/app-core/test/views/ticket-sheet.test.tsx` (`16.81` amended; `16.57` amended; new `16.110`–`16.112`)
- Catalogue: `test-cases/16-remaining-doors.md`, `Features.md` line ~75 sheet bullet

- [ ] **Step 1: Tests**

Amend `16.81` (`:2694-2701`): `expect(tabs.map((t) => t.textContent)).toEqual(['Details', 'History', 'Attachments']); expect(tabs).toHaveLength(3);` and rewrite its "third tab is not drawn" comment: the owner ruled it in on 2026-09-22. Amend `16.57` (`:4075`): after each `renderSheet(...)`/`await settled()`, add `fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));` before the assertions. Add to the `G —` describe (or a new `describe('sheet prototype parity — order', …)`):
```tsx
  it('16.110 the chips line sits under the title: the state chip, the Restricted chip when the audience is explicit, the Closed chip when closed', async () => {
    renderSheet(ticketRead({ visibility: { ownMode: 'explicit', resolvedMode: 'explicit', userIds: ['user_kiro'], claim: null } as TicketVisibility }));
    await settled();
    const chips = screen.getByTestId('sheet-chips');
    expect(within(chips).getByText('Doing')).toBeInTheDocument();
    expect(within(chips).getByText('Restricted')).toBeInTheDocument();
    // and it precedes the tablist
    const tablist = screen.getByRole('tablist', { name: 'Ticket sections' });
    expect(chips.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('16.110 CONTROL — a project-visible ticket draws NO Restricted chip', async () => {
    renderSheet(ticketRead());
    await settled();
    expect(within(screen.getByTestId('sheet-chips')).queryByText('Restricted')).toBeNull();
  });
  it('16.111 the attachment list renders under the Attachments tab and NOT under Details', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), { attachments: [{ attachmentId: '01J9ATT000000000000000000A', kind: 'upload', filename: 'gst-receipt.pdf', mime: 'application/pdf', size: 1, sha256: null } as AttachmentListEntry] });
    await settled();
    expect(screen.queryByText('gst-receipt.pdf')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    expect(screen.getByText('gst-receipt.pdf')).toBeInTheDocument();
    expect(screen.queryByTestId('field-description')).toBeNull();
  });
  it('16.112 the parent indicator follows the chips line and precedes the tabs', async () => {
    renderSheet(ticketRead());
    await settled();
    const chips = screen.getByTestId('sheet-chips');
    const parent = screen.getByTestId('sheet-parent-indicator');
    const tablist = screen.getByRole('tablist', { name: 'Ticket sections' });
    expect(chips.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(parent.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```
Use the `TicketVisibility` shape the file's `SEED_VISIBILITY` already uses (read it; match its field names exactly). Use the `ENTRY` fixture at `:4066` for the attachment rather than the inline literal if it is in scope.

- [ ] **Step 2: RED** — `pnpm --filter @gisik-nokma/app-core test -- test/views/ticket-sheet.test.tsx > /tmp/parity-t3-red.log 2>&1; tail -30 …`.

- [ ] **Step 3: Implement**

`:456`: `useState<'details' | 'history' | 'attachments'>('details')`. Tabs: add `{ value: 'attachments', label: 'Attachments' }`. Directly ABOVE the `<SegmentedControl>` (still inside the sheet body, outside the tab branches) render:
```tsx
      {/* The prototype's chips line (`desktop.dc.html:1128-1133`): state, then the
          Restricted chip when the audience is explicit, then Closed. The "Recorded
          in this browser" text is NOT drawn — nothing in our data is that clock. */}
      <div className="gn-ticket-sheet__chips" data-testid="sheet-chips">
        <Chip tone={state.stateCategory}>{currentStateName}</Chip>
        {standingVisibility?.resolvedMode === 'explicit' ? <Chip tone="restricted">Restricted</Chip> : null}
        {closed !== null ? <Chip tone="terminal">{`Closed by ${nameOf(closed.actorId)} on ${formatDate(closed.at)}`}</Chip> : null}
      </div>
```
then MOVE the existing `gn-ticket-sheet__parent` block (`:2704-2725`) here, under the chips line (unchanged markup). Remove the `gn-sheet__closed-badge` span from the state line (it is now the chip above) — keep the `Closed — reopen it first` note where the Move button is. Add the third branch after `HistoryTab`'s:
```tsx
      ) : tab === 'attachments' ? (
        <div className="gn-ticket-sheet__attachments">
          {attachmentsUnavailable === undefined ? <AttachmentList entries={attachments ?? []} /> : ( /* the existing <p role="alert" … sheet-attachments-unavailable> block, moved verbatim */ )}
        </div>
      ) : (
```
and delete the same block from the Details branch. `ui.css`: `.gn-ticket-sheet__chips { display: flex; gap: 0.625rem; align-items: center; flex-wrap: wrap; margin: 0 0 1rem; }`.

- [ ] **Step 4: GREEN** — same suite + typecheck; then the whole app-core suite to a log and `grep -c "^\s*it(" test/views/ticket-sheet.test.tsx` (expect ≥ 144).

- [ ] **Step 5: Catalogue and Features** — amend `16.81`'s prose; `16.110`–`16.112` ✅; `Features.md` sheet bullet: chips line, three tabs.

- [ ] **Step 6: Commit** — `git commit -m "Sheet: chips line under the title, parent line, Attachments tab (16.81 amended, 16.110-16.112)"`.

---

## Task 4: Description above the grid, State row, no stray title row, alternating tinted rows

**Backend:** deepseek.

**Files:**
- Modify: `ticket-sheet.tsx:2545-2620` (state line → State row), `:2895-3100` (row order), `:3028-3072` (description block), `:3078-3096` (loop exclusion)
- Modify: `ui.css:2091-2094`, `:2118-2122` (grid), new `--tinted`
- Test: `ticket-sheet.test.tsx` (`16.113`–`16.117`)
- Catalogue: `16-remaining-doors.md`, `Features.md`

- [ ] **Step 1: Tests**
```tsx
  it('16.113 the Details sections stand in the prototype order', async () => {
    renderSheet(ticketRead());
    await settled();
    const ids = ['field-description', 'field-state', 'field-assignee', 'field-priority', 'field-due', 'field-type', 'field-visibility', 'sheet-subtasks', 'sheet-comments'];
    const nodes = ids.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${ids[i - 1]} before ${ids[i]}`).toBeTruthy();
    }
  });
  it('16.114 the State row holds the state chip, its provenance and the Move… button — no select', async () => {
    renderSheet(ticketRead());
    await settled();
    const row = screen.getByTestId('field-state');
    expect(within(row).getByText('Doing')).toBeInTheDocument();
    expect(within(row).getByText(PROVENANCE_LINE)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Move…' })).toBeInTheDocument();
    expect(row.querySelector('select')).toBeNull();
    expect(within(row).queryByRole('combobox')).toBeNull();
  });
  it('16.115 the title is edited in the header and draws NO generic field row', async () => {
    renderSheet(ticketRead());
    await settled();
    expect(screen.queryByTestId('field-title')).toBeNull();
    expect(screen.getByLabelText('Title')).toBeInTheDocument(); // the header control, whatever its current accessible name is — read `titleSlot` and match it
  });
  it('16.116 every second row of the grid is tinted, by class', async () => {
    renderSheet(ticketRead());
    await settled();
    const rows = [...screen.getByTestId('field-state').parentElement!.querySelectorAll('.gn-ticket-sheet__field')];
    rows.forEach((row, index) => {
      expect(row.classList.contains('gn-ticket-sheet__field--tinted'), `row ${index}`).toBe(index % 2 === 1);
    });
  });
  it('16.117 the description block precedes the grid and keeps its caption as the editor’s name', async () => {
    renderSheet(ticketRead(), sheetSource(ticketRead()), { editorSlot: fakeDescriptionSlot() });
    await settled();
    const block = screen.getByTestId('field-description');
    const grid = screen.getByTestId('field-state').closest('dl')!;
    expect(block.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.querySelector('#gn-ticket-sheet-description-label')).not.toBeNull();
  });
```
(`fakeDescriptionSlot` is whatever the file's existing stub at `:1890-1925` is named; reuse it.)

- [ ] **Step 2: RED** — same suite.

- [ ] **Step 3: Implement**

Move the `field-description` `<div>` OUT of the `<dl>` to directly above it, keeping its `data-testid`, `dt id`, and the `EditorSlot` mount verbatim (change the wrapper from `<div class="gn-ticket-sheet__field">` to `<section class="gn-ticket-sheet__description" aria-labelledby="gn-ticket-sheet-description-label">` with the `<dt>` becoming `<h3 id=… className="gn-ticket-sheet__caption">Description</h3>`; the claim line stays). Insert as the FIRST `<dl>` child:
```tsx
            <div className="gn-ticket-sheet__field" data-testid="field-state">
              <dt>State</dt>
              <dd>
                {/* the whole former `.gn-ticket-sheet__state` block, moved verbatim: chip, provenance, Close/Reopen, Move…, closed note */}
              </dd>
            </div>
```
Then Assignee, Priority, Due, Type, Visibility (Task 5 fills `field-visibility`; for now move the `<VisibilityEditor …/>` mount into `<div className="gn-ticket-sheet__field" data-testid="field-visibility"><dt>Visibility</dt><dd>…</dd></div>` as the last fixed row), then the generic loop with the exclusion `['title', 'description', 'dueDate', 'startDate', 'priority'].includes(fieldId)`. Tinting: compute `className={index % 2 === 1 ? 'gn-ticket-sheet__field gn-ticket-sheet__field--tinted' : 'gn-ticket-sheet__field'}` — simplest is a small `Row` helper component taking `testId`, `label`, `tinted`, `children`, used for all fixed rows, with the index counted in order.

`ui.css`:
```css
.gn-ticket-sheet__field { display: grid; grid-template-columns: minmax(6rem, 9.375rem) minmax(0, 1fr); gap: 0; padding: 0; }
.gn-ticket-sheet__field dt { color: var(--gn-text-muted); font-size: 0.9375rem; padding: 0.75rem 0 0.75rem 0.75rem; min-height: 2.5rem; line-height: 2.5rem; display: flex; align-items: flex-start; }
.gn-ticket-sheet__field dd { margin: 0; padding: 0.75rem 0.75rem 0.75rem 0; display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-end; text-align: right; min-width: 0; }
.gn-ticket-sheet__field--tinted dt { background: var(--gn-fill-quaternary); border-radius: 0.5rem 0 0 0.5rem; }
.gn-ticket-sheet__field--tinted dd { background: var(--gn-fill-quaternary); border-radius: 0 0.5rem 0.5rem 0; }
.gn-ticket-sheet__caption { margin: 0; font-size: 0.8125rem; line-height: 1.125rem; color: var(--gn-text-muted); text-transform: uppercase; letter-spacing: 0.6px; }
```
Keep the `@media (max-width: 40rem)` collapse (`grid-template-columns: 1fr`; add `dd { align-items: flex-start; text-align: left; }` inside it). The State row's `dd` content is left-aligned inside a right-aligned column: wrap the moved block in `<div className="gn-ticket-sheet__state">` (existing flex rule) so the test's selector at `:1308` resolves.

- [ ] **Step 4: GREEN** — suite + typecheck + `grep -c` ratchet.

- [ ] **Step 5: Catalogue and Features** — `16.113`–`16.117` ✅; amend `16.23`–`16.30` prose where it names the old order; `Features.md` sheet bullet.

- [ ] **Step 6: Commit** — `git commit -m "Sheet: description above the grid, State row, tinted rows, no stray title row (16.113-16.117)"`.

---

## Task 5: Visibility pill opens a menu; read-only viewer chips

**Backend:** claude-sonnet (a 30-case suite moves into a portal; focus, refusal and lockout arms must all survive).

**Files:**
- Modify: `packages/app-core/src/views/visibility-editor.tsx:436-600`
- Modify: `packages/ui/src/ui.css` (`.gn-visibility__trigger`, `__viewers`, `__viewer`)
- Test: `packages/app-core/test/views/visibility-editor.test.tsx` (30 cases + `openMenu()` helper; new `16.118`–`16.122`)
- Catalogue: `16-remaining-doors.md`, `Features.md` visibility bullet; `docs/manual.md` §10

**Interfaces — Consumes:** `Popover` (Task 1).

- [ ] **Step 1: Tests**

Add the helper after `mount()`:
```tsx
async function openMenu(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: /who can see this|Only:|Everyone|Restricted/i }));
  return screen.getByRole('dialog', { name: 'Change who can see this' });
}
```
Then, in EVERY existing case that clicks a radio or Apply, insert `await openMenu(user);` before the first such click (grep `getByRole('radio'` and `name: 'Apply'`). Nothing else in those cases changes. Add:
```tsx
describe('16.118 the visibility pill is a menu trigger', () => {
  it('16.118 clicking the pill opens a dialog holding the four modes and Apply; Apply on success closes it', async () => {
    const user = userEvent.setup();
    const source = mount({ current: { ownMode: 'project', resolvedMode: 'project', userIds: null, claim: null } });
    const dialog = await openMenu(user);
    expect(within(dialog).getAllByRole('radio')).toHaveLength(4);
    await user.click(within(dialog).getByRole('radio', { name: 'Everyone in the workspace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(source.ingested).toHaveLength(1);
  });
  it('16.119 Apply on a REFUSAL leaves the menu open with the refusal inside it', async () => {
    const user = userEvent.setup();
    mount({ current: { ownMode: 'project', resolvedMode: 'project', userIds: null, claim: null } }, refusingSource('visibility.forbidden', 'not yours'));
    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole('radio', { name: 'Everyone in the workspace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await within(dialog).findByText(/not yours/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('16.120 an explicit audience draws one READ-ONLY chip per named person under the pill, with no remove control', () => {
    mount({ current: { ownMode: 'explicit', resolvedMode: 'explicit', userIds: [KIRO, ANSELMA], claim: null } });
    const viewers = screen.getByTestId('visibility-viewers');
    expect(within(viewers).getByText('Kiro')).toBeInTheDocument();
    expect(within(viewers).getByText('Anselma Marak')).toBeInTheDocument();
    expect(within(viewers).queryAllByRole('button')).toHaveLength(0);
  });
  it('16.121 with NO served audience the pill still exists so the menu can be reached', async () => {
    const user = userEvent.setup();
    mount({ current: null });
    expect(await openMenu(user)).toBeInTheDocument();
  });
  it('16.122 Escape closes the menu and returns focus to the pill', async () => {
    const user = userEvent.setup();
    mount({ current: { ownMode: 'project', resolvedMode: 'project', userIds: null, claim: null } });
    await openMenu(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement?.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
```
Use the file's existing `refusingSource`/`recordingSource` helpers and the `VisibilityClaim` shape it already builds (read `:60-105`; match field names).

- [ ] **Step 2: RED** — `pnpm --filter @gisik-nokma/app-core test -- test/views/visibility-editor > /tmp/parity-t5-red.log 2>&1`.

- [ ] **Step 3: Implement** (`visibility-editor.tsx` render)

```tsx
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerLabel = current === null ? 'Who can see this…' : standingSentence(current, nameOf);
  return (
    <div className="gn-visibility" data-testid="visibility-editor">
      <button
        ref={triggerRef}
        type="button"
        className={restricted ? 'gn-visibility__trigger gn-visibility__trigger--restricted' : 'gn-visibility__trigger'}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        disabled={!canEdit}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className="gn-visibility__dot" aria-hidden="true" />
        {triggerLabel}
      </button>
      {current === null ? <p className="gn-visibility__unserved" role="status">…(unchanged sentence)</p> : null}
      {current?.claim ? <span className="gn-visibility__standing-claim">set by … on …</span> : null}
      <p className="gn-visibility__owner-note">{OWNER_ALWAYS_SEES_COPY}</p>
      {current !== null && namedAudience(current) !== null ? (
        <div className="gn-visibility__viewers" data-testid="visibility-viewers">
          <p className="gn-ticket-sheet__caption">Who can see it</p>
          <div className="gn-visibility__viewer-chips">
            {namedAudience(current)!.map((id) => <span key={id} className="gn-visibility__viewer">{nameOf(id)}</span>)}
          </div>
        </div>
      ) : current?.resolvedMode === 'explicit' ? <span className="gn-visibility__roster-unserved">…(unchanged)</span> : null}
      {!canEdit ? <p className="gn-visibility__read-only">{READ_ONLY_COPY}</p> : null}
      <Popover triggerRef={triggerRef} open={menuOpen && canEdit} onClose={() => setMenuOpen(false)} aria-label="Change who can see this">
        <div className="gn-visibility__controls">
          {/* the EXISTING fieldset / people / lockout / Apply / refusal / unreached block, verbatim */}
        </div>
      </Popover>
    </div>
  );
```
In `apply()`, after a committed result: `onChanged(); setMenuOpen(false);` — refusal and transport arms leave it open. The `<section aria-label="Who can see this">` wrapper becomes the `<div>` above because the row `<dt>Visibility</dt>` names it now; keep `data-testid` for the sheet tests. `nameOf` is `(id) => members.find(m => m.id === id)?.name ?? id` (the file already resolves names this way for the standing sentence — reuse that function).

`ui.css`: `.gn-visibility__trigger` = the existing `.gn-visibility__standing-mode` rule plus `border: none; cursor: pointer; min-height: 2.75rem;` and `:focus-visible` ring; `--restricted .gn-visibility__dot { background: var(--gn-restricted) }` (the ground stays `--gn-fill-quaternary`: deviation (a) in the header). `.gn-visibility__viewers { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end; margin-top: 0.25rem; }`, `.gn-visibility__viewer-chips { display: flex; gap: 0.4375rem; flex-wrap: wrap; justify-content: flex-end; }`, `.gn-visibility__viewer { display: inline-flex; align-items: center; padding: 0.25rem 0.625rem; border-radius: 999px; background: var(--gn-fill-tertiary); box-shadow: var(--gn-shadow-raised); font-size: 0.8125rem; line-height: 1.125rem; }`. Delete `.gn-visibility__heading`.

- [ ] **Step 4: GREEN** — suite + `grep -c "^\s*it(" test/views/visibility-editor.test.tsx` (≥ 35); then `ticket-sheet.test.tsx` (its visibility-adjacent cases, if any, get the same `openMenu` treatment — list each one you touch in the commit body).

- [ ] **Step 5: Catalogue, Features, manual** — `16.118`–`16.122` ✅; `Features.md` visibility bullet; `docs/manual.md` §10: "click the visibility pill, choose, press Apply".

- [ ] **Step 6: Commit** — `git commit -m "Visibility: the pill opens a menu holding the existing controls; read-only viewer chips (16.118-16.122)"`.

---

## Task 6: Subtasks — caption, cards, inline add row

**Backend:** deepseek.

**Files:**
- Modify: `ticket-sheet.tsx:2743-2895`
- Modify: `ui.css` (subtask card + add row)
- Test: `ticket-sheet.test.tsx` (`16.123`–`16.125`; existing `16.1x` subtask cases must pass unchanged — `getByLabelText('New subtask title')` keeps working through `aria-label`)
- Catalogue: `16-remaining-doors.md`, `Features.md`

- [ ] **Step 1: Tests**
```tsx
  it('16.123 the Subtasks heading wears the caption class (uppercase by CSS, text unchanged)', async () => {
    renderSheet(ticketRead());
    await settled();
    const heading = within(screen.getByTestId('sheet-subtasks')).getByText(/^Subtasks/);
    expect(heading.className).toContain('gn-ticket-sheet__caption');
  });
  it('16.124 each subtask is a card: title, then a chip row with the state chip and `type · Due day`', async () => {
    const child = listRowSeed({ ticketId: 'kid', title: 'Mint tokens', parentId: TICKET, typeId: 'task', stateName: 'Blocked', stateCategory: 'open', dueDate: { date: '2026-09-10', claim: claim() } });
    renderSheet(ticketRead({ rollup: { totalChildren: 1, terminalChildren: 0, restrictedCount: 0 } }), sheetSource(ticketRead(), [], [child]));
    await settled();
    const card = screen.getByTestId('subtask-kid');
    expect(card.className).toContain('gn-ticket-sheet__subtask-card');
    expect(within(card).getByText('Blocked').className).toContain('gn-chip');
    expect(within(card).getByText(`task · Due ${formatDate('2026-09-10')}`)).toBeInTheDocument();
  });
  it('16.125 the add row is one line: the input carries its label as placeholder AND accessible name, the button sits beside it', async () => {
    renderSheet(ticketRead());
    await settled();
    const input = screen.getByLabelText('New subtask title');
    expect(input).toHaveAttribute('placeholder', 'New subtask title');
    expect(input.closest('.gn-ticket-sheet__subtask-add')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Add subtask' }).closest('.gn-ticket-sheet__subtask-add')).toBe(input.closest('.gn-ticket-sheet__subtask-add'));
  });
```
(Import `formatDate` from `../../src/provenance.js`; `listRowSeed`/`claim` from the helpers.)

- [ ] **Step 2: RED**, **Step 3: Implement**

Heading: `<p className="gn-ticket-sheet__subtasks-heading gn-ticket-sheet__caption">`. Rows:
```tsx
                  <li key={row.ticketId} data-testid={`subtask-${row.ticketId}`} className="gn-ticket-sheet__subtask-card">
                    <span className="gn-ticket-sheet__subtask-title">{row.title}</span>
                    <span className="gn-ticket-sheet__subtask-meta">
                      <Chip tone={row.stateCategory}>{row.stateName}</Chip>
                      <span className="gn-ticket-sheet__subtask-detail">
                        {row.dueDate === null ? row.typeId : `${row.typeId} · Due ${formatDate(row.dueDate.date)}`}
                      </span>
                    </span>
                  </li>
```
(the `' · '` separator span and `__subtask-state` span are replaced by the chip; the 2026-09-20 "one run of glyphs" concern is met because the chip and detail are separate flex items with text between them — keep the ` · ` inside the detail string.) Add row: `<form className="gn-ticket-sheet__subtask-add" …>` keeping `sheet-subtask-target` `<p>` ABOVE the form; inside the form replace the `<label className="gn-field">` with `<input id="gn-new-subtask-title" className="gn-field__input" placeholder="New subtask title" aria-label="New subtask title" …/>` followed by the `Button`. CSS: `.gn-ticket-sheet__subtask-card { display: flex; flex-direction: column; gap: 0.1875rem; background: var(--gn-fill-quaternary); border-radius: 0.75rem; padding: 0.75rem; }`, `.gn-ticket-sheet__subtask-meta { display: flex; gap: 0.4375rem; align-items: center; flex-wrap: wrap; }`, `.gn-ticket-sheet__subtask-detail { font-size: 0.75rem; line-height: 1rem; color: var(--gn-text-muted); }`, `.gn-ticket-sheet__subtask-add { display: flex; gap: 0.625rem; align-items: flex-end; flex-wrap: wrap; margin-top: 0.75rem; }`, `.gn-ticket-sheet__subtask-add .gn-field__input { flex: 1; min-width: 12.5rem; }`, `.gn-ticket-sheet__subtasks-list { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }`.

- [ ] **Step 4: GREEN** + ratchet; **Step 5:** `16.123`–`16.125` ✅, Features; **Step 6:** `git commit -m "Sheet: subtask cards, caption heading, inline add row (16.123-16.125)"`.

---

## Task 7: Comments — caption, the sentence in the footer

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/views/comments-thread.tsx:190-250` (heading class; drop the hint `<p>`)
- Modify: `ticket-sheet.tsx:3198-3215` (pass `footerNote`)
- Modify: `ui.css:6449`, `:6540-6550`
- Test (the two permitted fixture edits): `comments-thread.test.tsx:170-183` — the case becomes *draws the composer only when one is supplied* and asserts the composer's `Post` button only (the sentence is the composer's now; delete the `getByText('Posting records…')` line and the "always with the prototype's sentence" words); `ticket-sheet-comments.test.tsx:125-145` — `fakeEditorSlot`'s comment arm renders `<p>{props.footerNote}</p>` inside `fake-comment-editor`, so `:219`'s assertion holds unchanged.
- New: `16.126`, `16.127` in `ticket-sheet-comments.test.tsx`
- Catalogue: `16-remaining-doors.md`, `Features.md` comments bullet

- [ ] **Step 1: Tests**
```tsx
  it('16.126 the Comments heading wears the caption class', async () => {
    renderSheet();
    const section = await screen.findByTestId('sheet-comments');
    expect(within(section).getByText(/^Comments/).className).toContain('gn-ticket-sheet__caption');
  });
  it('16.127 the posting sentence is handed to the composer as its footer note, and the thread draws no second copy', async () => {
    const seen = { modes: [] as string[]; notes: [] as (string | undefined)[] };
    renderSheet(source(), { editorSlot: fakeEditorSlot(seen) });
    const section = await screen.findByTestId('sheet-comments');
    expect(seen.notes).toContain('Posting records an event citing you.');
    expect(within(section).getAllByText('Posting records an event citing you.')).toHaveLength(1);
  });
```
(extend `fakeEditorSlot` to push `props.footerNote` into `seen.notes`.)

- [ ] **Step 2: RED**, **Step 3: Implement** — `comments-thread.tsx`: heading `className="gn-comments__heading gn-ticket-sheet__caption"`; delete the `<p className="gn-comments__hint">` and its comment block (record in the commit body that the deviation the comment described is closed). `ticket-sheet.tsx` comment `EditorSlot`: add `footerNote="Posting records an event citing you."`. `ui.css`: delete `.gn-comments__hint`; `.gn-comments__composer` keeps its margin only (the chrome is the slot's now): `{ margin-top: 0.875rem; }`.

- [ ] **Step 4: GREEN** — `comments-thread`, `ticket-sheet-comments`, `ticket-sheet` suites + typecheck. **Step 5:** `16.126`–`16.127` ✅; Features. **Step 6:** `git commit -m "Comments: caption heading; the posting sentence rides the composer footer (16.126-16.127)"`.

---

## Task 8: Copy, help corpus, catalogue sweep, viewport run

**Backend:** deepseek.

- [ ] **Step 1** — `docs/manual.md` §5 "the job panel": rewrite the row order paragraph to Description, State, Assignee, Priority, Due, Type, Visibility, then Subtasks and Comments; the Attachments tab; §10 the visibility pill + Apply (Task 5 may have done this — check). `pnpm help:generate && pnpm check:help`.
- [ ] **Step 2** — `Features.md`: re-read the whole sheet bullet (line ~75) and the visibility, comments and attachments bullets against the shipped tree; correct every sentence that still describes the old order. Search `Features.md` and `test-cases/16-remaining-doors.md` for `gn-visibility__heading`, `Who can see this` (as a heading), `field-dueDate`, "two tabs", "Comment" (as the button label) and fix each.
- [ ] **Step 3** — Ratchet check, pasted into the PR body: `grep -c "^\s*it(" packages/app-core/test/views/ticket-sheet.test.tsx` (≥ 140 + new), same for `visibility-editor.test.tsx` (≥ 30 + 5); `pnpm check:citations`; `node scripts/check-case-ids.mjs`.
- [ ] **Step 4** — Full gate: `pnpm turbo run build`, every package suite to logs, `pnpm typecheck`, then `pnpm test:e2e:viewport > /tmp/parity-viewport.log 2>&1; tail -20 …` at 390 and 1280; capture the sheet at both widths and put the paths in the PR body beside the owner's four prototype screenshots.
- [ ] **Step 5: Commit** — `git commit -m "Sheet parity: manual, help corpus, catalogue sweep; ratchet and viewport evidence in the PR body"`.

---

## Self-review

**Spec coverage.** Chips line + parent + tabs (T3) · description block, State row, title row deleted, tinted grid (T4) · visibility pill, popover, viewer chips (T1, T5) · editor chrome, footer, Post, footerNote (T2, T7) · subtask cards, caption, inline add (T6) · comments caption (T7) · manual, help, Features, catalogue, viewport (T8). The order assertion the spec asks for is `16.113`; the popover behaviours are `13.1267`–`13.1268` and `16.118`–`16.122`; the css bindings are `13.1272` and `16.116`.

**Type/name consistency.** `Popover` props (`triggerRef, open, onClose, 'aria-label', children`) in T1 and T5; `footerNote?: string` in all three declarations (T2) and the sheet mount (T7); `hintSlot` default `'below'` (T2); testids `sheet-chips`, `field-state`, `field-visibility`, `visibility-viewers`, `subtask-<id>` used in T3–T7; classes `.gn-ticket-sheet__caption` (T4) reused in T5, T6, T7. Case ids: `13.1267`–`13.1272`, `16.110`–`16.127` — inside the allocated blocks; `16.128`–`16.129` and `13.1273`–`13.1286` stay free for the executor's control arms.

**Known soft spots.** T3's `TicketVisibility` fixture shape and T5's `VisibilityClaim`/`refusingSource` helpers are read from the test files, not copied here. T1's token pair for the popover is copied from `.gn-select__panel`. T4's `Row` helper is a suggestion; the index-based tinting is the requirement. The ratchet numbers (140 / 30) are measured at `5de12392` — re-measure at your branch point and write both numbers in the PR body.
