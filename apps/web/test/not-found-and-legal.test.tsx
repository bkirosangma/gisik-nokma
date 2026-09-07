import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import NotFound from '../app/not-found.js';
import PrivacyPolicy from '../app/privacy/page.js';
import Terms from '../app/terms/page.js';

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
  it('13.251 carry bracketed placeholders rather than invented party details', () => {
    const { container: privacy } = render(<PrivacyPolicy />);
    const privacyText = privacy.textContent ?? '';
    for (const placeholder of ['[ENTITY NAME]', '[JURISDICTION]', '[CONTACT EMAIL]']) {
      expect(privacyText).toContain(placeholder);
    }

    const { container: terms } = render(<Terms />);
    const termsText = terms.textContent ?? '';
    for (const placeholder of ['[ENTITY NAME]', '[JURISDICTION]']) {
      expect(termsText).toContain(placeholder);
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
