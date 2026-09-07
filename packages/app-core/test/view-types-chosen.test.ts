import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUPING,
  DEFAULT_LIST_COLUMNS,
  DEFAULT_VIEW_PREFS,
  type Chosen,
} from '../src/view-types.js';

/**
 * 3.66's type half. `@ts-expect-error` is the load-bearing trick: it makes a TYPE
 * property fail an ordinary `tsc` pass with no vitest typecheck mode and no
 * `expectTypeOf` (both of which erase at runtime and would pass unconditionally here).
 * The directive is only legal while the error it names is real — widen `Chosen<T>`'s
 * default arm to carry a `value` and this line becomes TS2578, "unused
 * @ts-expect-error", naming this file. That is the same signature the row records for
 * its own planted defect.
 */
function readsTheDefaultArmsValue(chosen: Chosen<string[]> & { origin: 'default' }): unknown {
  // @ts-expect-error - the default arm of Chosen<T> must not carry a value: code has to
  // narrow on origin === 'stored' first, so `prefs.columns ?? DEFAULT` cannot compile.
  return chosen.value;
}

describe("Chosen<T>'s default arm, and the constant that states neither half was chosen", () => {
  /**
   * 3.66 — the runtime half, which the row did not previously have. `DEFAULT_VIEW_PREFS`
   * says "the user chose nothing"; it is deliberately NOT the stock constants. Fusing the
   * two is the historical bug the type exists to prevent — a default read back as if it
   * were the user's own choice — and it would leave every type assertion above still green.
   */
  it('states neither half was chosen, carrying no value on either', () => {
    expect(DEFAULT_VIEW_PREFS.columns.origin).toBe('default');
    expect(DEFAULT_VIEW_PREFS.grouping.origin).toBe('default');
    expect('value' in DEFAULT_VIEW_PREFS.columns).toBe(false);
    expect('value' in DEFAULT_VIEW_PREFS.grouping).toBe(false);
  });

  /**
   * 3.66 — the positive control for the case above. Without it, "the default carries no
   * value" would also pass if the stock constants were themselves empty or absent, which
   * is a check that cannot fail rather than a statement about the two being distinct.
   */
  it('keeps the stock stand-ins real and separate, so the absence above means something', () => {
    expect(DEFAULT_LIST_COLUMNS.length).toBeGreaterThan(0);
    expect(DEFAULT_GROUPING).toBe('epic');
    expect(readsTheDefaultArmsValue({ origin: 'default' })).toBeUndefined();
  });
});
