import { useMemo, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Avatar, Chip, Select, Table, type TableColumn } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { actorLabel, formatDate } from '../provenance.js';
import {
  DEFAULT_GROUPING,
  DEFAULT_LIST_COLUMNS,
  DEFAULT_VIEW_PREFS,
  prefsOriginOf,
  type FilterSpec,
  type Grouping,
  type ListColumnId,
  type ListRow,
  type PrefsOrigin,
  type ProjectViewPrefs,
} from '../view-types.js';
import {
  columnLabel,
  countRows,
  groupRows,
  nestRows,
  recentlyAssignedRows,
  visibleNodes,
  type GroupLabels,
  type ListRowNode,
} from './list-model.js';
// The drag payload's ONE spelling (second wave Task 4). `board.tsx` exports it
// and this file IMPORTS it rather than re-typing `'text/plain'`: two spellings
// of the same format drift apart silently, and the failure mode of a drifted
// format is a drop that reads `''` — a reorder that does nothing and says
// nothing, which is exactly the class of defect this series keeps recording.
// No import cycle: `board.tsx` imports nothing from this module.
import { DRAG_TICKET_FORMAT } from './board.js';
import { formatRollup } from './rollup-text.js';
import { useLiveQuery } from './use-live-query.js';
import { usePreferences } from './use-preferences.js';

const GROUPING_OPTIONS: Grouping[] = ['epic', 'status', 'assignee', 'type', 'flat'];
const AVAILABLE_COLUMNS: ListColumnId[] = ['status', 'assignee', 'dueDate', 'type', 'progress'];

/**
 * What a group's title NAMES, transcribed from the prototype's own grouping
 * table (`design-system/interactive/desktop.dc.html:2897-2917`, where every
 * `push(key, title, meta)` call carries one of these seven words).
 *
 * The band prints `${meta} · ${n} ticket(s)` — one sentence saying what kind of
 * thing the title above it is and how many of them are in it. Only four of the
 * prototype's seven words are reachable here: `workflow` groups by a field the
 * ListRow projection does not carry, and `not in this narrowing` / `names none`
 * are that same table's two epic-specific ABSENCE cases, which this product
 * spells on the section title itself (`list-model.ts`: "No epic",
 * "Unassigned") — naming the absence twice on one band would read as two facts.
 *
 * `flat` has no entry because it has no band: `groupRows` answers one section
 * whose rows are the whole set, and `TicketList` has never rendered a heading
 * for it.
 */
const GROUP_META: Record<Exclude<Grouping, 'flat'>, string> = {
  epic: 'epic',
  status: 'state',
  assignee: 'assignee',
  type: 'type',
};

/**
 * Whether the arrangement on screen is the user's own or this client's stock
 * one. Ruling P24 (coordination doc): *"reaching for a default there presents a
 * default as the user's own choice"* — so the surface says which it is showing.
 *
 * DECLARED IN `view-types.ts` and re-exported here. It used to be declared here
 * and describe the PROJECT only; the same ruling's other asymmetry needs the
 * same word per HALF (`Chosen<T>`), and two spellings of one ruling is the
 * two-sources-of-truth shape this series keeps catching. One name, both scopes.
 */
export type { PrefsOrigin };

export type TicketListProps = {
  rows: ListRow[];
  currentUserId: string;
  /**
   * Both halves, each carrying whether the user chose it. There is deliberately
   * NO separate `prefsOrigin` prop beside this one: the origin is a fact ABOUT
   * these halves, and a second prop carrying it could be passed disagreeing with
   * them — `prefsOrigin="stored"` over two `default` halves would put the user's
   * name on a stock arrangement, which is the exact thing ruling P24 forbids,
   * reintroduced through the prop list. Derived here via `prefsOriginOf`.
   */
  prefs: ProjectViewPrefs;
  onPrefsChange: (prefs: ProjectViewPrefs) => void;
  /**
   * What narrowing produced `rows`, in words, or `undefined` when they are the
   * project's whole visible set.
   *
   * **The summary is a claim about the project, so it may not be left alone when
   * the rows stop being all of it.** `{total} tickets · {terminal} done` over a
   * filtered set says the project holds `total` tickets, which is 12.258's defect
   * — a partial list presented as whole — wearing a different costume. That case
   * is why `getTickets` refuses past the cap rather than serving the pages it
   * already has; serving a NARROWED set silently would give back exactly what the
   * refusal was protecting.
   *
   * Carried as words rather than a boolean because a reader needs to know WHICH
   * narrowing: "3 tickets" under an unnamed filter is no more honest than "3
   * tickets" presented as the project.
   */
  narrowing?: string;
  /**
   * False while the preferences document has not loaded. The controls are
   * DISABLED rather than silently inert, because a write in that window cannot
   * merge into a document this client has not read — see `useTicketList`.
   */
  prefsEditable?: boolean;
  labels: GroupLabels;
  onOpenTicket: (ticketId: string) => void;
  /**
   * A trailing, per-row slot (Task 10, backlog/closed spec §5.4) — the Backlog
   * tab's per-row **Start** button rides here (`apps/web/src/backlog-start-button.tsx`),
   * called once per row and rendered in a trailing `<td>` of `ListTable`'s own
   * table, with a matching empty header cell.
   *
   * OPTIONAL, and absence means NO trailing column at all — not one rendered
   * with empty cells. The List, Calendar and Timeline arms of the project page
   * pass nothing here and render byte-identical markup to before this prop
   * existed (13.597 pins the negative: `queryAllByRole('button', {name: /^Row
   * action /})` is empty with no `rowAction` passed).
   *
   * Threaded to BOTH `ListTable` mounts below (the pinned "Recently assigned"
   * section and every grouped section) — a row assigned to `currentUserId`
   * legitimately renders TWICE on screen (invariant 1, this component's own
   * docblock), so its `rowAction` renders twice too, with whatever
   * distinguishes two occurrences of the same entity left to the caller (an
   * `aria-label` keyed only by title, for instance, would collide — see the
   * Backlog tab's own row fixtures, which are deliberately unassigned).
   */
  rowAction?: (row: ListRow) => ReactNode;
  /**
   * The sentence a zero-row set shows in place of the table. OPTIONAL, and
   * absence means NO sentence — this is the ENTIRE pre-Task-10 behaviour,
   * carried forward rather than replaced: before this prop existed,
   * `TicketList` rendered nothing at all beneath its controls bar for a
   * zero-row set (`groupRows([], grouping, labels)` answers `[]` for every
   * grouping but `flat`, so `sections.map` has nothing to iterate; `flat`
   * itself answers one section holding zero rows, which renders an empty
   * table with no message either). Measured by reading the component, not
   * assumed — see 13.596 (`ticket-list.test.tsx`) for the pinned default.
   *
   * A DEFAULT sentence was considered and refused: `rows.length === 0` means
   * "the project truly holds none" on one tab and "a filter hid all of them"
   * on another (`listNarrowing`'s own docblock in `apps/web`, and Ruling 19's
   * `isNarrowed` one layer up in `board.tsx`), and this component cannot tell
   * the two apart — only a caller holding the narrowing context can. So the
   * List tab passes nothing and keeps its silence; the Backlog tab
   * (`apps/web`'s project page) passes "Nothing in the backlog — new tickets
   * land here." — a sentence that is TRUE of that tab specifically, not a
   * generic one this component would have had to invent.
   */
  emptyCopy?: string;
  /**
   * Row drag, for a surface with a manual order (second wave, spec §8.1).
   *
   * OPTIONAL, and absence is the entire pre-Task-4 behaviour: no row is
   * `draggable`, no handler is attached, and no tail zone renders. Every
   * other tab passes nothing and renders byte-identical markup to before
   * this prop existed (13.705's negative arm is what measures that).
   *
   * When present, each `<tr>` carries `draggable` plus the four drag
   * handlers, and a tail zone follows the tables for "place last":
   *
   * - `onReorder(movedTicketId, beforeTicketId)` — `beforeTicketId` is the row
   *   the drop LANDED ON, meaning *put `moved` immediately before it*. The
   *   tail zone reports `null`, meaning *put `moved` last*.
   * - A drop on the dragged row itself is refused here, not passed on: it is
   *   a gesture the user began and ended on the same row, and a caller told
   *   about it would compute a no-op move and put a claim on the wire for it.
   * - A payload carrying NO ticket id (a drag that began outside this list)
   *   is refused for the same reason — `onReorder('')` would name a ticket
   *   that does not exist in the caller's order.
   *
   * **These are React props on the row, not a registry.** 13.534 recorded the
   * flake a passive `useEffect`-registered attempt map produced on the Board:
   * a callback registered by one render answering a drop that belongs to
   * another. Props are attached during the render that draws the row, so the
   * row a drop lands on is the row whose handler fires. The Board's registry
   * exists because a drop there must reach the DRAGGED card's `attemptMove`
   * closure; here the dragged id travels in the `dataTransfer` payload — the
   * thing the browser itself carries across the gesture — so there is nothing
   * to look up.
   */
  rowDrag?: {
    onReorder: (movedTicketId: string, beforeTicketId: string | null) => void;
  };
};

/**
 * The Asana-shaped list, and the three ways it refuses to lie.
 *
 * 1. **Grouping is a REARRANGEMENT, never a filter.** Every row this view is
 *    given renders exactly once ACROSS THE SECTIONS, under all five groupings.
 *    A grouping that drops a row is a filter wearing a grouping's name, and the
 *    ticket it dropped is gone with nothing saying so.
 *
 *    "Exactly once across the sections" and not "exactly once on the page":
 *    *Recently assigned* is an additional SURFACE pinned above them, so a row
 *    assigned to the viewer legitimately appears twice on screen — once pinned,
 *    once in its section. Measuring the invariant document-wide measures the
 *    pin instead of the grouping.
 *
 * 2. **Counts never shrink for visibility.** The summary reads `countRows` over
 *    the FLAT set, so neither the grouping nor a collapsed subtree can move it;
 *    and a restricted child stays in the progress column's denominator with the
 *    restriction NAMED beside it (`formatRollup`), never quietly subtracted.
 *
 * 3. **Nesting never hides a row.** A row whose parent is restricted has no
 *    visible parent to indent under, so it renders at the root WITH the
 *    restriction named — never dropped for want of somewhere to put it.
 *
 * Every instant here goes through `formatDate`, which is `provenance.ts`'s one
 * door onto the domain's `formatIstInstant`. No `toLocaleString`, no
 * `iso.slice(0, 10)`: a timestamp that shifts with the viewer's laptop is a
 * claim the record never made.
 */
export function TicketList({
  rows,
  currentUserId,
  prefs,
  onPrefsChange,
  prefsEditable = true,
  labels,
  onOpenTicket,
  narrowing,
  rowAction,
  emptyCopy,
  rowDrag,
}: TicketListProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  /*
    The gesture's two live facts (second wave Task 4). Both are view state, not
    preferences: which row is under the pointer right now is a fact about this
    moment on this screen, and persisting it would put a document on the wire
    every time somebody dragged a row.

    Held HERE rather than in `ListTable` because the tail zone is rendered once
    for the whole list (below), not once per section — a grouped list mounts
    `ListTable` per section, and the marker has to survive crossing between
    them mid-gesture.
  */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);

  /*
    Every row's drag props, or `undefined` when no caller wired `rowDrag` — in
    which case `Table` spreads nothing and the rows render exactly as they did
    before this task.
  */
  const dragRowProps =
    rowDrag === undefined
      ? undefined
      : (node: ListRowNode): HTMLAttributes<HTMLTableRowElement> => {
          const id = node.row.ticketId;
          return {
            draggable: true,
            onDragStart: (event) => {
              // The payload the DROP side reads. Written under the format
              // `board.tsx` exports, so a list drag and a board drag cannot
              // disagree about where the id lives.
              event.dataTransfer.setData(DRAG_TICKET_FORMAT, id);
              event.dataTransfer.effectAllowed = 'move';
              setDraggingId(id);
            },
            /*
              `dragend` fires on the SOURCE whatever the gesture's outcome —
              a drop on another row, a drop on the tail zone, or a release
              over nothing at all. Clearing both facts here is what keeps the
              marker honest for the one case no handler of ours runs for: an
              abandoned drag would otherwise leave a row marked `--dragging`
              and a stale `--drop-before` line on screen.
            */
            onDragEnd: () => {
              setDraggingId(null);
              setDropBeforeId(null);
            },
            onDragOver: (event) => {
              // A browser fires `drop` only over a target that cancelled
              // `dragover`; without this the row is not a drop target at all.
              event.preventDefault();
              setDropBeforeId(id);
            },
            onDrop: (event) => {
              event.preventDefault();
              const moved = event.dataTransfer.getData(DRAG_TICKET_FORMAT);
              setDraggingId(null);
              setDropBeforeId(null);
              // Nothing to reorder: a gesture that began outside this list
              // carries no id, and one that began and ended on this row asks
              // for a move to where it already is. Both are refused HERE
              // rather than handed to a caller that would have to guess.
              if (moved === '' || moved === id) return;
              rowDrag.onReorder(moved, id);
            },
            className: [
              draggingId === id ? 'gn-list__row--dragging' : null,
              dropBeforeId === id ? 'gn-list__row--drop-before' : null,
            ]
              .filter(Boolean)
              .join(' '),
          };
        };
  /**
   * The column tray's own open/closed state — component-local and deliberately
   * NOT a preference. `prefs` is the arrangement (which columns, in what
   * order); whether the tray is currently unfolded is a fact about this moment
   * on this screen, and storing it would PUT a document to the server every
   * time somebody glanced at the column list.
   *
   * Replaces a `<details>`/`<summary>` disclosure, and the reason is layout
   * rather than taste: the prototype's tray is a full-width band BESIDE the
   * controls row (`desktop.dc.html:415-421`), and a `<details>` in a flex row
   * puts its content inside its own flex item, so the tray could only ever be
   * as wide as the toggle. The tray below is a sibling of the controls row
   * instead. The summary's accessible name ("Columns") is carried over
   * verbatim onto the button that replaces it, and `aria-expanded` states what
   * the `<details>` element used to state structurally.
   */
  const [columnsOpen, setColumnsOpen] = useState(false);
  const counts = countRows(rows); // ALWAYS from the flat set — sections cannot alter it
  // The ONE place a stock value is named, with the origin still in hand. The
  // `default` arm of `Chosen` carries no `value`, so this narrowing is not a
  // style choice — reading `prefs.columns.value` unguarded does not compile.
  const columns = prefs.columns.origin === 'stored' ? prefs.columns.value : DEFAULT_LIST_COLUMNS;
  const grouping = prefs.grouping.origin === 'stored' ? prefs.grouping.value : DEFAULT_GROUPING;
  // Bound ONCE here rather than indexed at the band below: the band sits inside
  // `sections.map`'s callback, and a `Grouping` narrowed to its non-`flat` arm
  // by an enclosing `=== 'flat'` test is not carried into a closure. Reading
  // `GROUP_META[grouping]` down there does not compile under `strict`; reading
  // it here, where the narrowing is still in hand, does — the same
  // one-binding-earlier adaptation `list-model.ts`'s `groupRows` records.
  const groupMeta: string | null = grouping === 'flat' ? null : GROUP_META[grouping];
  const sections = useMemo(() => groupRows(rows, grouping, labels), [rows, grouping, labels]);
  const pinned = useMemo(() => recentlyAssignedRows(rows, currentUserId), [rows, currentUserId]);

  const toggleCollapse = (ticketId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  // Toggling is where the user ACQUIRES authority over this half: whatever was
  // on screen becomes theirs, so the half goes out `origin: 'stored'`. The other
  // half is passed through untouched — including its `default` origin, which is
  // why `toServerPreferences` can still decline to store it.
  const toggleColumn = (id: ListColumnId) => {
    const next = columns.includes(id) ? columns.filter((column) => column !== id) : [...columns, id];
    onPrefsChange({ ...prefs, columns: { origin: 'stored', value: next } });
  };

  return (
    <div className="gn-list">
      <div className="gn-list__controls">
        <span data-testid="list-summary" className="gn-list__summary">
          {/*
            The `done` half is dropped when narrowed rather than carried. It is a
            fact about the PROJECT — "of your tickets, this many are finished" —
            and over a narrowed set it is a fact about the narrowing instead,
            which under the only shipped one (`stateCategories: ['active']`) is
            structurally always `0 done`. A number that can only ever say zero is
            not information; it is a familiar shape inviting a reader to draw the
            project-wide conclusion the count no longer supports.
          */}
          {narrowing === undefined
            ? `${counts.total} tickets · ${counts.terminal} done`
            : `${counts.total} matching`}
        </span>
        {/*
          The narrowing is stated in the SUMMARY ROW and not only by the control
          that set it, because a control scrolled out of view leaves a bare count
          behind — and a bare count is read as the project's size. The same
          argument `list-prefs-origin` above makes for a stock arrangement: what
          produced what is on screen belongs on screen.

          `matching` rather than `tickets` in the count above is the other half.
          A note saying "narrowed" beside the words "12 tickets" still leaves the
          number claiming to be the project's, and the number is what a person
          reads first.
        */}
        {narrowing === undefined ? null : (
          <span className="gn-list__narrowing" data-testid="list-narrowing">
            narrowed to {narrowing} — not the whole project
          </span>
        )}
        <div className="gn-list__control">
          <span>Group by</span>
          <Select
            options={GROUPING_OPTIONS.map((option) => ({ value: option, label: option }))}
            value={grouping}
            disabled={!prefsEditable}
            onChange={(next) =>
              onPrefsChange({
                ...prefs,
                grouping: { origin: 'stored', value: next as Grouping },
              })
            }
            aria-label="Group by"
          />
        </div>
        <button
          type="button"
          className="gn-list__columns-toggle"
          aria-expanded={columnsOpen}
          onClick={() => setColumnsOpen((open) => !open)}
        >
          {/* The prototype's own caret (`desktop.dc.html:2789`): `▸` closed,
              `▾` open — drawn in CSS off `aria-expanded` rather than rendered
              as text, so the toggle's accessible name stays exactly
              "Columns" and no screen reader announces a direction glyph. */}
          <span className="gn-list__columns-caret" aria-hidden="true" />
          <span>Columns</span>
        </button>
        {/*
          P24's asymmetry, at the only place a user can see it. Both scopes of
          it, because the ruling has two and the surface used to say only one:

          - NEITHER half chosen — the project is absent from the stored document
            and the whole arrangement on screen is this client's stock one.
          - ONE half chosen — the server holds the project in `listColumns` and
            not in `grouping` (or the reverse), which `mapPreferences` used to
            erase by filling the missing half with a default. It reaches here
            intact now, so the note names WHICH half nobody chose.

          Silence in either case signs a default with the user's name.
        */}
        {prefsOriginOf(prefs) === 'default' ? (
          <span className="gn-list__origin" data-testid="list-prefs-origin">
            default arrangement — you have not arranged this project
          </span>
        ) : (
          <>
            {prefs.columns.origin === 'default' ? (
              <span className="gn-list__origin" data-testid="list-prefs-origin-columns">
                default columns — you have not chosen columns for this project
              </span>
            ) : null}
            {prefs.grouping.origin === 'default' ? (
              <span className="gn-list__origin" data-testid="list-prefs-origin-grouping">
                default grouping — you have not chosen a grouping for this project
              </span>
            ) : null}
          </>
        )}
      </div>

      {/*
        The column tray — the prototype's `columnsOpen` band
        (`design-system/interactive/desktop.dc.html:415-421`), a sunken strip of
        raised pill chips BELOW the whole controls row.

        RENDERED ALWAYS, HIDDEN WITH `hidden`. Not a `{columnsOpen ? … : null}`
        conditional, and the reason is a test that would otherwise go red
        silently: `ticket-list.test.tsx:274` clicks `getByLabelText('Type')` on a
        List whose tray has never been opened, so the checkbox must be IN THE
        DOCUMENT while the tray is closed. That is exactly what the `<details>`
        this replaces gave it — jsdom keeps a closed `<details>`' children
        mounted — and dropping the element instead of hiding it would turn that
        case into "unable to find a label with the text of: Type" for a reason
        (a markup change) that has nothing to do with what the case measures
        (which half of the preferences a column toggle transfers authority
        over). The CSS carries the matching `.gn-list__columns-tray[hidden]`
        rule, because `display: flex` outranks the UA's `[hidden]` treatment.

        FIVE OPTIONS, NOT THE PROTOTYPE'S EIGHT. `AVAILABLE_COLUMNS` is the
        wire-backed half of `LIST_COLS`; `Workflow`, `Priority` and the
        ticket-key column have no field on `ListRow` to read, and inventing one
        is what the column-gap ruling forbids.
      */}
      <div className="gn-list__columns-tray" data-testid="list-columns-tray" hidden={!columnsOpen}>
        {AVAILABLE_COLUMNS.map((id) => (
          <label key={id} className="gn-list__column-option">
            {/*
              A REAL `<input type="checkbox">`, kept for three reasons that all
              outrank drawing the prototype's box by hand: `getByLabelText`
              resolves to it (four cases in this file's suite query the column
              toggles by label text, including the click above), it is the
              control the browser gives a real checked state and a real keyboard
              contract for free, and `disabled={!prefsEditable}` needs an
              element that HAS a disabled state. It is moved out of flow and
              made transparent in CSS rather than replaced.

              The box is the span below, and it is EMPTY IN THE DOM: the tick is
              a `::after` pseudo-element, so it contributes no text node. The
              prototype draws that tick as an 11px character
              (`desktop.dc.html:2795`, `font-size:11px`), which is under this
              product's own 12px label floor (`apps/web/e2e-viewport/type-scale.ts`,
              `LABEL_FLOOR_PX`) — a floor that measures DIRECT text nodes, which
              a pseudo-element is not. Drawing it in CSS passes the floor
              honestly instead of dodging it with a lower case.
            */}
            <input
              type="checkbox"
              checked={columns.includes(id)}
              disabled={!prefsEditable}
              onChange={() => toggleColumn(id)}
            />
            <span className="gn-list__column-box" aria-hidden="true" />
            {/*
              The visible label is its OWN span so that `label.textContent` is
              exactly the column name. `getByLabelText('Status')` matches on
              the wrapper label's whole text, so a tick or a box glyph sitting
              as a sibling text node would break four existing cases on a
              spelling rather than on a behaviour.
            */}
            <span>{columnLabel(id)}</span>
          </label>
        ))}
      </div>

      {pinned.length > 0 ? (
        <section role="region" aria-label="Recently assigned" className="gn-list__pinned">
          <h3 className="gn-list__section-title">Recently assigned</h3>
          <ListTable
            nodes={pinned.map((row) => ({ row, depth: 0, hasChildren: false }))}
            columns={columns}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onOpenTicket={onOpenTicket}
            rowAction={rowAction}
            {...(dragRowProps === undefined ? {} : { rowProps: dragRowProps })}
          />
        </section>
      ) : null}

      {sections.map((section) => {
        const nodes = visibleNodes(nestRows(section.rows), collapsed);
        return (
          <section key={section.key} role="region" aria-label={section.label} className="gn-list__section">
            {groupMeta === null ? null : (
              /*
                The band's SECOND sentence, and it is a count of the section's
                own rows — never of what is on screen. `visibleNodes` above can
                hide a collapsed subtree; `groupRows` cut this section from the
                complete set, so the band keeps answering for the section the
                same way the summary keeps answering for the project
                (`countRows`'s own docblock: a count read off the screen is a
                count of the user's scroll position).

                `section.rows.length`, and the prototype prints a DIFFERENT
                number beside the same word. Measured in the 2026-09-18 file:
                the sentence is built at `:2923` as
                `g.meta + " · " + n + (n === 1 ? " ticket" : " tickets")` with
                `const n = g.items.length` (`:2920`), and under the epic
                grouping the epic is held SEPARATELY (`g.epic`, `:2904`) and
                never pushed into `items` — so the prototype counts a group's
                CHILDREN while it renders the epic row above them (`:2927`,
                `:2928`). An epic with three children reads `epic · 3 tickets`
                there and renders four rows; here it reads `epic · 4 tickets`.
                The three non-epic axes agree.

                DECLARED DIVERGENCE, kept deliberately: in this model an epic is
                a row like any other (`list-model.ts`, `nestRows`), the section's
                own list is the whole membership, and the band answers for its
                section the way the summary answers for the project — a count
                that left the epic out would name a membership no row on screen
                has. For the same reason the count is `section.rows.length` and
                not `nodes.length` below: `visibleNodes` hides a collapsed
                subtree, and a band that shrank when a row was collapsed would be
                a count of the user's scroll position.
              */
              <h3 className="gn-list__section-title">
                <span className="gn-list__section-name">{section.label}</span>
                <span className="gn-list__section-meta">
                  {`${groupMeta} · ${section.rows.length} ${section.rows.length === 1 ? 'ticket' : 'tickets'}`}
                </span>
              </h3>
            )}
            <ListTable
              nodes={nodes}
              columns={columns}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onOpenTicket={onOpenTicket}
              rowAction={rowAction}
              {...(dragRowProps === undefined ? {} : { rowProps: dragRowProps })}
            />
          </section>
        );
      })}

      {/*
        Task 10 (backlog/closed spec §5.4) — see `emptyCopy`'s own docblock on
        `TicketListProps` for why this is gated on the CALLER supplying a
        sentence rather than a component-owned default: `rows.length === 0`
        is ambiguous between "the project has none" and "a filter hid them
        all", and only the caller holds enough context to say which. Reads
        `rows`, the raw prop, never a section or `pinned` count — the exact
        set this component was asked to show, before grouping or collapsing
        touch it.
      */}
      {rows.length === 0 && emptyCopy !== undefined ? (
        <p className="gn-list__empty" data-testid="list-empty">
          {emptyCopy}
        </p>
      ) : null}

      {/*
        The tail drop zone — "place last" (second wave Task 4, spec §8.1).

        Rendered ONCE for the whole list and only when a caller wired row
        dragging: an empty drop target is a promise no other surface makes, and
        a sectioned list mounts one `ListTable` per section — a zone per
        section would put N targets on screen to say the one thing, and a drop
        on any of them means the same order, so N of them would be N claims
        that a part is the whole. `onReorder(moved, null)` is the one thing a
        drop here can mean: last, in the caller's own order.

        `aria-hidden` because this is a mouse gesture's affordance and nothing
        else — no text, no role, no keyboard path of its own. The keyboard
        route to the same order is `Move up` / `Move down`, which the Backlog
        tab composes beside each row (Task 5).
      */}
      {rowDrag === undefined ? null : (
        <div
          className="gn-list__tail-drop"
          aria-hidden="true"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const moved = event.dataTransfer.getData(DRAG_TICKET_FORMAT);
            setDraggingId(null);
            setDropBeforeId(null);
            // Same refusal as a row drop: a gesture that began outside this
            // list carries no id, and `onReorder('')` would name a ticket that
            // does not exist in the caller's order.
            if (moved === '') return;
            rowDrag.onReorder(moved, null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The shipped `Table` (`@gisik-nokma/ui`), not a second one. The plan hand-rolls
 * markup identical to it — `gn-table__scroll` / `gn-table__header` /
 * `gn-table__cell` — which is a copy of a component the design system owns, and
 * the day the table grows a sticky header or a scroll shadow this surface would
 * silently not get it. The indentation, the collapse toggle and the
 * restricted-parent marker all fit in the first column's `cell`.
 *
 * ## Board prototype port Task 9 (2026-09-16), spec List `:405-479`
 *
 * `.gn-list__table-wrap` gives the metrics table's "Container" row —
 * `cardBg + cardShadow; radius cardR; overflow:auto` — WITHOUT touching
 * `Table`'s own shared output: it wraps the `<Table>` element from the
 * outside, so `.gn-table__scroll`/`.gn-table` (both on the do-not-edit list,
 * `.gn-table` by name) render exactly as they do for every other consumer.
 *
 * ## Ruling 21 (coordinator, 2026-09-16) — the five deferred metrics, now landed
 *
 * The task's own report deferred "Table: min-width:820px", "Header cell",
 * "Zebra", "Data cell" and the title cell's own "min-width:260px" — each was
 * reachable only through an element `Table` renders itself, and `Table` had
 * no class hook. The coordinator approved extending `Table` with optional
 * `className`/`headerClassName`/`rowClassName`/`TableColumn.cellClassName`
 * (`table.tsx`, composed the way `Card` already composes its own), so every
 * new rule these five metrics need lands on a `.gn-list-*` selector here,
 * never on `.gn-table`/`.gn-table__header`/`.gn-table__cell`/`.gn-table__row`
 * themselves.
 *
 * `gn-list__table-header` on every column (title and data alike — the
 * metric is uniform across the row) gives "Header cell". `gn-list__table`
 * on `<Table>` gives "Table". `gn-list__table-row` on `<Table>` gives
 * "Zebra". `gn-list__table-cell--data` on every non-title column gives
 * "Data cell". `gn-list__table-cell--title` on the title column ALONE
 * — distinct from `--data` because its metric differs (`min-width:260px`,
 * and a depth-dependent LEFT edge the other columns don't have) — gives the
 * title cell's static top/right/bottom padding and its own `min-width`; the
 * one part that still cannot live there is the DEPTH-dependent portion of
 * the left padding, since `depth` is a fact about one ROW, not the column,
 * and `cellClassName` is declared once per column. That stays exactly where
 * it already was: a `paddingLeft` inline style on the inner
 * `.gn-list__title-cell` span. Because `--title` now zeroes the `<td>`'s own
 * left padding (the SAME equal-specificity/later-source-order technique
 * `.gn-board-card` already uses against `.gn-card`), the span's inline style
 * is now the CELL's entire left edge rather than an addition on top of an
 * uneditable base — so the rendered padding is pixel-exact against the
 * metric's `calc(16px + depth*22px)` for the first time, closing the
 * Task 9 report's own "not pixel-exact" caveat.
 */
function ListTable({
  nodes,
  columns,
  collapsed,
  onToggleCollapse,
  onOpenTicket,
  rowAction,
  rowProps,
}: {
  nodes: ListRowNode[];
  columns: ListColumnId[];
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (ticketId: string) => void;
  onOpenTicket: (ticketId: string) => void;
  rowAction?: (row: ListRow) => ReactNode;
  /** Second wave Task 4 — see `TicketListProps.rowDrag`. Absent on every surface that does not reorder. */
  rowProps?: (node: ListRowNode) => HTMLAttributes<HTMLTableRowElement>;
}) {
  const tableColumns: TableColumn<ListRowNode>[] = [
    {
      id: 'title',
      header: 'Title',
      headerClassName: 'gn-list__table-header',
      cellClassName: 'gn-list__table-cell--title',
      cell: (node) => (
        <span
          className="gn-list__title-cell"
          data-testid={`ticket-card-${node.row.ticketId}`}
          // Spec List `:405-479`, "Title cell": `padding:12px 16px 12px
          // calc(16px + depth*22px)`. The top/right/bottom thirds now live
          // on the `<td>` itself (`.gn-list__table-cell--title`, this
          // function's docblock) — only the DEPTH-dependent left offset
          // stays here, since depth is a per-ROW fact `cellClassName`
          // (declared once per COLUMN) cannot express. Plain arithmetic,
          // not a CSS calc(): depth is a number known only at render time.
          style={{ paddingLeft: `${16 + node.depth * 22}px` }}
        >
          {node.hasChildren ? (
            <button
              type="button"
              className="gn-list__collapse"
              aria-label={`${collapsed.has(node.row.ticketId) ? 'Expand' : 'Collapse'} ${node.row.title}`}
              onClick={() => onToggleCollapse(node.row.ticketId)}
            >
              {collapsed.has(node.row.ticketId) ? '▸' : '▾'}
            </button>
          ) : (
            /*
              The prototype's `noCaret` spacer (`desktop.dc.html:449`):
              `width:22px; flex:none`. Without it, a row with no children has
              its title 22px to the left of its siblings' — the caret's column
              disappears instead of standing empty, so a section of leaves and
              a section of parents do not line up down the left edge, and two
              rows at the SAME depth (the thing `paddingLeft` above is the
              whole measure of) do not start at the same x. Drawn as an empty
              span: it is a layout reservation, not a character.
            */
            <span className="gn-list__caret-spacer" aria-hidden="true" />
          )}
          {/*
            "Title button": the prototype computes the weight per ROW
            (`desktop.dc.html:2873`) — `isEpicT(t) ? "600" : depth ? "400" :
            "500"` — so it cannot live in a class: `gn-list__open` is declared
            once, and which of the three applies is a fact about this row.

            `typeRank === 1` is this product's `isEpicT`. The prototype tests
            the type's NAME (`t.type === "Epic"`); `ListRow` carries no type
            name (the column-gap ruling's second round-trip would have to fetch
            one), but it carries the fact the name is a label FOR: rank 1 is
            the epic rank, which is the same rank `epicId`'s own docblock names
            ("the nearest rank-1 ancestor, for grouping by epic") and the same
            one `packages/domain/src/ticket-types.ts` gives the built-in
            `{ id: 'epic', name: 'Epic', rank: 1 }`. Reading the rank rather
            than the id also keeps this true for a workspace that has renamed
            or replaced its top-level type.
          */}
          <button
            type="button"
            className="gn-list__open"
            style={{ fontWeight: node.row.typeRank === 1 ? 600 : node.depth > 0 ? 400 : 500 }}
            onClick={() => onOpenTicket(node.row.ticketId)}
          >
            {node.row.title}
          </button>
          {node.row.pending ? (
            <Chip tone="pending" title="A claim for this ticket is queued and the server has not answered it yet">
              claim in transit
            </Chip>
          ) : null}
          {node.row.hasRestrictedParent ? (
            <Chip tone="restricted" title="This ticket hangs under a ticket you may not see">
              under a restricted parent
            </Chip>
          ) : null}
        </span>
      ),
    },
    ...columns.map((id) => ({
      id,
      header: columnLabel(id),
      headerClassName: 'gn-list__table-header',
      cellClassName: 'gn-list__table-cell--data',
      cell: (node: ListRowNode) => <ListCell row={node.row} columnId={id} />,
    })),
    // Task 10 (backlog/closed spec §5.4) — a TRAILING column, present only
    // when a caller supplies `rowAction`. An empty header cell (`header:
    // ''`) rather than omitting the header row's cell entirely: `Table`
    // renders one `<th>` per entry in `columns`, so a mismatched column
    // count between `<thead>` and every `<tbody>` row would be the bug, not
    // the fix.
    ...(rowAction === undefined
      ? []
      : [
          {
            id: 'row-action',
            header: '',
            headerClassName: 'gn-list__table-header',
            cell: (node: ListRowNode) => rowAction(node.row),
          },
        ]),
  ];
  return (
    <div className="gn-list__table-wrap">
      <Table
        columns={tableColumns}
        rows={nodes}
        rowKey={(node) => node.row.ticketId}
        className="gn-list__table"
        rowClassName="gn-list__table-row"
        {...(rowProps === undefined ? {} : { rowProps })}
      />
    </div>
  );
}

function ListCell({ row, columnId }: { row: ListRow; columnId: ListColumnId }) {
  switch (columnId) {
    case 'status':
      return (
        <>
          <Chip
            tone={row.stateCategory}
            title={`marked ${row.stateName} by ${actorLabel(row.stateProvenance.actorId, row.stateProvenance.actorName)} on ${formatDate(row.stateProvenance.serverTime)}`}
          >
            {row.stateName}
          </Chip>
          {/*
            Task 10 (backlog/closed spec §5.4/§1.2) — BESIDE the state chip,
            never replacing it: `closed` and `stateId` are independent facts
            (spec §1.2 — a closed ticket keeps the state it was closed FROM),
            so a card closed out of "Doing" still reads "Doing" — the Closed
            chip is what says it will not move again without a reopen. `row.closed`
            is REQUIRED on `ListRow` (unlike the optional domain `TicketState.closed?`
            441 fixtures predate — `view-types.ts:223-230`), so this reads it
            directly rather than through the `?? null` idiom readers of the
            optional form use.
          */}
          {row.closed !== null ? (
            <Chip tone="neutral" title={`closed by ${actorLabel(row.closed.actorId, null)} on ${formatDate(row.closed.at)}`}>
              Closed
            </Chip>
          ) : null}
        </>
      );
    case 'assignee':
      // "Unassigned" rather than a dash (spec List `:2850`, the prototype's own
      // `t.who ? … : "Unassigned"`). Not a cosmetic preference: an absent
      // ASSIGNEE is a state a person acts on ("nobody has this"), and a bare
      // `—` under an "Assignee" header reads as a value that failed to load.
      // Rendered at full label tone, not the muted `.gn-list__empty-cell` the
      // dash used — the prototype's plain-cell `tone` is `--label` unless the
      // cell is a due date, which is the next case.
      return row.assignee === null ? (
        <span>Unassigned</span>
      ) : (
        <span className="gn-list__assignee">
          <Avatar name={actorLabel(row.assignee.id, row.assignee.name)} size="small" />
          {actorLabel(row.assignee.id, row.assignee.name)}
        </span>
      );
    case 'dueDate': {
      // A date is a CLAIM and renders attributed (spec §7 Calendar's rule,
      // applied here too): whose claim it is travels with it, so nobody reads a
      // due date as a fact the system established.
      const due = row.dueDate;
      if (due === null) {
        // The prototype NAMES this absence too (`desktop.dc.html:2362`,
        // `dueInfo`'s own first branch: `{ label: "No date claimed" }`), and
        // the name is doing real work a dash cannot: "No date claimed" says the
        // missing thing is a CLAIM — a person has not asserted a date — where
        // `—` beside an attributed-claims column reads as "we looked and found
        // nothing", which is a claim about the record this view cannot make.
        return <span className="gn-list__empty-cell">No date claimed</span>;
      }
      /*
        A CLOSED ticket's due date is moot — the useful fact about a finished
        ticket's date is when it finished — so the prototype swaps in the
        closure label (`desktop.dc.html:2366`: `"Closed " + (t.closed || nice)`).
        This product carries the closure moment as its own claim (`ListRow.closed`,
        backlog/closed spec §1.2), so the swap is exact rather than the
        prototype's fallback-to-the-due-date. That spec section is also why the
        test is `row.closed` and not `stateCategory === 'terminal'`: a ticket
        keeps the state it was closed FROM, so a terminal-category row is not
        necessarily a closed one, and only `closed` says a closure was recorded.

        The attribution is deliberately UNCHANGED — still the due date's own
        claimant, never the person who closed it. The sentence form is
        `${date} — ${actor}'s claim`, and the dash's left side is the only part
        this case rewrites. (The prototype names the ASSIGNEE here, `t.who`;
        this product's due cell has always named whoever CLAIMED the date, which
        is the stronger attribution and the one two existing cases pin.)
      */
      const when = row.closed === null ? formatDate(due.date) : `Closed ${formatDate(row.closed.at)}`;
      return (
        <span className="gn-list__due">
          {when} — {actorLabel(due.claim.actorId, due.claim.actorName)}&apos;s claim
        </span>
      );
    }
    case 'type':
      return <span>{row.typeId}</span>;
    case 'progress':
      return row.rollup === null ? (
        <span className="gn-list__empty-cell">—</span>
      ) : (
        <span>{formatRollup(row.rollup)}</span>
      );
    default: {
      const fieldId = columnId.slice('field:'.length);
      const fieldClaim = row.fields[fieldId];
      if (fieldClaim === undefined) return <span className="gn-list__empty-cell">—</span>;
      return (
        <span title={`set by ${actorLabel(fieldClaim.actorId, null)} on ${formatDate(fieldClaim.serverTime)}`}>
          {String(fieldClaim.value)}
        </span>
      );
    }
  }
}

export type TicketListState = {
  /** `null` until the rows load, and it stays null when the read FAILS. */
  rows: ListRow[] | null;
  prefs: ProjectViewPrefs;
  /**
   * The PROJECT-level summary of `prefs`' two halves — `'default'` only when the
   * user has arranged neither. Derived by `prefsOriginOf`, never stored, and not
   * passed on to `TicketList`, which derives it from `prefs` by the same rule.
   */
  prefsOrigin: PrefsOrigin;
  /** False until the preferences document has loaded. See `setPrefs`. */
  canSetPrefs: boolean;
  setPrefs: (next: ProjectViewPrefs) => void;
  currentUserId: string;
  error: string | null;
  reload: () => void;
};

/**
 * Rows + preferences for one project.
 *
 * ## `grouping: 'flat'` is a decision, not a placeholder
 *
 * The client regroups, so it asks the server NOT to. Asking for a grouping and
 * regrouping the answer is the double-grouping lie `list-model.ts` opens with:
 * the shipped route groups per PAGE. The complete-set premise that licenses
 * client-side grouping is tripwired on `keyof TicketListView` in the tests.
 *
 * ## RULING P24 — the asymmetry, and the one case this hook can honour
 *
 * The server keeps `listColumns` and `grouping` as two records keyed by project;
 * the client pairs them under one key. P24 names the consequence: a project in
 * one record and absent from the other has no faithful client representation,
 * and defaulting the missing half *"presents a default as the user's own
 * choice"*. Two cases fall out and only ONE is reachable from here:
 *
 *  - **project absent from the document entirely** — `prefsOrigin: 'default'`,
 *    which `TicketList` says out loud on screen.
 *  - **project in `listColumns`, absent from `grouping`** (or the reverse) —
 *    **now reachable and honoured too, and this is what changed.** It used to be
 *    unreachable for the wrong reason: `mapPreferences` filled the missing half
 *    with `DEFAULT_VIEW_PREFS` before any view was handed the document, so the
 *    distinction was destroyed one layer below rather than represented. That
 *    substitution is what P24 forbids in as many words, and closing it needed
 *    the type to change, not this hook — `ProjectViewPrefs`' halves are each a
 *    `Chosen<T>` whose `default` arm carries no value, so a half nobody chose
 *    cannot be read as one somebody did without the compiler objecting.
 *
 * `prefsOrigin` here is the PROJECT-level summary of those halves, computed by
 * the one exported `prefsOriginOf` that `TicketList` also uses — the same rule
 * in one place rather than the same rule twice.
 *
 * The old root-cause note said **the client pairs `{columns, grouping}` under
 * one key**, so changing only the grouping of an unarranged project persists the
 * DEFAULT COLUMNS alongside it, and *"there is no way to write one half through
 * a paired type."* That is no longer true and the fix is on the write path:
 * `toServerPreferences` contributes no key for a `default` half, so a grouping
 * chosen alone is stored alone. The pair survives as a client-side shape; it no
 * longer forces a stock value into storage under the user's name.
 *
 * ## Why `setPrefs` refuses before the document loads
 *
 * A preference change is a whole-document PUT. Composed from a document this
 * client has not read, it necessarily carries `savedFilters: []` and no other
 * project — so a click landing in the load window would silently DELETE every
 * saved filter and every other project's arrangement, server-side, for good.
 * `canSetPrefs` is false in that window and `TicketList` disables the controls,
 * so the refusal is visible rather than a click that does nothing. The window
 * re-opens on a workspace switch, where `usePreferences` clears the document
 * before asking.
 */
/**
 * A key that is the same for two filters that mean the same thing.
 *
 * Sorting the TOP level only was the first version, and it delivered the property
 * one level down from where `FilterSpec` needs it: `fields` is a
 * `Record<string, string>` whose key order is insertion order, so two specs with
 * the same field predicates in a different order produced different keys — the
 * exact rekey-and-re-walk the sorting was added to prevent, for the only axis
 * that nests. Recursion is the fix, and it is written here rather than inlined
 * because the argument for it is longer than the code.
 *
 * Arrays keep their order deliberately. `['a','b']` and `['b','a']` are the same
 * SET, but `toServerFilterSpec` rejects any array of more than one element, so
 * two orders can never both be expressible and sorting them would hide nothing
 * real while making the key claim more than it knows.
 */
function stableFilterKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableFilterKey).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableFilterKey(v)}`).join(',')}}`;
}

export function useTicketList(
  source: DataSource,
  workspaceId: string,
  projectId: string,
  currentUserId: string,
  filter: FilterSpec = {},
): TicketListState {
  // `projectId` AND the filter are the query key, for the same reason the board's
  // is its project: the key is exactly what changes when the list is pointed at a
  // different question. Keyed on the project alone, changing the filter would send
  // no new request at all — `useLiveQuery`'s load effect depends on the key — and
  // the old rows would sit under the new control claiming to answer it.
  //
  // Serialised through the ENTRIES, sorted, rather than `JSON.stringify(filter)`:
  // object key order is insertion order, so two specs that mean the same thing
  // stringify differently and would rekey — clearing the list and re-walking every
  // page for a question already answered.
  const filterKey = stableFilterKey(filter);
  const list = useLiveQuery(source, workspaceId, `${projectId}\u0000${filterKey}`, () =>
    source.query.getTickets(projectId, filter, 'flat'),
  );
  const preferences = usePreferences(source, workspaceId);
  const stored = preferences.document?.projects[projectId];

  const setPrefs = (next: ProjectViewPrefs) => {
    const current = preferences.document;
    if (current === null) return; // refuse: see the docblock — this PUT would erase the rest
    preferences.save({
      ...current,
      projects: { ...current.projects, [projectId]: next },
    });
  };

  const prefs = stored ?? DEFAULT_VIEW_PREFS;

  return {
    rows: list.data?.rows ?? null,
    prefs,
    prefsOrigin: prefsOriginOf(prefs),
    canSetPrefs: preferences.document !== null,
    setPrefs,
    currentUserId,
    error: list.error ?? preferences.error,
    reload: list.reload,
  };
}
