import { afterEach, describe, expect, it } from 'vitest';
import { readSemantic, SEMANTIC_KEY, writeSemantic } from '../../src/react/semantic-pref.js';

const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
afterEach(() => {
  Object.defineProperty(window, 'localStorage', real);
  window.localStorage.clear();
});

describe('the semantic-layer preference (spec §6.4)', () => {
  it('27.312 unset reads On, "off" reads Off, a write is read back; control: a store that THROWS on every access reads On and a write does not throw', () => {
    window.localStorage.clear();
    expect(readSemantic()).toBe(true);
    window.localStorage.setItem(SEMANTIC_KEY, 'off');
    expect(readSemantic()).toBe(false);
    window.localStorage.clear();
    writeSemantic(false);
    expect(window.localStorage.getItem(SEMANTIC_KEY)).toBe('off');
    expect(readSemantic()).toBe(false);
    writeSemantic(true);
    expect(readSemantic()).toBe(true);
    // control: Safari with site data blocked throws on the getter itself
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    expect(readSemantic()).toBe(true);
    expect(() => writeSemantic(false)).not.toThrow();
  });
});
