import { describe, expect, it } from 'vitest';
import { memberLabel } from '../src/member-label.js';

/**
 * 13.1291 — the label a person is shown and named by is resolved in ONE place,
 * in ONE order: **name, then email, then id.**
 *
 * The owner's instruction (2026-09-22): *"Everywhere for id, show the Name; if
 * name is empty/blank, show the email."* The rule existed as two PRIVATE copies
 * before this — `memberLabel` in the members page and `pickerLabel` in the
 * visibility editor — with the same order and the same blank-is-absent rule
 * spelled twice, free to drift. Everything else either read `member.name` raw
 * or went through `actorLabel`, which has no email step at all (correctly: see
 * that function's own contract, and the case below that pins it).
 *
 * The four arms are in ONE `describe` because they are one RULE, not four
 * decisions: each arm is the next step of the same lookup, and an implementation
 * that reordered them would redden the arm below rather than a different file.
 */
describe('memberLabel — name, then email, then id (13.1291)', () => {
  it('13.1291 a member with a name is named by their name', () => {
    // The ordinary case, and the CONTROL for the three below: without it a
    // function that returned the id for everybody would pass arms two to four.
    expect(memberLabel({ id: 'u1', name: 'Kiro', email: 'kiro@example.test' })).toBe('Kiro');
  });

  it('13.1291 a member with a BLANK name is named by their email', () => {
    // The population the owner's instruction is about: better-auth's magic-link
    // plugin creates a user with `name: name || ""` and the sign-in page sends
    // no name, so an email sign-up is `name === ''` with a real address.
    expect(memberLabel({ id: 'u2', name: '', email: 'accountant@example.test' })).toBe(
      'accountant@example.test',
    );
  });

  it('13.1291 a blank name AND a blank address fall to the id — neither blank is a value', () => {
    // Blank is ABSENT at both steps rather than rendered: a whitespace-only name
    // is not a name, and a whitespace-only address is not an address. The id is
    // the floor, and it is a fact the server sent.
    expect(memberLabel({ id: 'u3', name: '  ', email: ' ' })).toBe('u3');
  });

  it('13.1291 a member with no name and NO email KEY falls to the id', () => {
    // The key ABSENT rather than blank is the server's own declaration — a
    // phone-only sign-up's synthetic address is withheld — so this arm and the
    // one above are different shapes of input reaching the same floor.
    expect(memberLabel({ id: 'u4', name: '' })).toBe('u4');
  });
});
