import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from '../../src/attachments/filename.js';

/**
 * Plan 7 Task 9 — the filename is display data, and this is what that costs it.
 *
 * The hostile cases assert BOTH halves every time: that the dangerous
 * characters are gone AND that something recognisable survives. A sanitizer
 * that returned `'file'` for everything would pass a strip-only assertion
 * while destroying every honest name in the product, and nobody would notice
 * until a user asked why their receipt is called `file`.
 */
describe('sanitizeFilename', () => {
  it('passes ordinary names through', () => {
    expect(sanitizeFilename('gst-receipt.pdf')).toBe('gst-receipt.pdf');
  });

  it('planted defect: header-injection characters are stripped', () => {
    const hostile = 'evil".pdf\r\nSet-Cookie: stolen=1';
    const clean = sanitizeFilename(hostile);
    expect(clean).not.toMatch(/[\r\n"\\]/);
    expect(clean).toContain('evil');
  });

  it('planted defect: path separators are stripped', () => {
    expect(sanitizeFilename('..\\..\\windows\\cmd.exe')).not.toMatch(/[/\\]/);
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
    // The survivors are still recognisable — the strip is targeted, not a wipe.
    expect(sanitizeFilename('../../etc/passwd')).toContain('passwd');
  });

  it('strips control characters, including NUL and DEL', () => {
    const clean = sanitizeFilename(`note\u0000s\u001f-\u007fdraft.txt`);
    expect(clean).toBe('notes-draft.txt');
  });

  it('keeps dots that are not separators — `..` alone traverses nothing', () => {
    // With `/` and `\` gone, a pair of dots is an ordinary display character.
    // Stripping it would mangle honest names for no security gain.
    expect(sanitizeFilename('report..final.pdf')).toBe('report..final.pdf');
  });

  it('empty and undefined fall back to "file"; length is capped', () => {
    expect(sanitizeFilename(undefined)).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('x'.repeat(500))).toHaveLength(160);
  });
});
