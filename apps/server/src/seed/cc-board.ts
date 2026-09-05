import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export type CcItemMeta = {
  counterparty?: string;
  who?: string;
  cost?: string;
  lead_time?: string;
  clears_week?: string;
  needed_week?: string | number;
  slack?: number;
};

export type CcItem = {
  id: string;
  title: string;
  epic: string;
  state: string;
  body: string;
  done: boolean;
  lane: string;
  origin_file: string;
  origin_state: string;
  origin_status: string;
  meta: CcItemMeta;
  ask_text?: string;
  note?: string;
  blocked_by?: string;
  start?: string;
  due?: string;
  since?: string;
  started?: string;
};

export type CcBoard = {
  week1: string;
  epics: Array<{ id: string; label: string }>;
  items: CcItem[];
};

/**
 * board.data.js is a classic script assigning window.CC_TRACKER (the base
 * needed file: URLs to work — see the snapshot's own header comment). We
 * read it in a vm sandbox: no eval in our process's scope, no network, a
 * timeout. The file is FROZEN — this module holds a read-only lens, never
 * a pen.
 *
 * The evaluation is wrapped because a wrong path fails in TWO ways, and only
 * one of them reaches the shape check below. A file that is not a classic
 * script at all — an ES module, a .ts source, an HTML page — throws a
 * SyntaxError out of `runInNewContext` before a single statement runs, and
 * that raw SyntaxError names neither the path nor what was expected. Both
 * routes now end at the same sentence, so "you pointed me at the wrong file"
 * reads the same whichever way the file was wrong.
 */
export function readCcBoard(boardDataPath: string): CcBoard {
  const source = readFileSync(boardDataPath, 'utf8');
  const sandbox: { window: { CC_TRACKER?: unknown } } = { window: {} };
  try {
    runInNewContext(source, sandbox, { filename: boardDataPath, timeout: 5000 });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `${boardDataPath} could not be evaluated as the classic script that defines window.CC_TRACKER (${detail}) — is this the frozen tracker snapshot?`,
      { cause },
    );
  }
  const data = sandbox.window.CC_TRACKER as CcBoard | undefined;
  if (!data || !Array.isArray(data.items) || typeof data.week1 !== 'string') {
    throw new Error(
      `${boardDataPath} did not define window.CC_TRACKER with items and week1 — is this the frozen tracker snapshot?`,
    );
  }
  return data;
}

/** The shop's operational errands: registrations and open questions. The
 * phase/test-case epics are the base project's dev work, not shop errands. */
export function errandItems(board: CcBoard): CcItem[] {
  return board.items.filter((item) => item.epic === 'registrations' || item.epic === 'questions');
}
