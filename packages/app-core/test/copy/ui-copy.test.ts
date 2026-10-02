// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { formatCardProvenance, formatDay } from '../../src/provenance.js';
import {
  type AllowEntry,
  REPO_ROOT,
  UI_SOURCE_ROOTS,
  cssFiles,
  describeHit,
  sourceFiles,
  stringsIn,
  uiStringsMatching,
  withoutAllowed,
} from './ui-copy-scan.js';

/**
 * UX fixes T11 (spec §3.3, audit SYS-11, SYS-19): one glossary, no template tells in
 * UI copy, one date format, "My work" in sentence case, an empty state that points
 * somewhere. Cases 23.190-23.195 and 23.202 (`test-cases/23-ux-fixes.md`).
 *
 * Every scan here is proven first on a planted defect (the control runs before the
 * sweep, in the same `it` where the sweep is one test), because a scan that reads
 * nothing reports "clean" exactly as a clean tree does. Every allow-list entry
 * carries its reason; an entry without one fails `reasons are written` below.
 */

const read = (path: string): string => readFileSync(resolve(REPO_ROOT, path), 'utf8');

/** A phrase that is allowed to stay, and why. Compared case-insensitively, as a literal. */
type AllowedPhrase = { phrase: string; reason: string };

// ---------------------------------------------------------------------------------------------
// 23.190 — one glossary: ticket (never "job"), state (never "stage")
// ---------------------------------------------------------------------------------------------

/** "job" / "stage" in the manual and FAQ that do NOT name a product thing. Empty means none. */
const DOC_ALLOWED: readonly AllowedPhrase[] = [];

/** "job" / "stage" in UI source strings that do not name a product thing. */
const UI_GLOSSARY_ALLOWED: readonly AllowEntry[] = [];

const GLOSSARY = /\b(jobs?|stages?)\b/i;

function glossaryHits(text: string, allowed: readonly AllowedPhrase[]): string[] {
  let scrubbed = text;
  for (const { phrase } of allowed) scrubbed = scrubbed.split(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(' ');
  return scrubbed
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text: line }) => GLOSSARY.test(line))
    .map(({ line, text: raw }) => `${line}: ${raw.trim().slice(0, 100)}`);
}

describe('23.190 the manual, FAQ and UI say ticket and state, never job and stage', () => {
  it('control: the matcher finds each old word and lets an allowed phrase through', () => {
    expect(glossaryHits('Move the job to the next stage.', [])).toHaveLength(1);
    expect(glossaryHits('Two jobs, three stages', [])).toHaveLength(1);
    expect(glossaryHits("the job's owner", [])).toHaveLength(1);
    expect(glossaryHits('Move the ticket to the next state.', [])).toHaveLength(0);
    expect(glossaryHits('a nightly backup job runs', [{ phrase: 'backup job', reason: 'control' }])).toHaveLength(0);
    expect(GLOSSARY.test('jobless')).toBe(false);
  });

  it.each(['docs/manual.md', 'docs/faq.md'])('%s has no "job" or "stage" outside the allow-list', (path) => {
    expect(glossaryHits(read(path), DOC_ALLOWED)).toEqual([]);
  });

  it('the shipped help module (headings, ids, text) has none either', () => {
    expect(glossaryHits(JSON.stringify(HELP_CONTENT, null, 1), DOC_ALLOWED)).toEqual([]);
  });

  it('no UI source string says "job" or "stage"', () => {
    const hits = withoutAllowed(uiStringsMatching(GLOSSARY), UI_GLOSSARY_ALLOWED);
    expect(hits.map(describeHit)).toEqual([]);
  });

  it('reasons are written: every allow-list entry says why it stays', () => {
    for (const entry of DOC_ALLOWED) expect(entry.reason.trim().length).toBeGreaterThan(10);
    for (const entry of UI_GLOSSARY_ALLOWED) expect(entry.reason.trim().length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------------------------
// 23.191 — no middle-dot meta strings and no spaced em dashes in UI strings
// ---------------------------------------------------------------------------------------------

/** Strings that keep " · " or " — " because they are not UI copy. Each carries its reason. */
const TELL_ALLOWED: readonly AllowEntry[] = [];

const MIDDLE_DOT_OR_DASH = / · | — /;

describe('23.191 no " · " and no " — " in the strings a person reads', () => {
  it('control: the scan reads JSX text, literals and template chunks, and never a comment', () => {
    const planted = [
      "// a · b and c — d in a line comment",
      '/* e · f */',
      "const a = 'g · h';",
      'const b = `i — ${1} j`;',
      'export const c = <p>k · l</p>;',
      "const d = 'clean';",
    ].join('\n');
    const hits = stringsIn('planted.tsx', planted).filter((hit) => MIDDLE_DOT_OR_DASH.test(hit.text));
    expect(hits.map((hit) => hit.text)).toEqual(['g · h', 'i — ', 'k · l']);
  });

  it('control: the allow-list filter removes exactly the entry it names', () => {
    const hits = [
      { file: 'apps/web/a.tsx', line: 1, text: 'x · y' },
      { file: 'apps/web/b.tsx', line: 2, text: 'x · y' },
    ];
    expect(withoutAllowed(hits, [{ file: 'a.tsx', contains: 'x · y', reason: 'control' }])).toEqual([hits[1]]);
  });

  it('the UI roots hold none, apart from the reasoned allow-list', () => {
    const hits = withoutAllowed(uiStringsMatching(MIDDLE_DOT_OR_DASH), TELL_ALLOWED);
    expect(hits.map(describeHit)).toEqual([]);
  });

  it('reasons are written: every allow-list entry says why it stays', () => {
    for (const entry of TELL_ALLOWED) expect(entry.reason.trim().length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------------------------
// 23.301 — the strip's server-composed reasons (UX fixes F-8)
// ---------------------------------------------------------------------------------------------

/** The route whose reason strings the strip prints verbatim. Its other server strings are not read as UI copy here. */
const ATTENTION_ROUTE = 'apps/server/src/routes/attention.ts';

/** Reason strings that still hold " — ". Each carries its reason. Empty since F-11: the blocked reason was the last. */
const SERVER_REASON_ALLOWED: readonly AllowEntry[] = [];

describe('23.301 and 23.356 the attention route composes no " — " in a reason a person reads', () => {
  it('holds none, apart from the reasoned allow-list (control first: the scan finds the old stale template)', () => {
    const hitsOf = (file: string, source: string): ReturnType<typeof stringsIn> =>
      stringsIn(file, source).filter((hit) => MIDDLE_DOT_OR_DASH.test(hit.text));

    // Control: the scan reads the route's template chunks, so the old stale template is found.
    const old = 'const reason = `In an active state since ${day} — past the ${n}-day staleness threshold.`;';
    expect(hitsOf(ATTENTION_ROUTE, old).map((hit) => hit.text)).toEqual([' — past the ']);

    // Control (F-11, 23.356): the BLOCKED template, as it stood at attention.ts:221, is found too. It once passed
    // because an allow-list entry named it, not because the scan could not see a template tail after a `${}`.
    const blocked = 'const item = { reason: `In "${stateName}" — a blocked state.` };';
    expect(hitsOf(ATTENTION_ROUTE, blocked).map((hit) => hit.text)).toEqual(['" — a blocked state.']);
    expect(withoutAllowed(hitsOf(ATTENTION_ROUTE, blocked).map((hit) => ({ ...hit, file: ATTENTION_ROUTE })), SERVER_REASON_ALLOWED)).toHaveLength(1);

    const serverHits = hitsOf(ATTENTION_ROUTE, readFileSync(resolve(REPO_ROOT, ATTENTION_ROUTE), 'utf8'));
    expect(withoutAllowed(serverHits, SERVER_REASON_ALLOWED).map(describeHit)).toEqual([]);

    // The allow-list is not stale: every entry still matches a string in the route, and says why.
    for (const entry of SERVER_REASON_ALLOWED) {
      expect(serverHits.some((hit) => hit.text.includes(entry.contains))).toBe(true);
      expect(entry.reason.trim().length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 23.192 — no all-caps text
// ---------------------------------------------------------------------------------------------

const UPPERCASE_RULE = /text-transform\s*:\s*uppercase/i;
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('23.192 no stylesheet or inline style sets text-transform: uppercase', () => {
  it('control: the matcher finds a rule, ignores one inside a comment, and finds the inline form', () => {
    expect(UPPERCASE_RULE.test(stripCssComments('.a { text-transform: uppercase; }'))).toBe(true);
    expect(UPPERCASE_RULE.test(stripCssComments('.a { text-transform:uppercase }'))).toBe(true);
    expect(UPPERCASE_RULE.test(stripCssComments('/* text-transform: uppercase */ .a { color: red }'))).toBe(false);
    expect(UPPERCASE_RULE.test(stripCssComments('.a { text-transform: none; }'))).toBe(false);
  });

  it('no .css file under the UI roots has the rule', () => {
    const offenders = cssFiles()
      .filter((file) => UPPERCASE_RULE.test(stripCssComments(readFileSync(file, 'utf8'))))
      .map((file) => file.replace(`${REPO_ROOT}/`, ''));
    expect(offenders).toEqual([]);
  });

  it('no UI source string sets it inline', () => {
    const hits = uiStringsMatching(UPPERCASE_RULE);
    expect(hits.map(describeHit)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 23.360 — the server's response bodies a client shows verbatim (MCP-everything follow-up)
// ---------------------------------------------------------------------------------------------

/**
 * The route files whose message strings reach a client that prints them: the invitation page and
 * banner show the two invitation bodies, and the token-name refine message is the schema's own words.
 * Pinned by file (not by a sweep of the routes) so a file the sweep cannot yet vouch for is not
 * claimed. Each pins a sentence it must still hold, so the scan is proven to be reading its subject.
 */
const SERVER_BODY_FILES: ReadonlyArray<{ file: string; holds: string }> = [
  { file: 'apps/server/src/routes/invites.ts', holds: 'does not open anything' },
  { file: 'apps/server/src/routes/my-invitations.ts', holds: 'no longer open' },
  { file: 'apps/server/src/routes/mcp-tokens.ts', holds: 'must not be blank' },
];

/** Strings in those files that keep " — " because they are not copy a client shows. Each carries its reason. */
const SERVER_BODY_ALLOWED: readonly AllowEntry[] = [];

describe('23.360 the invitation and token-name bodies hold no " — "', () => {
  it('holds none, apart from the reasoned allow-list (control first: the scan finds a planted body)', () => {
    const hitsOf = (file: string, source: string): ReturnType<typeof stringsIn> =>
      stringsIn(file, source).filter((hit) => MIDDLE_DOT_OR_DASH.test(hit.text));

    // Control: the scan reads an object-literal message and a refine message, and never a comment.
    const planted = [
      "// lapsed — in a comment",
      "export const BODY = { error: 'not_found', message: 'It may have lapsed — ask for a new one.' };",
      "const schema = z.string().refine((v) => v !== '', 'must not be blank — a name of only spaces');",
      "const ok = 'It may have lapsed. Ask for a new one.';",
    ].join('\n');
    expect(hitsOf('apps/server/src/routes/planted.ts', planted).map((hit) => hit.text)).toEqual([
      'It may have lapsed — ask for a new one.',
      'must not be blank — a name of only spaces',
    ]);

    const hits = SERVER_BODY_FILES.flatMap(({ file, holds }) => {
      const source = readFileSync(resolve(REPO_ROOT, file), 'utf8');
      // Control: the file is read, and it still holds the sentence this case is about.
      expect(
        stringsIn(file, source).some((hit) => hit.text.includes(holds)),
        `${file} holds "${holds}"`,
      ).toBe(true);
      return hitsOf(file, source);
    });
    expect(withoutAllowed(hits, SERVER_BODY_ALLOWED).map(describeHit)).toEqual([]);
  });

  it('reasons are written: every allow-list entry says why it stays', () => {
    for (const entry of SERVER_BODY_ALLOWED) expect(entry.reason.trim().length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------------------------
// 23.370 — the domain's refusal messages (HK-3, the follow-up to 23.360)
// ---------------------------------------------------------------------------------------------

const DOMAIN_SRC = 'packages/domain/src';
const SPACED_EM_DASH = / — /;

/**
 * The refusal messages HK-3 rewrote: the zod issue messages and the `parse-event` refusals a client prints
 * (the MCP server passes a refusal on verbatim). Each pins the sentence its file must still hold, so the
 * sweep below is proven to be reading its subject.
 */
const DOMAIN_REFUSAL_SITES: ReadonlyArray<{ file: string; holds: string }> = [
  { file: 'packages/domain/src/envelope.ts', holds: "must name this event's own workspace" },
  { file: 'packages/domain/src/events/invites.ts', holds: 'an invite cannot confer ownership' },
  { file: 'packages/domain/src/events/ticket-events.ts', holds: 'a backlog ticket has no starting status' },
  { file: 'packages/domain/src/parse-event.ts', holds: 'the ledger accepts only what it can later replay' },
  { file: 'packages/domain/src/parse-event.ts', holds: 'cannot be addressed at all' },
  { file: 'packages/domain/src/parse-event.ts', holds: 'Filing it anywhere else starts a second stream' },
  { file: 'packages/domain/src/parse-event.ts', holds: 'every invite event carries the inviteId' },
  { file: 'packages/domain/src/parse-event.ts', holds: "an invite's entity id IS its inviteId" },
  { file: 'packages/domain/src/validate-workflow.ts', holds: 'every workflow has it without declaring it' },
];

/**
 * Strings under `packages/domain/src` that still hold " — ", outside the sites above. NOT cleared by HK-3:
 * the brief named eight sites, and these are the rest of the same scan's catch. Each carries its reason, and
 * each leaves this list when its sentence is rewritten. The first group are developer invariants (thrown
 * `Error`s that name the function and are never drawn in the UI); the second are refusal and zod messages
 * a client can print and are the follow-up this list exists to show.
 */
const DOMAIN_DASH_ALLOWED: readonly AllowEntry[] = [
  { file: 'ticket-state.ts', contains: 'is a purged (redacted) row', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'ticket-state.ts', contains: 'the engine must refuse ticket.created', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'ticket-state.ts', contains: 'vanished', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'ticket-state.ts', contains: 'the engine must refuse ticket.workflow_rebound', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'ticket-state.ts', contains: 'the version chain has a hole', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'ticket-state.ts', contains: '— state "', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'note-state.ts', contains: 'refused —', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'ist-day.ts', contains: 'a day claim is not an instant', reason: 'developer invariant: a thrown Error that names the function, never drawn in the UI' },
  { file: 'display-name.ts', contains: 'a name of only spaces names nothing', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'envelope.ts', contains: 'two ULIDs joined by a colon', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'envelope.ts', contains: 'an event with no payload is not a claim', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/invites.ts', contains: 'an address of only spaces reaches nobody', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/membership.ts', contains: 'a description of only spaces describes nothing', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/membership.ts', contains: 'a project-admin flag is a claim, not a default', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/ticket-events.ts', contains: 'a title of only spaces names nothing', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/ticket-events.ts', contains: 'a field claim with no value', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/ticket-events.ts', contains: 'nothing sorts below it', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'filter-spec.ts', contains: 'Postgres text cannot carry a NUL byte', reason: 'a zod refusal message a client can print; same class as the HK-3 sites but not in the brief\'s eight (HK-3b)' },
  { file: 'events/contest-events.ts', contains: '— refused by rule', reason: 'the contest note\'s rule refusal, composed for the contest card a person reads (HK-3b)' },
  { file: 'events/contest-events.ts', contains: 'by their clock —', reason: 'the contest provenance line a person reads (HK-3b)' },
];

describe('23.370 the domain refusal messages hold no " — "', () => {
  it('holds none, apart from the reasoned allow-list (control first: the scan finds a planted message)', () => {
    const hitsOf = (file: string, source: string): ReturnType<typeof stringsIn> =>
      stringsIn(file, source).filter((hit) => SPACED_EM_DASH.test(hit.text));

    // Control: the scan reads a zod message, a custom issue message and a template chunk, and never a comment.
    const planted = [
      "// lapsed — in a comment",
      "const a = z.string().refine((v) => v !== '', 'must not be blank — a name of only spaces');",
      "const b = { message: \"must name this workspace — a membership id is workspaceId:userId\" };",
      'const c = { message: `unknown event type \'${type}\' — the ledger accepts only what it can replay` };',
      "const d = 'must not be blank: a name of only spaces';",
    ].join('\n');
    expect(hitsOf('packages/domain/src/planted.ts', planted).map((hit) => hit.text)).toEqual([
      'must not be blank — a name of only spaces',
      'must name this workspace — a membership id is workspaceId:userId',
      "' — the ledger accepts only what it can replay",
    ]);

    // Control: every site is read, and still holds the sentence this case is about.
    for (const { file, holds } of DOMAIN_REFUSAL_SITES) {
      const source = readFileSync(resolve(REPO_ROOT, file), 'utf8');
      expect(
        stringsIn(file, source).some((hit) => hit.text.includes(holds)),
        `${file} holds "${holds}"`,
      ).toBe(true);
    }

    const hits = uiStringsMatching(SPACED_EM_DASH, [DOMAIN_SRC]);
    expect(withoutAllowed(hits, DOMAIN_DASH_ALLOWED).map(describeHit)).toEqual([]);
  });

  it('reasons are written, and no allow-list entry is stale', () => {
    const hits = uiStringsMatching(SPACED_EM_DASH, [DOMAIN_SRC]);
    for (const entry of DOMAIN_DASH_ALLOWED) {
      expect(entry.reason.trim().length).toBeGreaterThan(10);
      expect(hits.some((hit) => hit.file.endsWith(entry.file) && hit.text.includes(entry.contains)), `${entry.file}: ${entry.contains}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 23.193 — one date format: "17 Aug", plus the year when it is not the current one
// ---------------------------------------------------------------------------------------------

describe('23.193 formatDay is the one day renderer', () => {
  it('a day this year drops the year; another year keeps it', () => {
    expect(formatDay('2026-08-17T10:00:00.000Z', '2026-10-02')).toBe('17 Aug');
    expect(formatDay('2025-08-17T10:00:00.000Z', '2026-10-02')).toBe('17 Aug 2025');
    expect(formatDay('2027-02-08T10:00:00.000Z', '2026-10-02')).toBe('8 Feb 2027');
  });

  it('a day claim is a day already and is never shifted', () => {
    expect(formatDay('2026-08-17', '2026-10-02')).toBe('17 Aug');
    expect(formatDay('2025-08-17', '2026-10-02')).toBe('17 Aug 2025');
  });

  it('the year is the IST year: 20:00 UTC on 31 Dec is already 1 Jan in India', () => {
    expect(formatDay('2025-12-31T20:00:00.000Z', '2026-01-05')).toBe('1 Jan');
    expect(formatDay('2025-12-31T20:00:00.000Z', '2025-12-31')).toBe('1 Jan 2026');
  });

  it('with no reference day the year stays, because nothing here reads the clock', () => {
    expect(formatDay('2026-08-17T10:00:00.000Z')).toBe('17 Aug 2026');
  });

  it('a value it cannot read comes back as given', () => {
    expect(formatDay('not a date', '2026-10-02')).toBe('not a date');
    expect(formatDay('2026-02-30', '2026-10-02')).toBe('2026-02-30');
  });

  it("the card's provenance line renders its day through it (23.123 keeps its own cases)", () => {
    const claim = { actorId: 'u1', actorName: 'Anselma Marak', clientTime: '2025-08-19T10:00:00.000Z', serverTime: '2025-08-19T10:00:00.000Z' };
    expect(formatCardProvenance('Doing', claim, '2026-10-02')).toBe('Moved to Doing by Anselma Marak on 19 Aug 2025');
    const thisYear = { ...claim, serverTime: '2026-08-19T10:00:00.000Z' };
    expect(formatCardProvenance('Doing', thisYear, '2026-10-02')).toBe('Moved to Doing by Anselma Marak on 19 Aug');
    expect(formatCardProvenance('Doing', thisYear, '2026-10-02', true)).toBe('Moved to Doing by Anselma Marak on 19 Aug 2026');
  });

  /** A call named `toLocaleDateString` anywhere in a UI source file (comments are not nodes). */
  function localeDateCalls(file: string, source: string): string[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'toLocaleDateString') {
        found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }

  it('control: the call scan finds a call and ignores a comment that names it', () => {
    expect(localeDateCalls('p.ts', 'const s = at.toLocaleDateString("en-IN");')).toHaveLength(1);
    expect(localeDateCalls('p.ts', '// never toLocaleDateString()\nconst s = 1;')).toHaveLength(0);
  });

  it('no UI source renders a day with toLocaleDateString', () => {
    const offenders = UI_SOURCE_ROOTS.flatMap((root) =>
      sourceFiles(root).flatMap((file) => localeDateCalls(file.replace(`${REPO_ROOT}/`, ''), readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 23.194 — "My work" in sentence case
// ---------------------------------------------------------------------------------------------

describe('23.194 "My work" is sentence case at every site', () => {
  it('control: the scan finds the old casing in a literal and in JSX text', () => {
    const planted = "const a = 'My Work'; export const b = <a>My Work</a>; const c = 'My work';";
    expect(stringsIn('p.tsx', planted).filter((hit) => /My Work/.test(hit.text))).toHaveLength(2);
  });

  it('no UI source string says "My Work"', () => {
    expect(uiStringsMatching(/My Work/).map(describeHit)).toEqual([]);
  });

  it.each(['docs/manual.md', 'docs/faq.md'])('%s does not either', (path) => {
    expect(read(path)).not.toMatch(/My Work/);
  });

  it('the shipped help module does not either', () => {
    expect(JSON.stringify(HELP_CONTENT)).not.toMatch(/My Work/);
  });
});

// ---------------------------------------------------------------------------------------------
// 23.202 — the help check passes over the renamed manual
// ---------------------------------------------------------------------------------------------

describe('23.202 the help check passes after the renames', () => {
  it('node scripts/help-content.mjs --check exits 0, its self-test included', () => {
    const out = execFileSync('node', ['scripts/help-content.mjs', '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).toContain('self-test passed');
    expect(out).toContain('generated copy matches source');
    expect(out).toMatch(/quoted string\(s\) checked against the product/);
  });
});
