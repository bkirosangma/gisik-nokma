import { expect, test } from '@playwright/test';

/**
 * F-10 case 23.352 (LOCAL, against the built dev stack at :3001): on `/sign-in` the hint sentence stands clear of the email field above it
 * and of the primary below it, in every style. Source half: `apps/web/test/sign-in-hint-clearance.test.ts` (23.350, 23.351).
 *
 * Measured before the fix, at 1933a073, in hig and neo alike: field bottom 305.3 = hint top, hint bottom 351.7 = primary top, so 0px on
 * both sides. The primary's halo is `--gn-halo`: 14px in neo, 8px in hig and minimal (`halo` in `packages/ui/src/tokens.ts`).
 */
for (const style of ['hig', 'minimal', 'neo'] as const) {
  test(`23.352 ${style}: the sign-in hint clears the field by the 8px spacing step and the primary by at least its halo`, async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'networkidle' });
    await page.evaluate((s) => {
      document.documentElement.dataset['style'] = s;
      document.documentElement.dataset['theme'] = 'light';
    }, style);
    const box = async (selector: string) => {
      const b = await page.locator(selector).first().boundingBox();
      expect(b, `control: ${selector} is on the page`).not.toBeNull();
      return b!;
    };
    const field = await box('.gn-sign-in__method-form .gn-field__input');
    const hint = await box('.gn-sign-in__method-form .gn-sign-in__hint');
    const primary = await box('.gn-sign-in__method-form .gn-button--primary');
    const halo = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gn-halo')));
    expect(halo, `control: --gn-halo resolves for ${style} (neo 14, hig/minimal 8)`).toBe(style === 'neo' ? 14 : 8);

    const above = hint.y - (field.y + field.height);
    const below = primary.y - (hint.y + hint.height);
    expect(above, `${style}: hint top ${hint.y} vs field bottom ${field.y + field.height}`).toBeGreaterThanOrEqual(8);
    expect(below, `${style}: primary top ${primary.y} vs hint bottom ${hint.y + hint.height}, halo ${halo}`).toBeGreaterThanOrEqual(halo);
    console.log(`23.352 ${style}: field->hint ${above.toFixed(1)}px, hint->primary ${below.toFixed(1)}px (halo ${halo}px)`);
  });
}
