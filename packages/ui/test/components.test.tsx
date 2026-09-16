import { render, screen, within } from '@testing-library/react';
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
import { SegmentedControl } from '../src/components/segmented-control.js';
import { Sheet } from '../src/components/sheet.js';
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
    await user.click(screen.getByRole('button', { name: 'Close' }));
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
const rule = (selector: string) => {
  const m = UI_CSS.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
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
    for (const s of ['.gn-refusal--preview', '.gn-refusal--server']) {
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
 * one surface over (`neo-card-radius.test.ts`, `.gn-card.gn-invite`'s literal
 * radius tying `.gn-card`'s token) — mirrored here rather than reinvented:
 * assert the rule STILL EXISTS (it carries real padding, unlike the deleted
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
    expect(mutated).not.toBe(UI_CSS); // the replace actually found and changed the target line
    const m = mutated.match(/\.gn-board-card\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m?.[1].includes('border-radius')).toBe(true);
  });
});
