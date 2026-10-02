import { BACKLOG_STATE, universalTransitions, type StateCategory } from '@gisik-nokma/domain';
import { Chip, type ChipTone } from '@gisik-nokma/ui';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CATEGORY_LABEL } from '../category-label.js';
import { ruleCountLabel } from '../summaries.js';
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.js';
import { StateInspector } from './state-inspector.js';
import { TransitionInspector } from './transition-inspector.js';

/** The line under the read-only rows: the two moves no workflow declares and none can remove. */
export const UNIVERSAL_MOVES_NOTE =
  'Every workflow has these two moves, so they are not part of the count above and cannot be changed.';

const CATEGORY_TONE: Record<StateCategory, ChipTone> = { open: 'open', active: 'active', terminal: 'terminal' };

/**
 * Narrower than this the builder is one column and the lists sit ABOVE the canvas: scrolling a row into
 * view would then move the whole page away from the canvas the user just clicked. Mirrors the
 * `@media (max-width: 64rem)` breakpoint in ui.css.
 */
const STACKED_QUERY = '(max-width: 64rem)';

/**
 * One disclosure row: a `<button aria-expanded aria-controls>` and, as its SIBLING, the body it controls.
 * The body element always exists (so `aria-controls` always names something) but its CONTENT is mounted
 * only while open — a collapsed row carries no inspector, no fields and no focus stops.
 *
 * `openedByRow` is the "this change came from the row itself" flag: a click on a row must not scroll it
 * (the pointer is already there), while an open that arrives from the canvas must.
 */
function DisclosureRow(props: {
  open: boolean;
  onToggle: () => void;
  openedByRow: { current: boolean };
  head: ReactNode;
  children: ReactNode;
}) {
  const bodyId = useId();
  const itemRef = useRef<HTMLLIElement>(null);
  const { open, openedByRow } = props;

  useEffect(() => {
    if (!open) return;
    if (openedByRow.current) {
      openedByRow.current = false;
      return;
    }
    if (window.matchMedia?.(STACKED_QUERY).matches) return;
    itemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, openedByRow]);

  return (
    <li ref={itemRef} className="builder-row" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="builder-row__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          if (!open) openedByRow.current = true;
          props.onToggle();
        }}
      >
        <span className="builder-row__chevron" aria-hidden="true" />
        {props.head}
      </button>
      <div id={bodyId} className="builder-row__body" hidden={!open}>
        {open ? props.children : null}
      </div>
    </li>
  );
}

/**
 * The left column's States and Transitions lists (owner, 2026-09-30). Each row expands in place to the
 * EXISTING `StateInspector` / `TransitionInspector`; the right-hand inspector they replace is gone.
 *
 * The open row is DERIVED from the draft's one `selection` — there is no second piece of state here, so
 * two rows cannot be open, and the canvas (which also writes `selection`) and these lists cannot disagree.
 * Collapsing is `select({ kind: 'none' })`, the same thing a click on the empty canvas does.
 */
export function BuilderPanels() {
  const store = useBuilderStore();
  const draft = useDraft();
  const ctx = useSummaryCtx();
  const { canAuthor } = useBuilderEnv();
  const openedByRow = useRef(false);
  const { def, selection } = draft;
  const select = store.actions.select;
  const nameOf = (id: string) => (id === '*' ? 'Any state' : ctx.stateName(id));
  const universal = universalTransitions(def);
  const startTarget = universal[0]?.to ?? def.initialStateId;

  return (
    <>
      <section className="builder-panel" aria-labelledby="builder-panel-states">
        <h3 id="builder-panel-states" className="builder-panel__title">
          States ({def.states.length})
        </h3>
        {def.states.length === 0 ? (
          <p className="builder-panel__empty">No states yet</p>
        ) : (
          <ul className="builder-panel__list">
            {def.states.map((state) => (
              <DisclosureRow
                key={state.id}
                open={selection.kind === 'state' && selection.stateId === state.id}
                openedByRow={openedByRow}
                onToggle={() =>
                  select(
                    selection.kind === 'state' && selection.stateId === state.id
                      ? { kind: 'none' }
                      : { kind: 'state', stateId: state.id },
                  )
                }
                head={
                  <>
                    <span className="builder-row__name">{state.name}</span>{' '}
                    <span className="builder-row__meta">
                      <Chip tone={CATEGORY_TONE[state.category]}>{CATEGORY_LABEL[state.category]}</Chip>
                      {state.blocked === true ? (
                        <>
                          {' '}
                          <Chip tone="blocked">Blocked</Chip>
                        </>
                      ) : null}
                      {state.id === def.initialStateId ? (
                        <>
                          {' '}
                          <Chip>Start</Chip>
                        </>
                      ) : null}
                      {state.creatable === false ? (
                        <>
                          {' '}
                          <Chip tone="restricted">Can't create here</Chip>
                        </>
                      ) : null}
                    </span>
                  </>
                }
              >
                <StateInspector stateId={state.id} />
              </DisclosureRow>
            ))}
          </ul>
        )}
      </section>

      <section className="builder-panel" aria-labelledby="builder-panel-transitions">
        <h3 id="builder-panel-transitions" className="builder-panel__title">
          Transitions ({def.transitions.length})
        </h3>
        {def.transitions.length === 0 ? (
          <p className="builder-panel__empty">
            {canAuthor
              ? 'No transitions yet. Draw one on the canvas, from one state to another.'
              : 'No transitions yet.'}
          </p>
        ) : (
          <ul className="builder-panel__list">
            {def.transitions.map((transition, index) => (
              <DisclosureRow
                key={`${transition.from}>${transition.to}#${index}`}
                open={selection.kind === 'transition' && selection.index === index}
                openedByRow={openedByRow}
                onToggle={() =>
                  select(
                    selection.kind === 'transition' && selection.index === index
                      ? { kind: 'none' }
                      : { kind: 'transition', index },
                  )
                }
                head={
                  <>
                    <span className="builder-row__name">
                      {nameOf(transition.from)} → {nameOf(transition.to)}
                    </span>{' '}
                    <span className="builder-row__meta">{ruleCountLabel(transition.rules.length)}</span>
                  </>
                }
              >
                <TransitionInspector index={index} />
              </DisclosureRow>
            ))}
          </ul>
        )}
        <p className="builder-panel__note">{UNIVERSAL_MOVES_NOTE}</p>
        <ul className="builder-panel__list builder-panel__list--universal">
          <li className="builder-row builder-row--universal" data-universal="start">
            <span className="builder-row__name">Start</span>{' '}
            <span className="builder-row__meta">
              {BACKLOG_STATE.name} → {nameOf(startTarget)}
            </span>
          </li>
          <li className="builder-row builder-row--universal" data-universal="send-to-backlog">
            <span className="builder-row__name">Send to Backlog</span>{' '}
            <span className="builder-row__meta">Any unfinished state → {BACKLOG_STATE.name}</span>
          </li>
        </ul>
      </section>
    </>
  );
}
