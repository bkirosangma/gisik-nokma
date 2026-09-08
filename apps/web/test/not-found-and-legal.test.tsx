import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The legal pages are server components, but the Back control they now carry is
 * a client one, so the module graph reaches `next/navigation` and needs it
 * stubbed. `back` and `push` are captured rather than merely mocked because
 * 13.322/13.323 assert WHICH of the two was called, and a shared `vi.fn()` that
 * both branches could satisfy would make the fallback branch untestable.
 */
const nav = { back: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

import NotFound from '../app/not-found.js';
import PrivacyPolicy from '../app/privacy/page.js';
import Terms from '../app/terms/page.js';

/**
 * jsdom's `window.history.length` is 1 and read-only through the normal API, so
 * the two branches are driven by redefining the property. `configurable: true`
 * is what lets the next test redefine it again; without it the second call
 * throws and every case after the first would fail for a reason that has
 * nothing to do with what it asserts.
 */
function setHistoryLength(length: number): void {
  Object.defineProperty(window.history, 'length', { value: length, configurable: true });
}

/**
 * Pre-launch checklist items 1–3: the custom 404, the privacy policy and the
 * terms page.
 *
 * The 404 cases are about a claim the page makes; the legal cases are about a
 * claim it must NOT make. The second kind is the reason this file exists at all
 * — see `13.252`.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('the 404, which says WHICH KIND of not-found it cannot rule out', () => {
  it('13.249 names all three causes and refuses to say which one happened', () => {
    render(<NotFound />);

    // The three causes, present together. Asserting one would pass against a
    // page that named only that one — which is the generic 404 this replaces.
    expect(screen.getByText(/address is mistyped/i)).toBeInTheDocument();
    expect(screen.getByText(/page moved/i)).toBeInTheDocument();
    expect(screen.getByText(/exists and is not yours to see/i)).toBeInTheDocument();

    // And the refusal itself, which is the whole point: the server answers the
    // same 404 for "no such thing" and "not yours" so that nobody can probe for
    // which records exist. A page that guessed would undo that.
    expect(screen.getByText(/will not tell you which of the three/i)).toBeInTheDocument();
    expect(screen.getByText(/would let anyone discover which\s+records exist/i)).toBeInTheDocument();
  });

  it('13.250 offers a way out, because an error without a recovery path is half a message', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: /workspaces/i })).toHaveAttribute('href', '/workspaces');
    expect(screen.getByRole('link', { name: /inbox/i })).toHaveAttribute('href', '/inbox');
  });
});

describe('the legal pages', () => {
  /**
   * 13.251 — every slot that must be a placeholder still IS one, asserted by
   * COUNT and not by presence.
   *
   * The first version of this case used `toContain` per placeholder, and a
   * mutation walked straight through it: replacing `[JURISDICTION]` with an
   * invented "Karnataka, India" in the Disputes clause left three other
   * `[JURISDICTION]`s standing, so `toContain` was still satisfied and the suite
   * stayed green. **`toContain` asks whether a placeholder survives ANYWHERE;
   * the property that matters is that NONE of them was filled in.** On a legal
   * page those are very different questions — a real-looking jurisdiction in the
   * clause that decides which court hears a dispute is exactly the sentence
   * somebody would rely on.
   *
   * Counts are the cheap way to ask the real question. They are deliberately
   * brittle: filling a placeholder in reddens this test, and that is correct,
   * because the moment these stop being placeholders is the moment a lawyer must
   * already have reviewed the page. Updating the number is how that gets
   * recorded rather than slipped in.
   */
  it('13.251 carry bracketed placeholders in EVERY slot, counted, not merely present somewhere', () => {
    const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

    // Every placeholder in each page, with the count MEASURED from the rendered
    // output rather than guessed. (The first draft of these numbers was guessed
    // and one was wrong, which this suite caught immediately — an expectation is
    // not a reading.)
    const expected: Array<[string, Record<string, number>]> = [
      [
        'privacy',
        {
          '[ENTITY NAME]': 3,
          '[JURISDICTION]': 1,
          '[CONTACT EMAIL]': 2,
          '[REGISTERED ADDRESS]': 1,
          '[DATE]': 1,
          '[RESPONSE PERIOD]': 1,
          '[SUPERVISORY AUTHORITY]': 1,
        },
      ],
      [
        'terms',
        {
          '[ENTITY NAME]': 3,
          '[JURISDICTION]': 2,
          '[CONTACT EMAIL]': 1,
          '[DATE]': 1,
          '[MINIMUM AGE]': 1,
          '[LIABILITY CAP]': 1,
          '[COURTS/VENUE]': 1,
        },
      ],
    ];

    const rendered: Record<string, string> = {
      privacy: render(<PrivacyPolicy />).container.textContent ?? '',
      terms: render(<Terms />).container.textContent ?? '',
    };

    for (const [page, placeholders] of expected) {
      const text = rendered[page] ?? '';
      for (const [placeholder, n] of Object.entries(placeholders)) {
        expect(count(text, placeholder), `${page}: ${placeholder}`).toBe(n);
      }
      // A control on the method: a bracket-shaped string that is NOT one of ours
      // must count zero, or these numbers are measuring the wrong thing.
      expect(count(text, '[NOT A REAL PLACEHOLDER]'), `${page}: control`).toBe(0);
    }
  });

  /**
   * 13.252 — **the boilerplate warning lives in the source and MUST NOT reach a
   * reader.**
   *
   * The owner's instruction was precise: mark these pages as unreviewed
   * boilerplate *in a code comment, not on the live page*. Both halves matter and
   * they pull in opposite directions, which is exactly the kind of pair that
   * drifts. A live page announcing its own unreliability is worse than useless
   * to somebody trying to read a policy; a file with no marker at all is how an
   * unreviewed policy ships as though a lawyer had seen it.
   *
   * So this asserts BOTH ends against BOTH files: the marker is in the source,
   * and none of its text is in the render. Asserting only the render would pass
   * against a file whose warning somebody deleted; asserting only the source
   * would pass against a page that printed it.
   */
  it('13.252 keep the "not reviewed by a lawyer" marker in the SOURCE and out of the RENDER', () => {
    const pages = [
      { file: 'app/privacy/page.tsx', node: <PrivacyPolicy /> },
      { file: 'app/terms/page.tsx', node: <Terms /> },
    ];

    for (const { file, node } of pages) {
      const source = readFileSync(join(WEB_ROOT, file), 'utf8');
      expect(source, `${file} lost its boilerplate marker`).toContain(
        'NOT REVIEWED BY A LAWYER',
      );
      expect(source, `${file} must name what has to happen before real data`).toContain(
        '[JURISDICTION]',
      );

      const { container } = render(node);
      const rendered = container.textContent ?? '';
      expect(rendered, `${file} leaked its internal marker onto the page`).not.toContain(
        'NOT REVIEWED BY A LAWYER',
      );
      expect(rendered).not.toContain('BOILERPLATE');
      expect(rendered).not.toContain('NOT LEGAL ADVICE');
    }
  });

  it('13.253 state the four things the product does not promise, in the terms themselves', () => {
    render(<Terms />);
    // These are true of the shipped build and are the honest disclosure a user
    // needs. They are asserted here so that a later legal cleanup cannot quietly
    // remove them without a test going red.
    expect(screen.getByText(/does not notify you outside the app/i)).toBeInTheDocument();
    expect(screen.getByText(/does not know whether a linked Google Drive file/i)).toBeInTheDocument();
    expect(screen.getByText(/day is India/i)).toBeInTheDocument();
    expect(screen.getByText(/Parts of it are not built yet/i)).toBeInTheDocument();
  });
});

/**
 * 13.322 / 13.323 — a way back off each legal page.
 *
 * Both pages linked only to EACH OTHER: from the sign-in card a reader could
 * open Terms, cross to Privacy, cross back to Terms, and never reach sign-in
 * again without the browser's own chrome. Owner feedback, 2026-09-08.
 *
 * BOTH BRANCHES ARE ASSERTED, and the second is the one that matters. A control
 * that calls `router.back()` unconditionally is INDISTINGUISHABLE from a correct
 * one on any page opened with history behind it — which is every page a test
 * navigates to and most pages a developer clicks through. It only fails for the
 * reader who opened the link in a new tab, where `back()` is a silent no-op and
 * the page appears frozen. So the fallback case drives `history.length` to 1 and
 * demands `push('/sign-in')`; deleting the guard reddens it and nothing else.
 */
describe('the way back off a legal page', () => {
  beforeEach(() => {
    nav.back.mockClear();
    nav.push.mockClear();
  });

  for (const { id, label, node } of [
    { id: '13.322', label: 'privacy', node: <PrivacyPolicy /> },
    { id: '13.323', label: 'terms', node: <Terms /> },
  ]) {
    it(`${id} ${label} carries a Back control whose accessible name says back to WHERE`, () => {
      setHistoryLength(4);
      render(node);

      // The accessible name, not the visible text: `aria-label` is what a screen
      // reader announces, and "Back" on its own does not say back to where.
      const back = screen.getByRole('button', { name: 'Back to the previous page' });

      // WCAG 2.5.3 Label in Name — the visible word must be CONTAINED in the
      // accessible name, or voice control ("click Back") stops matching it.
      expect(back).toHaveTextContent('Back');
      expect(back.getAttribute('aria-label')).toContain(back.textContent ?? '');

      fireEvent.click(back);
      expect(nav.back).toHaveBeenCalledTimes(1);
      expect(nav.push).not.toHaveBeenCalled();
    });

    it(`${id} ${label}'s Back goes to sign-in when there is no history to go back to`, () => {
      setHistoryLength(1);
      render(node);

      fireEvent.click(screen.getByRole('button', { name: 'Back to the previous page' }));

      // `back()` here would be a silent no-op — the failure mode this branch
      // exists to prevent — so it must NOT have been the call that was made.
      expect(nav.back).not.toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/sign-in');
    });
  }
});
