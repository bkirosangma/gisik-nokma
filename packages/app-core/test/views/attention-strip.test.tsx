import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ServingGapError, SERVING_GAPS } from '../../src/online/mappers.js';
import type { AttentionItem } from '../../src/view-types.js';
import { AttentionStrip, useAttention } from '../../src/views/attention-strip.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, claim } from '../helpers/seed.js';

/**
 * ADAPTATION. The plan's fixture invents its own reason prose ("In 'Waiting on
 * counterparty' for 12 days"). The first THREE below are instead filled from
 * the template literals `apps/server/src/routes/attention.ts` actually builds
 * (lines 197, 223, 245) — because "render the server's reason verbatim" is only
 * testable against the server's ACTUAL wording. A client that re-derived the
 * reason would almost certainly produce the plan's tidier phrasing, and against
 * the plan's fixture that defect passes.
 *
 * `CONTESTED_REASON` is NOT the server's, and is marked so rather than left to
 * look like the other three: no route composes it, because the contested kind
 * is Plan 10's. **⚠ CORRECTED 2026-09-20: this continued "and `mapAttention`
 * refuses over it today" — it does not, and rulings P39/P40 served that read, the
 * register having been empty since 2026-09-19. The reason `CONTESTED_REASON` is
 * constructed is narrower than the one given here and it is the FIRST half of the
 * sentence: no route composes this string.**
 *
 * Note what the due-soon reason names: `2026-08-30`, the raw claimed day, not
 * `30 Aug 2026`. That is the server's spelling and it is rendered as sent.
 */
const BLOCKED_REASON = 'In "Waiting on counterparty" — a blocked state.';
const STALE_REASON = 'In an active state since 2026-07-10 — past the 7-day staleness threshold.';
const DUE_SOON_REASON = 'Needed by 2026-08-30 — due within 7 days.';
const CONTESTED_REASON = 'Refused on sync: restrict-to — only the assignee may close this';

/** The three kinds the shipped route emits, plus Plan 10's fourth. */
const ITEMS: AttentionItem[] = [
  {
    kind: 'blocked',
    ticketId: 't1',
    projectId: 'prj_1',
    title: 'DLT registration',
    reason: BLOCKED_REASON,
    claim: claim(),
  },
  {
    kind: 'due-soon',
    ticketId: 't2',
    projectId: 'prj_1',
    title: 'File the GST return',
    reason: DUE_SOON_REASON,
    claim: claim({ actorName: null, actorId: 'user_kiro' }),
  },
  {
    kind: 'contested',
    ticketId: 't3',
    projectId: 'prj_1',
    title: 'Bank mandate',
    reason: CONTESTED_REASON,
    claim: claim(),
  },
  {
    kind: 'stale',
    ticketId: 't4',
    projectId: 'prj_1',
    title: 'Old errand',
    reason: STALE_REASON,
    claim: null,
  },
];

/** The three the server emits today. Plan 10's `contested` is deliberately absent. */
const SHIPPED_KINDS: AttentionItem[] = [ITEMS[0]!, ITEMS[1]!, ITEMS[3]!];

describe('3.56–3.57 AttentionStrip — computed, never authored (spec §7)', () => {
  it('renders every item with its kind and its computed reason', () => {
    render(<AttentionStrip items={ITEMS} onOpenTicket={vi.fn()} />);
    expect(screen.getByText(BLOCKED_REASON)).toBeInTheDocument();
    expect(screen.getByText(DUE_SOON_REASON)).toBeInTheDocument();
    expect(screen.getByText(CONTESTED_REASON)).toBeInTheDocument();
    expect(screen.getByText(STALE_REASON)).toBeInTheDocument();
  });

  it('PLANTED DEFECT: every declared kind is labelled and toned — no item renders a blank chip', () => {
    // Four items, four kinds, four distinct labels. A `Record<AttentionKind, …>`
    // missing an arm renders `undefined` here rather than throwing, so the
    // assertion is on the LABELS present, not on the render surviving.
    render(<AttentionStrip items={ITEMS} onOpenTicket={vi.fn()} />);
    for (const label of ['Blocked', 'Due soon', 'Contested', 'Stale']) {
      expect(screen.getByText(label), `${label} must be labelled`).toBeInTheDocument();
    }
    const chips = [...document.querySelectorAll('.gn-chip')];
    expect(chips).toHaveLength(4);
    for (const chip of chips) expect(chip.textContent?.trim()).not.toBe('');
  });

  it('renders the underlying claim provenance when one exists — attributed, both-clock date', () => {
    render(<AttentionStrip items={[ITEMS[0]!]} onOpenTicket={vi.fn()} />);
    expect(screen.getByText('claimed by Anselma Marak on 19 Aug 2026')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: a nameless claim is attributed by id, and a claimless item invents nothing', () => {
    render(<AttentionStrip items={[ITEMS[1]!, ITEMS[3]!]} onOpenTicket={vi.fn()} />);
    expect(screen.getByText('claimed by user_kiro on 19 Aug 2026')).toBeInTheDocument();
    // The stale item carries no claim: exactly one provenance line total.
    expect(screen.getAllByText(/^claimed by/)).toHaveLength(1);
  });

  it('opens the ticket the row names on title click', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<AttentionStrip items={ITEMS} onOpenTicket={onOpenTicket} />);
    await user.click(screen.getByRole('button', { name: 'Bank mandate' }));
    expect(onOpenTicket).toHaveBeenCalledWith('t3');
  });
});

/**
 * WHAT THE STRIP DOES WITH AN ABSENT KIND, which is the question this task was
 * given rather than one it chose.
 *
 * `AttentionKind` is a four-member union and the shipped route emits three.
 * The fourth — `contested` — **was** what `mapAttention` REFUSED over: an
 * `AttentionItem` needs a `title` and no contest row carried one. **⚠ CORRECTED
 * 2026-09-20: the tense is the correction — rulings P39/P40 served it, and
 * `mappers.ts` maps a contest's `title` today (`attention-strip.tsx:63-66` records
 * the same expiry). The property below is unchanged and is why the case stays:
 * a strip built from the three shipped kinds must show three rows and say nothing
 * whatever about the fourth. The failure being closed is not a crash; it is a
 * "Contested (0)" heading, or an empty fourth section, either of which tells a
 * user that nothing is contested — the one thing this client cannot know.
 */
describe('3.55 AttentionStrip — an absent kind is absent, never an empty section asserting nothing', () => {
  it('PLANTED DEFECT: with only the three shipped kinds, the word "Contested" appears nowhere', () => {
    const { container } = render(
      <AttentionStrip items={SHIPPED_KINDS} onOpenTicket={vi.fn()} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Contested')).not.toBeInTheDocument();
    // Belt and braces: not as a heading, not as a chip, not anywhere in the
    // subtree — a per-kind section would put it in the DOM under some other
    // role than the two queried above.
    expect(container.textContent).not.toContain('Contested');
    expect(container.textContent).not.toContain('contested');
  });

  it('PLANTED DEFECT: and the count of rendered rows equals the count of items given, exactly', () => {
    // A strip that grouped by kind and rendered a section per union member
    // would render four containers for three items. A strip that dropped an
    // unrecognised kind would render fewer. Both are caught by pinning the two
    // numbers to each other under two different item sets.
    const three = render(<AttentionStrip items={SHIPPED_KINDS} onOpenTicket={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(SHIPPED_KINDS.length);
    three.unmount();
    render(<AttentionStrip items={ITEMS} onOpenTicket={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(ITEMS.length);
  });

  it('renders nothing at all when there is nothing needing attention — no fabricated urgency', () => {
    const { container } = render(<AttentionStrip items={[]} onOpenTicket={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('PLANTED DEFECT: and "nothing" means no container either — an empty strip is not a quiet strip', () => {
    // `container.toBeEmptyDOMElement()` above already covers this, but only
    // because `<aside>` is the outermost node. A component that returned an
    // empty `<aside aria-label="Needs your attention" />` would still be a
    // surface on screen announcing itself as the answer to "what needs
    // attention". **The name here moved with the heading on 2026-09-18** — an
    // absence assertion against a name the component no longer uses is
    // vacuously true, which is the check-that-cannot-fail shape rather than a
    // weaker check.
    render(<AttentionStrip items={[]} onOpenTicket={vi.fn()} />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Needs your attention')).not.toBeInTheDocument();
  });
});

/**
 * Cases 13.890–13.892 — Part 2 of the attention-strip instruction: the
 * prototype's visible heading, adopted (owner ruling, 2026-09-18 —
 * *"i want the prototype's visible heading adopted"*), together with the tint
 * card, `--gn-tint-warning`.
 *
 * ## WHY THE NAME IS THE HEADING, AND NOT `aria-labelledby`
 *
 * The region used to be named `"Needs attention"` by `aria-label` while the
 * prototype's visible heading reads `"Needs your attention"` — WCAG 2.5.3's
 * exact failure, a visible label the accessible name does not contain. Two
 * implementations fix that: keep `aria-label` and set it to the visible string,
 * or drop it and name the region from the `<p>` via `aria-labelledby`.
 *
 * **This file takes the first, and the reason is measured rather than
 * stylistic.** `e2e-stack/viewport.spec.ts` ratchets the COUNT of elements
 * carrying an `aria-label` with `toBeGreaterThanOrEqual`, per route, from
 * `e2e-stack/accessible-names-baseline.json` — `/my-work` is floored at **8**,
 * and this strip's `aside` is one of them. `aria-labelledby` would remove that
 * attribute from every route the strip renders on, dropping the count to 7. The
 * standing rule for a floor is that it is not hand-lowered to meet a restyle
 * (`#471`'s recorded ruling, 2026-09-18). So the name keeps its attribute and
 * changes its value.
 *
 * **What is NOT claimed here:** that the ratchet was RE-RUN. It cannot be, from
 * this worktree — `e2e-stack` requires the compose stack, which is executor 1's
 * and is mounted from executor 1's tree, so a run here would measure a tree
 * without this change. What is claimed is the direction and the arithmetic, and
 * 13.890 pins the attribute's presence, which is the half a unit test can hold.
 */
describe('13.890–13.892 AttentionStrip — the prototype’s visible heading, adopted', () => {
  it('13.890 — the region’s accessible name IS the visible heading, character for character', () => {
    const { container } = render(<AttentionStrip items={ITEMS} onOpenTicket={vi.fn()} />);
    const strip = container.querySelector('aside.gn-attention');
    expect(strip, 'no strip rendered').not.toBeNull();
    const heading = strip!.querySelector('.gn-attention__heading');
    expect(heading, 'the visible heading is not rendered at all').not.toBeNull();

    // Read the RENDERED text, not a string in the source. `<svg>` contributes
    // none, but a heading whose glyph were a character would, and that is the
    // difference between this and a `toContain` on the component file.
    const visible = heading!.textContent ?? '';
    expect(visible).toBe('Needs your attention');

    // THE PROPERTY, and the one the shipped code failed: the two agree.
    expect(strip!.getAttribute('aria-label')).toBe(visible);

    // …and the accessible-name computation itself agrees, which is what an
    // assistive technology reads rather than the attribute.
    expect(screen.getByRole('complementary', { name: visible })).toBe(strip);
  });

  it('13.891 — the heading’s icon is decorative, so the name is not the sentence twice', () => {
    const { container } = render(<AttentionStrip items={ITEMS} onOpenTicket={vi.fn()} />);
    const icon = container.querySelector('svg.gn-attention__icon');
    expect(icon, 'the heading’s icon is gone').not.toBeNull();
    expect(icon!.getAttribute('aria-hidden')).toBe('true');
    // `aria-hidden` alone would be defeated by a name of its own, which an
    // assistive technology may still read on some platforms.
    expect(icon!.getAttribute('aria-label')).toBeNull();
    expect(icon!.querySelector('title')).toBeNull();
  });

  it('13.892 — the row runs title → chip → reason, the prototype’s order', () => {
    // `ITEMS[0]` carries a claim, so the row has four children and the CLAIM's
    // position is pinned too — it is a product addition the prototype does not
    // draw, and "it is still last, after the three the prototype orders" is the
    // claim. A reorder that left it first would satisfy a three-item check.
    const { container } = render(<AttentionStrip items={[ITEMS[0]!]} onOpenTicket={vi.fn()} />);
    const row = container.querySelector('.gn-attention__item');
    expect(row, 'no row rendered').not.toBeNull();
    const classes = [...row!.children].map((child) => child.className);
    expect(classes).toEqual([
      'gn-attention__title',
      'gn-chip gn-chip--blocked',
      'gn-attention__reason',
      'gn-attention__claim',
    ]);
  });
});

/**
 * BINDING SEMANTIC. Every instant this client renders goes through the domain's
 * one `formatIstInstant`, and the strip is the surface where that binds hardest:
 * `stale` and `due-soon` are day-shaped judgements, and a provenance date that
 * slid a day would put a claim on a day nobody made it.
 *
 * ## The shape here is `real-door-round-trip.test.ts`'s, not `board.test.tsx`'s
 *
 * Three things it takes from the stronger one:
 *   1. A CONTROL FIRST proving `process.env.TZ` moves this process's idea of
 *      local time. Under vitest's `threads` pool it does NOT — a worker thread
 *      gets no process-level reconfiguration — and without the control the
 *      harness would be inert and nobody would know. `board.test.tsx` records
 *      the measurement: under `--pool=threads` it was 32/32 green before its own
 *      probe existed. This repo's config sets no `pool`, so the knob does work
 *      here — which is a fact this control ESTABLISHES per run rather than one
 *      the suite may assume. **It establishes the knob and nothing more:** a
 *      working knob does not make the zone assertions below discriminate, and
 *      an earlier version of this sentence implied that it did.
 *   2. A FIXTURE-INTERESTINGNESS check. Three zones agreeing is worthless if
 *      the instant falls on the same calendar page in all three, so the
 *      straddle is asserted with plain arithmetic before anything leans on it.
 *   3. Each zone asserted against an INDEPENDENT expectation rather than
 *      against the other zones. Three agreeing WRONG answers pass a mutual
 *      comparison; they do not pass this.
 *
 * ## WHAT THE ZONE AXIS CANNOT CATCH TODAY, and what this block IS
 *
 * Against the CURRENT implementation the three zones discriminate nothing.
 * `formatDate` runs through `istDayBounds` and `formatIstInstant`, both constant
 * +05:30 arithmetic over the UTC getters (`packages/domain/src/ist-day.ts`,
 * `packages/domain/src/clock-skew.ts:51`) with no local-zone reader anywhere on
 * the path, so all three render one string. Measured 2026-09-02:
 * `formatDate('2026-08-19T10:00:00.000Z')` answered `19 Aug 2026` under
 * `Pacific/Kiritimati`, `Asia/Kolkata` and `Pacific/Niue` alike, against a
 * `toLocaleDateString` control in the same run that answered a different day in
 * one of them.
 *
 * So this is a REGRESSION GUARD, and that is where its teeth are: replacing
 * `formatDate`'s body with `new Date(value).toLocaleDateString()`
 * (`packages/app-core/src/provenance.ts:27`) kills TWO cases in this block —
 * `zone Pacific/Kiritimati: expected 'claimed by Anselma Marak on 20/8/2026' to
 * be 'claimed by Anselma Marak on 19 Aug 20…'` (vitest elides the tail), and its
 * day-anchored twin, `zone Pacific/Kiritimati: expected 'claimed by Anselma
 * Marak on 20/8/2026' to match / on 19 Aug 2026$/`.
 */
describe('3.61 AttentionStrip — one clock, and it is not the viewer’s laptop', () => {
  /** Straddling the product's own zone in both directions. Neither observes DST. */
  const ZONES = ['Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Niue'] as const;
  const SERVER_TIME = claim().serverTime;
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

  /**
   * The IST calendar day of an instant, computed WITHOUT `formatDate`,
   * `formatIstInstant` or anything else under test: shift by the fixed +05:30
   * and read the UTC page. An expectation produced by the function under test
   * agrees with it by construction, and which calendar page an instant lands
   * on is this block's entire subject.
   */
  const istDayHere = (instant: string): string =>
    new Date(Date.parse(instant) + IST_OFFSET_MS).toISOString().slice(0, 10);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** '2026-08-19' → '19 Aug 2026', by string surgery and a lookup. No Date, no zone. */
  function spellDay(isoDay: string): string {
    const [year, month, day] = isoDay.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
  }

  function provenanceUnder(zone: string): string {
    const original = process.env['TZ'];
    process.env['TZ'] = zone;
    try {
      const view = render(<AttentionStrip items={[ITEMS[0]!]} onOpenTicket={vi.fn()} />);
      const text = view.container.querySelector('.gn-attention__claim')?.textContent ?? '';
      view.unmount();
      return text;
    } finally {
      // `process.env.TZ = undefined` assigns the STRING "undefined", which ICU
      // resolves to GMT — so the naive restore does not restore, it switches
      // every file scheduled after this one in the same worker to UTC. It
      // corrupts ONLY when TZ was unset, which is the default here and in CI.
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  }

  it('CONTROL — setting process.env.TZ really does change what this process thinks local time is', () => {
    // Without this the three identical strings below prove nothing: they would
    // be identical because the knob is inert. `new Date(0)` is midnight UTC, so
    // its LOCAL hour is 0 in UTC and 5 in IST — a difference only a live TZ
    // switch produces.
    const original = process.env['TZ'];
    try {
      process.env['TZ'] = 'UTC';
      const utcHour = new Date(0).getHours();
      process.env['TZ'] = 'Asia/Kolkata';
      const istHour = new Date(0).getHours();
      expect(utcHour).toBe(0);
      expect(istHour).toBe(5);
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('CONTROL — the fixture instant really does land on different calendar pages in these zones', () => {
    // Kiritimati is a fixed +14 and Niue a fixed −11, so the local page can be
    // computed by adding the offset — no TZ database, no function under test.
    // 10:00Z on the 19th is 00:00 on the 20th in Kiritimati and 23:00 on the
    // 18th in Niue, while its IST page is the 19th. A device-reading defect
    // therefore lands off the recorded day in BOTH directions and cannot sneak
    // through on a zone that happens to agree.
    const pageAt = (offsetHours: number) =>
      new Date(Date.parse(SERVER_TIME) + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
    expect(istDayHere(SERVER_TIME)).toBe('2026-08-19');
    expect(pageAt(14)).toBe('2026-08-20');
    expect(pageAt(-11)).toBe('2026-08-18');
  });

  it('PLANTED DEFECT: the provenance date is the recorded IST day from every zone, each checked alone', () => {
    const expected = `claimed by Anselma Marak on ${spellDay(istDayHere(SERVER_TIME))}`;
    for (const zone of ZONES) {
      expect(provenanceUnder(zone), `zone ${zone}`).toBe(expected);
    }
  });

  /**
   * Anchored on what the day MUST be as well as on the two it must not be: an
   * absence assertion alone checks a SPELLING, and a defect rendering
   * `8/20/2026` contains neither "20 Aug" nor "18 Aug" while being exactly the
   * wrong answer. `ticket-list.test.tsx` measured that on this repo.
   */
  it('PLANTED DEFECT: and no zone can drag it onto the neighbouring day', () => {
    for (const zone of ZONES) {
      expect(provenanceUnder(zone), `zone ${zone}`).toMatch(/ on 19 Aug 2026$/);
      expect(provenanceUnder(zone), `zone ${zone}`).not.toContain('20 Aug');
      expect(provenanceUnder(zone), `zone ${zone}`).not.toContain('18 Aug');
    }
  });

  it('PLANTED DEFECT: the zone swap hands the worker back exactly the TZ it borrowed', () => {
    // SETS both configurations rather than observing whichever it inherits: the
    // tests above have already run, so an observing check would take the string
    // "undefined" as its baseline and find it faithfully restored.
    const outer = process.env['TZ'];
    try {
      delete process.env['TZ'];
      provenanceUnder('Pacific/Kiritimati');
      expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
      expect(process.env['TZ']).toBeUndefined();

      process.env['TZ'] = 'Pacific/Niue';
      provenanceUnder('Pacific/Kiritimati');
      expect(process.env['TZ']).toBe('Pacific/Niue');
    } finally {
      if (outer === undefined) delete process.env['TZ'];
      else process.env['TZ'] = outer;
    }
  });
});

/**
 * **⚠ CORRECTED 2026-09-20: this read *"`getAttention` REFUSES today*, and the
 * strip is the surface where a swallowed refusal is most dangerous: its emptiness
 * IS its message."*** `getAttention` ANSWERS — rulings P39/P40 served it, and the
 * register has been empty since 2026-09-19. **The property is unchanged, and so is
 * the fixture's shape:** the refusal is now CONSTRUCTED rather than inherited, and
 * what the cases below measure is the strip's behaviour when a read it needs does
 * not answer, whatever the cause. This still drives the REAL `ServingGapError`
 * class rather than a stand-in `Error`, so the assertion still pins the shape that
 * ships. **The original promise that the assertion "goes stale the day the register
 * changes" was kept to the letter:** it went stale, and this is that day.
 */
describe('3.60 useAttention — a refusal is an error, never an empty strip', () => {
  function Harness({ source }: { source: ReturnType<typeof createFakeDataSource> }) {
    const { data, error } = useAttention(source, WS);
    return (
      <div>
        <span data-testid="error">{error ?? 'none'}</span>
        <span data-testid="items">{data === null ? 'loading' : `items:${data.length}`}</span>
      </div>
    );
  }

  it('PLANTED DEFECT: the serving gap surfaces as an error and the strip never renders "0"', async () => {
    // The absence is CONSTRUCTED here, and that is a change from how this case
    // was written. It used to read the register — correct while `getAttention`
    // refused, and silently VACUOUS the moment ruling P40 served it: an empty
    // lookup falls back to `[]`, and a `ServingGapError` over no absences still
    // carries the message prefix this asserts, so the case would have gone on
    // passing while measuring a refusal about nothing. Its sibling below is what
    // caught that, and it is the same move `reopen-flow.test.tsx`'s
    // T13.4h-control made when P25 clause 1 served `getTicket`.
    //
    // What is under test here is the HOOK — that a refusal surfaces as an error
    // and `data` never becomes `[]` — which is true of any serving gap and does
    // not need this method to be one.
    const gap = new ServingGapError('getAttention', [
      {
        field: "AttentionItem kind 'contested' — its title",
        wireKey: 'title',
        wireRoute: '/v1/contests',
        because: 'a hand-built absence standing in for a refusal this method no longer makes',
        owner: 'this test',
      },
    ]);
    const source = createFakeDataSource({
      getAttention: async () => {
        throw gap;
      },
    });
    render(<Harness source={source} />);
    await act(async () => {});
    expect(screen.getByTestId('error')).toHaveTextContent('facts the shipped route does not serve');
    // The one thing that must not happen: `data` becoming `[]`.
    expect(screen.getByTestId('items')).toHaveTextContent('loading');
    expect(screen.getByTestId('items')).not.toHaveTextContent('items:0');
  });

  it('(INVERTED) getAttention no longer refuses, which is why the case above constructs its own absence', () => {
    // This pinned WHICH gap, so that an edit emptying the register could not
    // leave the case above passing on a refusal about nothing. Ruling P40 served
    // the gap, so the duty inverts rather than disappearing: it now pins the
    // fact that LICENSES the hand-construction above.
    //
    // The contested kind's title was the whole refusal. `GET /v1/contests`
    // serves `title` and `projectId` off the contest row now, so the fourth kind
    // is a join and the register carries nothing for this method.
    expect(SERVING_GAPS['getAttention']).toBeUndefined();
    // Non-vacuity, in the same run: the register still exists and still carries
    // a real refusal, so the line above is a fact about `getAttention` rather
    // than about a register that was emptied wholesale.
    // EMPTY SINCE 2026-09-19. `search` was the LAST entry in the register, and
    // the owner ruled its query must derive `matchedIn`, so the route serves it.
    // The two lines that stood here asserted the register held exactly
    // `['search']` AND that its absence list was non-empty — **a precondition
    // that no longer holds, and it failed loudly rather than passing vacuously.**
    // A register of one name is what made the assertion above (`toBeUndefined`)
    // a fact about THAT method; with the register empty it is true of every
    // method, and the honest statement is the emptiness itself.
    expect(Object.keys(SERVING_GAPS)).toEqual([]);
  });

  it('the hook subscribes to the workspace it was asked about', async () => {
    const source = createFakeDataSource();
    render(<Harness source={source} />);
    // Awaited inside `act` so the initial load's state update settles here
    // rather than escaping into the next test as an unwrapped-update warning.
    await act(async () => {});
    expect(source.subscriptions).toEqual([{ workspaceId: WS, afterSeq: 0 }]);
  });
});
