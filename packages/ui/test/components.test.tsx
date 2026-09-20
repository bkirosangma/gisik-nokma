import { act, render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// `"type": "module"`, so NodeNext resolves its types as CJS and a default
// import lands on the module namespace (no `.setup`) under this repo's
// verbatimModuleSyntax / no-esModuleInterop base config.
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initialsOf } from '../src/components/avatar.js';
import { Button } from '../src/components/button.js';
import { Chip } from '../src/components/chip.js';
import { Dialog } from '../src/components/dialog.js';
import { InfoTip } from '../src/components/info-tip.js';
import { SegmentedControl } from '../src/components/segmented-control.js';
import { Sheet } from '../src/components/sheet.js';
import { Switch } from '../src/components/switch.js';
import { Table, type TableColumn } from '../src/components/table.js';

describe('Button', () => {
  it('defaults to the ghost variant and carries explicit variants as BEM modifiers', () => {
    render(
      <>
        <Button>Plain</Button>
        <Button variant="primary">Go</Button>
        <Button variant="danger">Discard</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveClass('gn-button--ghost');
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('gn-button--primary');
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveClass('gn-button--danger');
  });

  it('is type=button by default so forms are never submitted by accident', () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveAttribute('type', 'button');
  });
});

describe('Chip', () => {
  it('renders a decorative tone dot and the label', () => {
    render(<Chip tone="blocked">Waiting on bank</Chip>);
    const chip = screen.getByText('Waiting on bank');
    expect(chip).toHaveClass('gn-chip--blocked');
    expect(chip.querySelector('.gn-chip__dot')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Avatar', () => {
  it('derives initials from first and last word', () => {
    expect(initialsOf('Anselma Marak')).toBe('AM');
    expect(initialsOf('Kiro')).toBe('KI');
  });

  it('never renders blank — an unnameable actor still shows something', () => {
    expect(initialsOf('   ')).toBe('?');
    render(<Avatar name="Anselma Marak" />);
    expect(screen.getByLabelText('Anselma Marak')).toHaveTextContent('AM');
  });
});

describe('Dialog', () => {
  it('renders with role=dialog and closes on Escape and on scrim click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="Reopen parent?" onClose={onClose}>
        body
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Reopen parent?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('dialog-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} title="Hidden" onClose={() => {}}>
        body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * 13.643 — the dismiss control is named `Close dialog`, so a body button that
   * says "Close" stays the only thing that name finds.
   *
   * The control's VISIBLE text is `×`, so its accessible name is whatever the
   * `aria-label` says and nothing in a screenshot or a `getByText` can tell the
   * two spellings apart — which is exactly how the collision survived until a
   * feature put a plain "Close" button (spec §5.3, the ticket sheet's Close) in
   * a dialog's body. Both the exact-name assertion and the unscoped
   * `getByRole('button', { name: 'Close' })` are load-bearing: the first pins
   * the new spelling, and the second is the one that threw "found multiple
   * elements" under the old one, so it is the assertion that FAILS for the
   * defect rather than merely describing the fix.
   */
  it('13.643 the dismiss control is named "Close dialog", leaving a body "Close" unambiguous', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onBodyClose = vi.fn();
    render(
      <Dialog open title="Close 2 tickets" onClose={onClose}>
        <button type="button" onClick={onBodyClose}>
          Close
        </button>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    // Exactly one — the body's own.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveTextContent('Close');

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBodyClose).not.toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  it('is a labelled dialog panel with a close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet open title="GST registration" onClose={onClose}>
        body
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'GST registration' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Table', () => {
  type Row = { id: string; title: string };
  const columns: TableColumn<Row>[] = [
    { id: 'title', header: 'Title', cell: (row) => row.title },
  ];

  it('renders headers and cells, and row clicks fire', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <Table
        columns={columns}
        rows={[{ id: 't1', title: 'File the GST return' }]}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    await user.click(screen.getByText('File the GST return'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 't1', title: 'File the GST return' });
  });
});

/**
 * 13.706 — `Table`'s per-row hook (second wave Task 4, spec §8.1).
 *
 * `rowClassName` (Ruling 21) can only say ONE class for EVERY row, and the
 * List's drag plumbing needs a fact about a row — `draggable`, the four drag
 * handlers, and a class that names which row is being dragged or hovered.
 * `rowProps` is that hook.
 *
 * **The composition rule is the whole of this case, and the negative is why.**
 * A hook that REPLACED `className` would take `gn-table__row` off a row the
 * moment a caller passed anything, and the shared stylesheet keys on that
 * class — a silently unstyled row, not an override. So the extra class is
 * APPENDED, in the same `[own, extra].filter(Boolean).join(' ')` shape
 * `Card` has used since `card.tsx:7` and Ruling 21 applied to the rest of
 * this component's hooks. The order assertion (the caller's class last) is
 * what makes "appended" a claim this case can fail on rather than a synonym
 * for "present".
 */
describe('13.706 the Table row hook appends a className and spreads per-row attributes', () => {
  type Row = { id: string; title: string };
  const columns: TableColumn<Row>[] = [{ id: 'title', header: 'Title', cell: (row) => row.title }];
  const oneRow: Row[] = [{ id: 't1', title: 'File the GST return' }];

  function bodyRow(): HTMLTableRowElement {
    const tr = screen.getByText('File the GST return').closest('tr');
    if (tr === null) throw new Error('no <tr> for the row');
    return tr;
  }

  it('a data-* attribute lands on the <tr>, and a caller className is APPENDED to the built-ins rather than replacing them', () => {
    render(
      <Table
        columns={columns}
        rows={oneRow}
        rowKey={(row) => row.id}
        rowClassName="gn-list__table-row"
        rowProps={(row) => ({ 'data-row': row.id, className: 'gn-list__row--dragging' })}
      />,
    );
    const tr = bodyRow();
    expect(tr).toHaveAttribute('data-row', 't1');
    // Presence of all three is what kills "the caller's className replaced the
    // built-ins" — the mutant would leave `gn-list__row--dragging` alone on the
    // element and both of these would fail.
    expect(tr).toHaveClass('gn-table__row', 'gn-list__table-row', 'gn-list__row--dragging');
    // Order, not just presence: APPENDED means the caller's class comes last.
    expect(tr.getAttribute('class')?.split(' ').at(-1)).toBe('gn-list__row--dragging');
  });

  it('CONTROL: with no rowProps the <tr> carries no caller attribute at all, and rowClassName still applies', () => {
    render(
      <Table
        columns={columns}
        rows={oneRow}
        rowKey={(row) => row.id}
        rowClassName="gn-list__table-row"
      />,
    );
    const tr = bodyRow();
    expect(tr).not.toHaveAttribute('data-row');
    expect(tr).toHaveClass('gn-table__row', 'gn-list__table-row');
  });
});

describe('SegmentedControl (13.288)', () => {
  it('13.288 renders role=tablist with one role=tab per option and aria-selected on exactly the chosen one', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Sign-in method"
        value="email"
        onChange={onChange}
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'email', label: 'Email link' },
        ]}
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Sign-in method' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    // `!` because this repo runs `noUncheckedIndexedAccess`, so an index into
    // `getAllByRole`'s array is `HTMLElement | undefined`. The plan's literal
    // spelling typechecks nowhere in this tree, and `pnpm vitest run` cannot
    // see it — only the gate's `typecheck` task does. The length assertion two
    // lines up is what makes the `!` honest.
    const [phoneTab, emailTab] = [tabs[0]!, tabs[1]!];
    expect(phoneTab).toHaveAttribute('aria-selected', 'false');
    expect(emailTab).toHaveAttribute('aria-selected', 'true');
    expect(emailTab).toHaveClass('gn-segmented__item--on');
    expect(phoneTab).not.toHaveClass('gn-segmented__item--on');
    await userEvent.click(phoneTab);
    expect(onChange).toHaveBeenCalledWith('phone');
  });
});

// Not `new URL('../src/ui.css', import.meta.url)` (the plan's literal spelling):
// Vite statically rewrites that exact pattern into a dev-server asset URL, so
// under Vitest the base arrives as `http://localhost:3000/@fs/...` and
// `fileURLToPath` throws "The URL must be of scheme file" (see
// `test/helpers/colour-scan.ts`'s identical note). Resolving the path after
// converting `import.meta.url` on its own avoids the rewrite.
const UI_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui.css'), 'utf8');
/**
 * The OTHER stylesheet a rule for any of these classes could hide in.
 * `apps/web/app/layout.tsx` imports `ui.css` and then `globals.css`, so a rule
 * appended there WINS at equal specificity — which is why a "no style forks
 * this" scan over `ui.css` alone is a check that cannot fail. Case 13.893
 * (`attention-styling.test.ts:44-49`) reached the same conclusion for its own
 * class and scans both; 16.83 does the same.
 */
const GLOBALS_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/app/globals.css'),
  'utf8',
);
const rule = (selector: string): string => {
  const m = UI_CSS.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`no rule for ${selector}`);
  const body = m[1];
  // `RegExpMatchArray` is typed as `Array<string>`, not a tuple, so
  // `noUncheckedIndexedAccess` (this repo's own tsconfig) types `m[1]` as
  // `string | undefined` regardless of the regex's own single capture group
  // — TS has no way to know the group index exists from the pattern alone.
  // At RUNTIME `body` is always defined once `m` itself is non-null (the
  // pattern's one group, `([^}]*)`, matches at minimum the empty string), so
  // this can never actually throw against real CSS — but it is what turns
  // the return type into a real `string` rather than `string | undefined`,
  // so every call site (this one included) gets a genuine "selector vanished"
  // failure instead of an undefined-dereference two lines away. A `!`/`as
  // string` here would silence the compiler without that guarantee.
  if (body === undefined) throw new Error(`no rule body captured for ${selector}`);
  return body;
};

describe('R1(c) at the component layer', () => {
  /**
   * Any border declaration that actually PAINTS. `-color` and `-radius` are
   * excluded deliberately: a colour with no style and no width paints nothing,
   * and a radius is not a boundary.
   *
   * The plan shipped this as `/border:\s*1px/` for 13.289 and `/\bborder:/` for
   * 13.290, and **both were demonstrated green against a real visible border** —
   * `border: 2px solid …` beside a `border-color: transparent`, and
   * `border-left: 4px solid …` beside the inset shadow. A negative pinned to
   * one spelling of a property is not a negative about the property.
   *
   * The value is checked too, and the first draft of this regex proved why: it
   * matched `border: none` on the base `.gn-button` and went red against a rule
   * that paints nothing. **`none` and `0` are how a rule SAYS there is no
   * border**, so a guard that forbids them forbids the correct answer.
   */
  const PAINTING_BORDER =
    /border(-(top|right|bottom|left))?(-(width|style))?\s*:\s*(?!(none|0)\b)/;

  it('13.289 a ghost button renders as fill and label, with no painting border on either rule', () => {
    // BOTH rules, because what renders is the cascade: `button.tsx` always
    // emits `gn-button gn-button--ghost` together, so a boundary reintroduced
    // on the base would reach the screen while a modifier-only assertion stayed
    // green.
    expect(rule('.gn-button--ghost')).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(rule('.gn-button--ghost')).not.toMatch(PAINTING_BORDER);
    expect(rule('.gn-button')).not.toMatch(PAINTING_BORDER);
  });
  it('13.290 refusal panels carry tone as an inset fill, never a border', () => {
    // ⚠ `.gn-refusal--transport` and `.gn-refusal--editor` were BOTH MISSING
    // from this roster, and a roster that omits members is the shape this repo
    // keeps getting caught by: the property is unenforced for exactly the
    // variants nobody listed, so a future edit that gave one of them a real
    // border would go unnoticed. `--transport` has been absent since Ruling 27
    // added it (2026-09-16); `--editor` was added on 2026-09-19 and its own
    // change set is what put `--transport` back in view. Both pass — this
    // widens the roster to the whole family, it does not relax it.
    for (const s of [
      '.gn-refusal--preview',
      '.gn-refusal--server',
      '.gn-refusal--transport',
      '.gn-refusal--editor',
    ]) {
      const body = rule(s);
      expect(body, s).toMatch(/box-shadow:\s*inset 4px 0 0 var\(--gn-(warning|danger)\)/);
      expect(body, s).not.toMatch(PAINTING_BORDER);
    }
  });
  it('13.291 the field input KEEPS its border — an empty field has no label to identify it', () => {
    expect(rule('.gn-field__input')).toMatch(/border:\s*1px solid var\(--gn-border\)/);
  });

  /**
   * 13.339 — under `data-style="neo"` the empty input renders the sunken,
   * no-border treatment (Task 14 AMENDMENT rule (a), owner ruling 2026-09-09:
   * "pure neo look"). `hig`/`minimal` are UNCHANGED by this rule and keep
   * 13.291's bordered look — the override is scoped to `[data-style="neo"]`.
   *
   * **OWNER-ACCEPTED WAIVER, recorded verbatim (Task 13's measurement, the
   * neo-round ruling item 5): the sunken field's shadow edge measures 1.24
   * (light) / 1.16 (dark) — both below the 3:1 WCAG 1.4.11 floor a non-text
   * boundary owes. The owner reaffirmed "pure neo look" knowing this, so the
   * border is dropped rather than kept as a compromise.** This is the one
   * exemption from the non-text-contrast sweep the ruling authorises — no
   * other selector may drop below 3:1 on this ground.
   *
   * Two positive controls guard against `rule()`'s substring matching: the
   * neo selector and the base selector must read back DIFFERENT bodies (the
   * override selector text contains ".gn-field__input" as a substring, so a
   * regex bug could silently re-match the base rule and pass either way), and
   * `border: none` — not merely "no border declaration" — is the asserted
   * value, because the base rule's `border: 1px solid var(--gn-border)` would
   * otherwise cascade in and still paint.
   */
  it('13.339 under neo the field input is sunken and borderless — hig/minimal keep their border', () => {
    const base = rule('.gn-field__input');
    const neo = rule('[data-style="neo"] .gn-field__input');
    expect(neo, 'the neo override must be a distinct rule, not a re-match of the base').not.toBe(base);
    expect(base).toMatch(/border:\s*1px solid var\(--gn-border\)/);
    expect(neo).toMatch(/border:\s*none/);
    expect(neo).toMatch(/background:\s*var\(--gn-surface-sunken\)/);
    expect(neo).toMatch(/box-shadow:\s*var\(--gn-shadow-sunken\)/);
  });

  /**
   * 10.80 — `neo` gives `surface`/`surfaceRaised`/`surfaceSunken` the SAME
   * flat hex (`tokens.ts`'s `neoPaper`), so a "sunken" element with no shadow
   * of its own is indistinguishable from the raised surface around it —
   * exactly the gap found in `.ticket-type-list__row` and `.fields-editor__
   * row` (owner, 2026-09-10: "the text boxes... colours seem to be too
   * bright... the feel of the neumorphic elements is greatly diminished").
   * Pinned the same shape 13.339 already pins for `.gn-field__input`, so a
   * future edit that drops either override reddens here rather than only
   * being visible by eye against the running app.
   */
  it('10.80 the ticket-type row and field row are pressed-in under neo, not merely coloured', () => {
    for (const selector of ['.ticket-type-list__row', '.fields-editor__row']) {
      const base = rule(selector);
      const neo = rule(`[data-style="neo"] ${selector}`);
      expect(neo, `${selector}: the neo override must be a distinct rule, not a re-match of the base`).not.toBe(
        base,
      );
      expect(base, selector).toMatch(/background:\s*var\(--gn-surface-sunken\)/);
      expect(neo, selector).toMatch(/box-shadow:\s*var\(--gn-shadow-sunken\)/);
    }
  });

  /**
   * 16.83 — the ticket-type list's ↑/↓ reorder control.
   *
   * ## The defect this exists to keep closed
   *
   * `button.ticket-type-list__move` had NO RULE OF ITS OWN. Not "styled badly" —
   * the class appeared in `ui.css` and in `globals.css` zero times each, against a
   * positive control of `.ticket-type-list__row` in the same sweep. Two rules of no
   * class did reach it (`* { box-sizing }`, `button { font: inherit }`); the rest was
   * Chromium on the live stack measuring raw user-agent chrome: `border: 2px outset`,
   * `background: rgba(239,239,239,0.3)`, `border-radius: 0px`,
   * `font-weight: 400`, `28.2 × 29.2`. **A case asserting "it looks right" could
   * not have been written against that**, which is why the first assertion below
   * is the plain one: the rule must EXIST. That is the assertion that was
   * missing, and a class with no rule is invisible to every instrument that
   * measures a property rather than a presence.
   *
   * ## Why the rest is shape-pinned rather than colour-pinned
   *
   * The fill, the label and the radius are all ROLES, and the prototype's own
   * three styles resolve those roles differently at the token layer
   * (`fillWarmHig3`/`fillWarmNeo3`, `radii.hig.control`/`radii.neo.control`).
   * Measured in Chromium, this one unconditional rule therefore renders
   * `hig`/`minimal` at `rgba(39,58,99,0.11)` + 8px and `neo` at
   * `rgba(176,152,132,0.16)` + 14px — **the three styles for free, with no
   * `[data-style]` block.** The scan at the end asserts no such block exists, so
   * a future edit cannot quietly fork the control per style; that is 13.340's
   * argument applied to this control, and it is the POSITIVE half here for the
   * same reason it is there.
   *
   * ## The size is a RECORDED divergence, and it is pinned so it stays recorded
   *
   * The prototype draws `min-height:32px; min-width:36px` (`desktop.dc.html:3152`,
   * the shared control constant, byte-equal to the one `.gn-board-card__move`
   * was ported from at `:2501`). This rule takes **2.75rem — 44px** — because
   * `apps/web/e2e-viewport/tap-targets.ts:108` sweeps every `button` against a
   * hard 44px floor with no per-component exemption, which is the same
   * divergence, for the same reason, that control already made. Asserted rather
   * than merely commented: a re-transcription of the prototype's 32px is the
   * most likely future edit here, and it is the one that reddens the viewport
   * suite rather than this one.
   *
   * **It does NOT settle the owner's 2026-09-20 24px-dense-in-list ruling**, and
   * deliberately so — that ruling's second half is a WIDER checker that does not
   * exist yet, so a case pinning 24 here would be pinning a floor nothing
   * enforces. The open question is named in `ui.css`'s own block.
   */
  it('16.83 the reorder control has a rule at all, carries the shared control roles, and forks for no style', () => {
    const body = rule('.ticket-type-list__move');

    // The rule EXISTS — the whole defect. Every assertion below is about a class
    // that rendered as UA chrome precisely because this one was false.
    expect(body).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(body).toMatch(/color:\s*var\(--gn-text-accent\)/);
    expect(body).toMatch(/border-radius:\s*var\(--gn-radius-control\)/);
    expect(body).toMatch(/border:\s*none/);

    // The recorded 44px divergence, on BOTH axes, so the prototype's 36px
    // width is pinned too and not only its 32px height.
    expect(body).toMatch(/min-height:\s*2\.75rem/);
    expect(body).toMatch(/min-width:\s*2\.75rem/);
    expect(body).not.toMatch(/min-(height|width):\s*(32|36)px/);

    // The prototype's OWN disabled number for this control (`:3161-3162`),
    // not `.gn-button`'s generic 0.55 — the distinction it shares with
    // `.gn-board-card__move:disabled`.
    expect(rule('.ticket-type-list__move:disabled')).toMatch(/opacity:\s*0\.4/);

    // The pair sits BESIDE the row door, which is what the component's own
    // comment claims and what nothing honoured while `<li>` was
    // `display: list-item`: the row is `width: 100%`, so the pair rendered on
    // its own line ABOVE the row (measured: pair top 205.7, row top 234.8).
    expect(rule('.ticket-type-list__rows li')).toMatch(/display:\s*flex/);

    // 13.340's positive scan, for this control: one unconditional rule IS the
    // whole story, in every style.
    //
    // ⚠ OVER BOTH STYLESHEETS, and the second one is the one that WINS.
    // `apps/web/app/layout.tsx` imports `@gisik-nokma/ui/ui.css` and then
    // `./globals.css`, so a `[data-style]` override appended to `globals.css`
    // beats anything here at equal specificity. A scan of `ui.css` alone
    // therefore passes while the rendered control is forked — **measured, not
    // reasoned: a reviewer planted exactly that rule in `globals.css` against the
    // first version of this case and it stayed GREEN.** Case 13.893
    // (`attention-styling.test.ts:44-49`) records the identical gap and closed it
    // the same way; this case re-introduced it and now closes it too.
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const styleBlocks = [...css.matchAll(/\[data-style="[a-z]+"\][^{]*\{([^}]*)\}/g)];
      if (name === 'ui.css') {
        expect(
          styleBlocks.length,
          'the scan found no [data-style] block in ui.css at all — it is reading nothing',
        ).toBeGreaterThan(0);
      }
      for (const [fullMatch] of styleBlocks) {
        expect(fullMatch, `${name}: ${fullMatch}`).not.toMatch(/\.ticket-type-list__move\b/);
      }
    }

    // …AND THE BODY MUST BE DECLARED EXACTLY ONCE ACROSS BOTH, because every
    // assertion above goes through `rule()`, which answers the FIRST match only.
    // This block is appended at EOF precisely so that future edits land AFTER it,
    // so the most likely edit is one that beats `rule()`'s answer while leaving
    // every colour assertion green — **also measured: a reviewer appended a second
    // `.ticket-type-list__move { background: … }` at EOF and this case stayed
    // GREEN.** 13.893 generalises the same property for the same reason ("`ruleFor`
    // answers the FIRST rule for a name, so a later duplicate would beat the colour
    // this file pins while every assertion above stayed green").
    for (const [name, css] of [
      ['ui.css', UI_CSS],
      ['globals.css', GLOBALS_CSS],
    ] as const) {
      const decls = [...css.matchAll(/^\.ticket-type-list__move\s*\{/gm)];
      expect(
        decls.length,
        `${name} declares .ticket-type-list__move as a rule of its own ${decls.length} time(s)`,
      ).toBe(name === 'ui.css' ? 1 : 0);
    }
  });

  /**
   * 13.340 — ghost/secondary controls keep fill + accent label as their
   * identifying signal in EVERY style, never a style-specific override that
   * strips it back to a boundary (or to nothing). 13.289 already pins this for
   * the unconditional base/ghost rules; this case is the POSITIVE scan that no
   * `[data-style="…"]` block anywhere in `ui.css` touches `.gn-button` at all
   * — so there is no style-specific path for a fill/label removal to hide in,
   * and 13.289's unconditional assertion is the whole story for every style.
   *
   * Mutation: add a `[data-style="neo"] .gn-button { background: none; }` (or
   * similar) block → this reddens, naming the style, without touching 13.289.
   */
  it('13.340 no [data-style] block overrides .gn-button in any style — 13.289 covers every style alone', () => {
    const styleBlocks = [...UI_CSS.matchAll(/\[data-style="[a-z]+"\][^{]*\{([^}]*)\}/g)];
    expect(styleBlocks.length, 'the scan found no [data-style] block at all — it is reading nothing').toBeGreaterThan(0);
    for (const [fullMatch] of styleBlocks) {
      expect(fullMatch, fullMatch).not.toMatch(/\.gn-button\b/);
    }
  });
});

describe('Select panel/option styling', () => {
  // NOTE: selectors below are passed RAW (unescaped), matching every other
  // call site of `rule()` in this file (e.g. 13.339's
  // `rule('[data-style="neo"] .gn-field__input')`) — `rule()` already
  // regex-escapes its argument internally
  // (`selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`), and that escape
  // class includes the backslash character itself. Pre-escaping the
  // selector here (`\\[`, `\\]`, `\\.`) double-escapes it into a pattern
  // that requires a literal backslash in the stylesheet text and can never
  // match real CSS — verified empirically (a raw string matches, a
  // pre-escaped one does not) before writing these.
  it('the neo panel gets shadow-only elevation, matching the row-shadow precedent', () => {
    expect(rule('[data-style="neo"] .gn-select__panel')).toMatch(/box-shadow:\s*var\(--gn-shadow-raised\)/);
  });

  it('the active/focused option row uses a focus-ring outline, not a background-fill misuse of focusRing', () => {
    expect(rule('.gn-select__option[data-focused]')).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)/);
  });

  it('the option row background is the shared surface token, not a bespoke color', () => {
    expect(rule('.gn-select__panel')).toMatch(/background:\s*var\(--gn-surface(-raised)?\)/);
  });
});

/**
 * Case 13.464 — board-prototype-port Task 6, Ruling 17 (coordinator, 2026-09-16).
 *
 * `.gn-board-card`'s own literal `border-radius: 0.75rem` (12px) had the SAME
 * specificity as `.gn-card`'s (`(0,1,0)` both) and sat later in this file, so
 * it won on source order for EVERY style — pinning every board card at 12px
 * where `neo` should draw `.gn-card`'s own `--gn-radius-card` token at 20px
 * (`tokens.ts:798-801`). This is the exact shape case 13.355 already fixed
 * one surface over (`apps/web/test/neo-card-radius.test.ts`, `.gn-card.gn-invite`'s
 * literal radius tying `.gn-card`'s token) — same SHAPE of guard, mirrored
 * here rather than reinvented, but a different FILE under test: 13.355 scans
 * `apps/web/app/globals.css` because that is where `.gn-card.gn-invite` lives;
 * `.gn-board-card` is a `ui.css` selector, so this case scans `ui.css` via
 * this file's own `rule()` helper, not `globals.css`. Assert the rule STILL
 * EXISTS (it carries real padding, unlike the deleted
 * `.gn-card.gn-invite` rule 13.355 covers), and assert its body carries no
 * `border-radius` of its own, so the board card falls through to `.gn-card`'s
 * token and moves with the style axis like every other card.
 */
describe('13.464 — the board card declares no border-radius of its own (Ruling 17)', () => {
  it('.gn-board-card keeps its own padding rule but sets no border-radius', () => {
    const body = rule('.gn-board-card');
    expect(body, `.gn-board-card rule: ${body}`).toMatch(/padding:\s*0\.875rem/);
    expect(
      body.includes('border-radius'),
      `.gn-board-card reintroduced a literal radius that would out-specify nothing and tie .gn-card's by source order — ${body}`,
    ).toBe(false);
  });

  /*
   * MUTATION WITNESS. Planting exactly the regression this case exists to
   * catch — reintroducing a literal `border-radius` on `.gn-board-card` —
   * must redden the assertion above.
   */
  it('a planted literal border-radius on .gn-board-card is caught', () => {
    const mutated = UI_CSS.replace(
      '.gn-board-card { padding: 0.875rem; }',
      '.gn-board-card { padding: 0.875rem; border-radius: 0.75rem; }',
    );
    expect(
      mutated,
      'the clean baseline line was not found in ui.css — has .gn-board-card changed?',
    ).not.toBe(UI_CSS);
    const m = mutated.match(/\.gn-board-card\s*\{([^}]*)\}/);
    // Real narrowing, not a vitest assertion followed by an unguarded access:
    // `expect(m).not.toBeNull()` does not narrow `m`'s TYPE for TypeScript
    // (control-flow narrowing only follows `if`/`throw`, not a matcher call),
    // so the line below it would still see `m: RegExpMatchArray | null` and
    // `m[1]: string | undefined` under this repo's `noUncheckedIndexedAccess`
    // — exactly the shape that produced TS2532 here originally. Throwing (not
    // `!`/`as string`) makes both the type AND the failure mode honest: a
    // mutation that stops matching fails loudly at this line, naming what
    // broke, rather than satisfying the compiler while leaving a later
    // undefined-dereference for the wrong line to report.
    if (!m) throw new Error('planted literal mutation did not produce a matchable .gn-board-card rule');
    const body = m[1];
    if (body === undefined) throw new Error('matched .gn-board-card rule captured no body');
    expect(body.includes('border-radius')).toBe(true);
  });
});

/**
 * Case 13.513 — board-prototype-port Task 14, 2026-09-16. The spec's Board
 * metrics table "Card" row names `cursor:grab`; this task adds it beside the
 * drag-and-drop behaviour that makes it true (Ruling 15, cited at length in
 * `ui.css`'s own comment immediately above this selector). A CSS-binding
 * gate, the same shape `inbox-css-binding.test.tsx` already uses for
 * `gn-timeline__bar`: this only proves the RULE exists with the right body,
 * never that the class is wired onto anything real — `board-drag-drop.test.tsx`'s
 * own `13.512` is what proves `draggable="true"` (and therefore this
 * selector's match) tracks the `moves` capability rather than being always
 * on or always off.
 */
describe('13.513 — the drag cursor is keyed off the real draggable attribute, not a second class', () => {
  it('.gn-board__card-slot[draggable="true"] sets cursor: grab', () => {
    expect(rule('.gn-board__card-slot[draggable="true"]')).toMatch(/cursor:\s*grab/);
  });
});

/**
 * Case 13.523 — the whole card opens the ticket (owner request, 2026-09-17;
 * `board-card-click.test.tsx` proves the behaviour). The read-only board —
 * no `moves`, so no `draggable="true"` and no grab cursor — still needs the
 * card body to LOOK clickable now that it is. The bare `.gn-board__card-slot`
 * rule carries `cursor: pointer`; the `[draggable="true"]` rule above beats
 * it on specificity ((0,2,0) over (0,1,0)) so a draggable card keeps `grab`.
 * Same CSS-binding shape as `13.513`; `rule()`'s regex requires `\s*{`
 * straight after the selector text, so the two rules cannot be confused for
 * one another.
 */
describe('13.523 — a card that can be opened but not dragged still shows a pointer', () => {
  it('.gn-board__card-slot sets cursor: pointer, and the draggable rule keeps grab', () => {
    expect(rule('.gn-board__card-slot')).toMatch(/cursor:\s*pointer/);
    expect(rule('.gn-board__card-slot[draggable="true"]')).toMatch(/cursor:\s*grab/);
  });
});

/**
 * Case 13.551 — exclude-mode spec §4 (2026-09-17; fix round 1, same date,
 * dropped the `.gn-visually-hidden` case: the utility it gated was written
 * for a naming mechanism — a visible label span plus a sibling
 * visually-hidden suffix span — that measured RED and was replaced by
 * `aria-label` before Task 8 shipped; the CSS rule was cut alongside it as
 * YAGNI, so there is nothing left here to bind). CSS binding for the
 * tri-state choice and the strip's exclude chip: the three states are told
 * apart by ground + glyph + strike, never by colour alone. Same shape as
 * `13.513`/`13.523`: proves the rules exist with the right bodies, not that
 * they are wired — `apps/web/test/tri-state-choice.test.tsx` proves the
 * `data-mode` attribute these selectors key off.
 */
describe('13.551 — tri-state choice rules', () => {
  it("include is the accent ground with accent text", () => {
    const body = rule(".gn-filters__choice[data-mode='include']");
    expect(body).toMatch(/background:\s*var\(--gn-accent\)/);
    expect(body).toMatch(/color:\s*var\(--gn-accent-text\)/);
  });
  it('exclude strikes the LABEL through and does not reach for the danger tone', () => {
    const body = rule(".gn-filters__choice[data-mode='exclude'] .gn-filters__choice-label");
    expect(body).toMatch(/text-decoration:\s*line-through/);
    expect(rule(".gn-filters__choice[data-mode='exclude']")).not.toMatch(/--gn-danger/);
  });
  it('the row variant keeps the 44px floor', () => {
    expect(rule('.gn-filters__choice--row')).toMatch(/min-height:\s*2\.75rem/);
  });
  it('an excluded person row keeps the ROW ground, not the chip-level exclude ground (spec §4)', () => {
    expect(rule(".gn-filters__choice[data-mode='exclude']")).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(rule(".gn-filters__choice--row[data-mode='exclude']")).toMatch(/background:\s*var\(--gn-fill-quaternary\)/);
  });
});

/**
 * 13.900 — `Switch` and `InfoTip`, the two primitives the 2026-09-18 restyle
 * added to this package.
 *
 * These are the COMPONENT halves. `tokens.test.ts`'s 13.899 proves the CSS is
 * one rule set and that the two states differ; `apps/web/test/settings-page
 * .test.tsx`'s 13.895–13.897 prove the two screens wire them the way their
 * docblocks claim. Neither half is sufficient alone — the same split
 * `settings-page.test.tsx`'s own docblock records for `AppNav`/`LastProjectNav`.
 */
describe('13.900 — Switch', () => {
  it('is a real checkbox named by the label it wraps, so getByLabelText resolves to it', () => {
    render(
      <Switch checked onChange={() => {}}>
        Close tickets automatically
      </Switch>,
    );
    const control = screen.getByLabelText('Close tickets automatically');
    expect(control).toBeInstanceOf(HTMLInputElement);
    expect(control).toHaveAttribute('type', 'checkbox');
    expect(control).toHaveClass('gn-switch');
    expect(control).toBeChecked();
  });

  it('hands the caller the NEXT state, not the event', async () => {
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange}>
        Auto-close
      </Switch>,
    );
    await userEvent.click(screen.getByLabelText('Auto-close'));
    // The boolean, not a `ChangeEvent` — a caller that has to reach through
    // `event.target` is the shape `SegmentedControl` already avoids.
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps the caller\'s className alongside its own row class, and passes disabled through', () => {
    render(
      <Switch checked={false} onChange={() => {}} disabled className="gn-account__notification-row">
        A row label
      </Switch>,
    );
    // Both classes, which is what lets `/account` keep its own row layout
    // (full-width, edge-aligned) without a second switch implementation.
    expect(screen.getByLabelText('A row label').closest('label')).toHaveClass(
      'gn-switch-row',
      'gn-account__notification-row',
    );
    // The label still names the disabled control, which is the whole reason
    // the DOM keeps a real input rather than a `role="switch"` div.
    expect(screen.getByLabelText('A row label')).toBeDisabled();
  });
});

describe('13.900 — InfoTip', () => {
  it('is closed to begin with, naming its button for what it explains', () => {
    render(
      <InfoTip label="About Stale after">Tickets sat too long are called out as Stale.</InfoTip>,
    );
    const trigger = screen.getByRole('button', { name: 'About Stale after' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('opens on hover, on focus and on click, and Escape closes it', async () => {
    render(<InfoTip label="About Stale after">Tickets sat too long are called out as Stale.</InfoTip>);
    const trigger = screen.getByRole('button', { name: 'About Stale after' });
    const panelText = 'Tickets sat too long are called out as Stale.';

    await userEvent.hover(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent(panelText);
    await userEvent.unhover(trigger);
    expect(screen.queryByRole('note')).toBeNull();

    // FOCUS — the keyboard path, and the one hover cannot cover.
    act(() => trigger.focus());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();

    // CLICK — and this one is not redundant. `onClick` deliberately OPENS
    // rather than toggling, because a click focuses the button first, so a
    // toggling handler would read the state `onFocus` had just set and close
    // the panel again: a click that appears to do nothing. That defect is
    // exactly what this line catches.
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note')).toHaveTextContent(panelText);
  });
});
