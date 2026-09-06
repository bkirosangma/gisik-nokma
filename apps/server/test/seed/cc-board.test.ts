import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errandItems, readCcBoard } from '../../src/seed/cc-board.js';

const BOARD_PATH = 'reference/convenience-corner-tracker/board.data.js';
// Vitest cwd is apps/server — reach the repo root:
const boardPath = new URL(`../../../../${BOARD_PATH}`, import.meta.url).pathname;

describe('readCcBoard — the frozen snapshot, read-only', () => {
  /**
   * 13.60 — readCcBoard reads week1 and the items out of the frozen
   * snapshot.
   */
  it('reads week1 and the items out of the classic-script snapshot', () => {
    const board = readCcBoard(boardPath);
    expect(board.week1).toBe('2026-08-18'); // pinned to snapshot 24e2240
    expect(board.items.length).toBeGreaterThan(0);
  });

  /**
   * 13.61 — the two operational epics hold exactly 23 errands in snapshot
   * 24e2240 (13 registrations + 10 questions, 0 done).
   */
  it('the two operational epics hold exactly 23 errands in snapshot 24e2240', () => {
    const board = readCcBoard(boardPath);
    const errands = errandItems(board);
    expect(errands).toHaveLength(23);
    expect(errands.filter((item) => item.epic === 'registrations')).toHaveLength(13);
    expect(errands.filter((item) => item.epic === 'questions')).toHaveLength(10);
    expect(errands.filter((item) => item.state === 'done')).toHaveLength(0);
  });

  /**
   * 13.62 — planted defect: a file that does not define window.CC_TRACKER
   * is refused with the path named (a .ts module throws inside the vm
   * sandbox before any shape check runs).
   */
  it('planted defect: a file that does not define window.CC_TRACKER is refused with the path named', () => {
    const selfPath = new URL(import.meta.url).pathname; // any JS-ish file that is not the snapshot
    expect(() => readCcBoard(selfPath)).toThrowError(/CC_TRACKER/);
    expect(() => readCcBoard(selfPath)).toThrowError(selfPath);
  });

  /**
   * 13.63 — planted defect: a sandboxed global that is not CC_TRACKER
   * exercises the shape-check branch itself (not just the syntax-error
   * path). Paired below with a CC_TRACKER missing `items` for the other
   * half of the same row.
   */
  /**
   * The test above proves the refusal on the route where the file will not even
   * PARSE as a classic script (a .ts source is an ES module — `runInNewContext`
   * throws before a statement runs). That route never reaches the shape check,
   * so on its own it would leave `!data || !items || !week1` with zero coverage
   * — a refusal the suite claims to prove and never exercises. This one takes
   * the other route: a file that parses perfectly and simply is not the
   * snapshot.
   */
  it('planted defect: a file that parses cleanly but sets some OTHER global is refused too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-board-'));
    const decoy = join(dir, 'not-the-tracker.js');
    try {
      writeFileSync(decoy, 'window.SOMETHING_ELSE = { items: [], week1: "2026-08-18" };\n', 'utf8');
      expect(() => readCcBoard(decoy)).toThrowError(/did not define window\.CC_TRACKER/);
      expect(() => readCcBoard(decoy)).toThrowError(decoy);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * 13.63 — planted defect: a CC_TRACKER missing `items` exercises the
   * shape-check branch itself, the other half of this row (paired with the
   * "sets some OTHER global" case above).
   */
  it('planted defect: a CC_TRACKER whose items are missing is refused — a shape, not just a name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-board-'));
    const decoy = join(dir, 'shapeless.js');
    try {
      writeFileSync(decoy, 'window.CC_TRACKER = { week1: "2026-08-18" };\n', 'utf8');
      expect(() => readCcBoard(decoy)).toThrowError(/did not define window\.CC_TRACKER/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
