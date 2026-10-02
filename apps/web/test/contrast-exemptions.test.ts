import { describe, expect, it } from 'vitest';
import { CONTRAST_EXEMPT, splitByExemption } from '../e2e-stack/helpers/contrast-exemptions';

type Row = readonly [string, { ratio: number }];
const row = (selector: string, ratio: number): Row => [selector, { ratio }];

describe('13.1730 the non-text-contrast roster exempts nav.gn-bottom-bar and nothing else', () => {
  it('names exactly one selector, with the owner’s reason verbatim', () => {
    expect(Object.keys(CONTRAST_EXEMPT)).toEqual(['nav.gn-bottom-bar']);
    expect(CONTRAST_EXEMPT['nav.gn-bottom-bar']).toBe(
      'container, not a control; its items carry their own >=3:1 cues (icon, label, current-item bar)',
    );
  });

  it('the bar at 1.12 is exempt, with its reason', () => {
    const { failing, exempt } = splitByExemption([row('nav.gn-bottom-bar', 1.12)]);
    expect(failing).toEqual([]);
    expect(exempt).toEqual([{ selector: 'nav.gn-bottom-bar', ratio: 1.12, reason: CONTRAST_EXEMPT['nav.gn-bottom-bar'] }]);
  });

  it('CONTROL: a planted sub-3:1 control outside the bar still fails, beside the exempt bar in the same call', () => {
    const planted = row('button.planted-low-contrast', 1.4);
    const { failing, exempt } = splitByExemption([row('nav.gn-bottom-bar', 1.12), planted]);
    expect(failing).toEqual([planted]);
    expect(exempt.map((e) => e.selector)).toEqual(['nav.gn-bottom-bar']);
  });

  it('CONTROL: the exemption does not reach a descendant control of the bar, nor a lookalike signature', () => {
    for (const selector of ['a.gn-bottom-bar__item', 'button.gn-bottom-bar__more', 'nav.gn-bottom-bar.extra', 'div.gn-bottom-bar', 'nav', 'toString', 'constructor']) {
      const r = row(selector, 1.2);
      const { failing, exempt } = splitByExemption([r]);
      expect(failing, selector).toEqual([r]);
      expect(exempt, selector).toEqual([]);
    }
  });
});
