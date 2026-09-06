import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type PlanTask = { number: number; title: string };
export type PlanDoc = {
  file: string;
  planNumber: string;
  title: string;
  goal: string | null;
  tasks: PlanTask[];
};

/**
 * The dev seed's record IS the plan series: titles and task headings are
 * read verbatim from the documents; nothing is summarised, renamed, or
 * invented. Plan 00 (coordination) is skipped — it is an interface
 * authority, not an execution plan, and carries no `**Goal:**` line of its
 * own.
 *
 * The glob and the task-heading regex were checked against the real
 * `docs/superpowers/plans/` directory before this was written: all twelve
 * files match `^\d{4}-\d{2}-\d{2}-\d{2}-.+\.md$` (00 through 11), every
 * 01-11 doc carries an H1, a `**Goal:**` line and at least one `### Task N:`
 * heading, and plan 11 itself (the file this seed's own spec lives in) has
 * exactly 16 tasks — read with a script, not `grep -c`, since `grep -c` is a
 * documented silent-wrong-answer mode on very long lines on this machine.
 */
export function readPlanSeries(plansDir: string): PlanDoc[] {
  const files = readdirSync(plansDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}-\d{2}-.+\.md$/.test(name))
    .sort();
  const docs: PlanDoc[] = [];
  for (const file of files) {
    const planNumber = file.match(/^\d{4}-\d{2}-\d{2}-(\d{2})-/)?.[1];
    if (!planNumber || planNumber === '00') continue;
    const text = readFileSync(join(plansDir, file), 'utf8');
    const lines = text.split('\n');
    const titleLine = lines.find((line) => line.startsWith('# '));
    if (!titleLine) throw new Error(`${file} has no H1 title — refusing to invent one`);
    const goalLine = lines.find((line) => line.startsWith('**Goal:**'));
    const tasks = [...text.matchAll(/^### Task (\d+): (.+)$/gm)].map((match) => ({
      // Both groups are always captured: the regex requires them, so the
      // non-null assertions are load-bearing on the pattern, not escapes.
      number: Number(match[1]!),
      title: match[2]!.trim(),
    }));
    docs.push({
      file,
      planNumber,
      title: titleLine.slice(2).trim(),
      goal: goalLine ? goalLine.replace('**Goal:**', '').trim() : null,
      tasks,
    });
  }
  if (docs.length === 0) throw new Error(`${plansDir} holds no plan documents`);
  return docs;
}
