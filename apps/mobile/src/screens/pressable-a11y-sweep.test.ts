import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sweepPressables } from './pressable-a11y-sweep.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(TEST_DIR, '..');

/**
 * 13.1188 — P28: every pressable under `apps/mobile/src` carries an
 * accessibility role — the real census, not the disputed "all six" the
 * finding claimed. Opened and counted here: `board-screen.tsx` (1),
 * `help-screen.tsx` (1). `app.tsx`, `ticket-screen.tsx`, `editor-web-view.tsx`
 * have none. Total: **2**.
 */
describe('sweepPressables', () => {
  it('flags a pressable with no accessibilityRole at all (negative control)', () => {
    const result = sweepPressables('fixture.tsx', '<TouchableOpacity onPress={onPress}><Text>Go</Text></TouchableOpacity>');
    expect(result).toEqual({ path: 'fixture.tsx', pressableCount: 1, missingRoleCount: 1, ok: false });
  });

  it('passes a pressable that does carry accessibilityRole (positive control)', () => {
    const result = sweepPressables(
      'fixture.tsx',
      '<Pressable accessibilityRole="button" onPress={onPress}><Text>Go</Text></Pressable>',
    );
    expect(result).toEqual({ path: 'fixture.tsx', pressableCount: 1, missingRoleCount: 0, ok: true });
  });

  it('does not let a sibling <Text accessibilityRole> cover for the pressable — the bug a per-file count missed', () => {
    const result = sweepPressables(
      'fixture.tsx',
      '<Text accessibilityRole="text">status</Text><TouchableOpacity onPress={onPress}><Text>Go</Text></TouchableOpacity>',
    );
    expect(result).toEqual({ path: 'fixture.tsx', pressableCount: 1, missingRoleCount: 1, ok: false });
  });

  it('13.1188 — every real pressable under apps/mobile/src carries a role, and the census is exactly 2', () => {
    const files = [
      'app.tsx',
      'editor/editor-web-view.tsx',
      'screens/board-screen.tsx',
      'screens/help-screen.tsx',
      'screens/ticket-screen.tsx',
    ];
    const results = files.map((path) => sweepPressables(path, readFileSync(join(SRC_DIR, path), 'utf8')));
    for (const result of results) {
      expect(result.ok).toBe(true);
    }
    const totalPressables = results.reduce((sum, r) => sum + r.pressableCount, 0);
    expect(totalPressables).toBe(2);
  });
});
