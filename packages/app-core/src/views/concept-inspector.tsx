import { newUlid, type GraphItemView, type IngestResult, type SubmittedEvent, type SuggestionView } from '@gisik-nokma/domain';
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { DataSource } from '../data-source.js';
import { attributionLabel } from '../provenance.js';
import type { MakeSubmitted } from '../submit.js';
import { useConcept } from './use-concept.js';

export type ConceptInspectorProps = {
  /** The selected graph item: a concept (`suggested: false`) or a suggestion (`suggested: true`, its id the suggestion's). */
  item: GraphItemView;
  workspaceId: string;
  dataSource: DataSource;
  make: MakeSubmitted;
  nameOf: (userId: string) => string;
  /** Something committed: the host refreshes the graph (a half-done batch counts, see `send`). */
  onChanged: () => void;
  /** The first refusal of a write, as `ticket-notes-section.tsx` reports one. */
  onRefusal: (r: { rule: string; reason: string }) => void;
  /** Spec D §3.3: a guest reads only. No write control is drawn (the server would refuse every one). Default false. */
  readOnly?: boolean;
};

/**
 * Knowledge Graph spec D §6 and §4.2 (KG-D Task 8): the inspector body for a selected concept, mounted by the
 * Knowledge Graph's `renderConceptPanel`. A concept shows its summary, who created it and how (D2's attribution), its
 * items with "Remove from concept", its links, Rename and Delete. A suggestion (drawn dashed, "Suggested") offers
 * Confirm, a name prefilled from its terms, with the narrowing sentence (§3.2) above the button, and Reject. Every
 * answer is the server's (D4 at read time): nothing here falls back to what the graph's rings hold.
 */
export function ConceptInspector(props: ConceptInspectorProps) {
  return props.item.suggested ? <SuggestionPanel {...props} /> : <ConfirmedPanel {...props} />;
}

/**
 * One write. A batch is NOT atomic (`apps/server/src/ingest/ingest-service.ts:56-64`: "Each event commits or fails
 * independently"), so ANY commit refreshes the graph (a half-tagged concept is drawn, attributed and removable, D2) and
 * the first refusal is still reported. Answers whether every event committed.
 */
async function send(props: Pick<ConceptInspectorProps, 'dataSource' | 'onChanged' | 'onRefusal'>, events: SubmittedEvent[]): Promise<boolean> {
  let results: IngestResult[];
  try {
    results = await props.dataSource.ingest(events);
  } catch {
    results = [];
  }
  if (results.length === 0) {
    props.onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' });
    return false;
  }
  if (results.some((r) => r.status === 'committed')) props.onChanged();
  const bad = results.find((r) => r.status !== 'committed');
  if (bad === undefined) return true;
  if (bad.status === 'refused') props.onRefusal({ rule: bad.rule, reason: bad.reason });
  else if (bad.status === 'invalid') props.onRefusal({ rule: bad.code, reason: bad.message });
  return false;
}

/**
 * Esc in the rename form or the Delete question closes it and goes no further: not to the view, whose Esc is Back (a
 * button is not one of the controls it leaves the keys to), and not to a Sheet around the view (`sheet.tsx`: a child
 * that handled Escape calls `preventDefault`).
 */
const escapeCloses = (close: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  close();
};

function ConfirmedPanel(props: ConceptInspectorProps) {
  const concept = useConcept(props.dataSource, props.item.id);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const ids = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const editing = renaming !== null;
  const opened = useRef(false);
  // Keyboard focus follows the rename form, which stands in for the heading and the buttons: into the name, its text
  // selected, when it opens; back on Rename when it closes (Cancel, Esc, a committed Save). Never on the first draw.
  useEffect(() => {
    if (editing) {
      opened.current = true;
      nameField.current?.focus();
      nameField.current?.select();
    } else if (opened.current) renameButton.current?.focus();
  }, [editing]);
  if (deleted) {
    return (
      <section className="gn-kg-concept-inspector" aria-label="Concept">
        <p className="gn-kg-concept__note" role="status">
          Concept deleted. Its items are unchanged.
        </p>
      </section>
    );
  }
  if (concept.data === null) {
    if (concept.error === 'unavailable') return <p className="gn-kg-concept__note">This concept is no longer available to you.</p>;
    if (concept.error === 'failed') {
      return (
        <div className="gn-kg-concept__note">
          <p>This concept could not be loaded.</p>
          <button className="gn-button gn-button--ghost" type="button" onClick={concept.reload}>
            Try again
          </button>
        </div>
      );
    }
    // The wait is a skeleton named once for assistive tech, never a sentence (spec S7, case 25.121).
    return (
      <SkeletonRegion label="Loading concept" className="gn-kg-concept-inspector">
        <Skeleton width="60%" height="1.25rem" />
        <Skeleton rows={3} height="0.875rem" />
      </SkeletonRegion>
    );
  }
  const c = concept.data;
  const readOnly = props.readOnly === true;
  const ev = (type: string, payload: unknown) => props.make({ workspaceId: c.workspaceId, entity: { kind: 'concept', id: c.id }, type, payload });
  // A committed change is read back at once (the name, the links), and the graph is refreshed by the host.
  const changed = {
    ...props,
    onChanged: () => {
      concept.reload();
      props.onChanged();
    },
  };
  const items = c.items.filter((i) => !removed.has(`${i.kind}:${i.id}`));
  // The question goes and focus goes back to the Delete that asked it (drawn all the while the question is open).
  const cancelDelete = () => {
    setConfirmDelete(false);
    deleteButton.current?.focus();
  };
  return (
    <section className="gn-kg-concept-inspector" aria-label={`Concept ${c.name}`}>
      {renaming === null ? (
        <h3 className="gn-kg-concept__name">{c.name}</h3>
      ) : (
        <form
          className="gn-kg-concept__rename"
          onKeyDown={escapeCloses(() => setRenaming(null))}
          onSubmit={async (e) => {
            e.preventDefault();
            const name = renaming.trim();
            if (name !== '' && (await send(changed, [ev('concept.renamed', { name })]))) setRenaming(null);
          }}
        >
          <input ref={nameField} className="gn-field__input" aria-label="Concept name" value={renaming} onChange={(e) => setRenaming(e.target.value)} />
          <div className="gn-kg-concept__actions">
            <button className="gn-button gn-button--primary" type="submit" disabled={renaming.trim() === ''}>
              Save
            </button>
            <button className="gn-button gn-button--ghost" type="button" onClick={() => setRenaming(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {c.summary === '' ? null : <p className="gn-kg-concept__summary">{c.summary}</p>}
      <p className="gn-kg-concept__by">Created by {attributionLabel(props.nameOf(c.createdBy), c.origin)}</p>
      <section className="gn-kg-concept__section">
        <h4>Items</h4>
        {items.length === 0 ? (
          <p className="gn-kg-concept__empty">No items yet</p>
        ) : (
          <ul className="gn-kg-concept__items">
            {items.map((i) => {
              const key = `${i.kind}:${i.id}`;
              return (
                <li key={key}>
                  <span className="gn-kg-concept__label" id={`${ids}-${key}`}>
                    {i.label}
                  </span>
                  {readOnly ? null : (
                    <button
                      className="gn-button gn-button--ghost gn-kg-concept__remove"
                      type="button"
                      aria-describedby={`${ids}-${key}`}
                      onClick={async () => {
                        // At once (optimistic); put back if the server does not commit it.
                        setRemoved((s) => new Set(s).add(key));
                        if (!(await send(props, [ev('concept.item_untagged', { itemKind: i.kind, itemId: i.id })]))) {
                          setRemoved((s) => {
                            const n = new Set(s);
                            n.delete(key);
                            return n;
                          });
                        }
                      }}
                    >
                      {/* Shown "Remove", so the item's label keeps its room; named in full for a screen reader. */}
                      Remove<span className="gn-visually-hidden"> from concept</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {c.links.length === 0 ? null : (
        <section className="gn-kg-concept__section">
          <h4>Links</h4>
          <ul className="gn-kg-concept-links">
            {c.links.map((l) => {
              const key = `${l.relation}:${l.otherId}`;
              return (
                <li key={key}>
                  <span className="gn-kg-concept__label" id={`${ids}-${key}`}>
                    {l.direction === 'broader' ? 'Broader: ' : l.direction === 'narrower' ? 'Narrower: ' : 'Related: '}
                    {l.otherName}
                  </span>
                  {readOnly ? null : (
                    <button
                      className="gn-button gn-button--ghost gn-kg-concept__remove"
                      type="button"
                      aria-describedby={`${ids}-${key}`}
                      onClick={() => void send(changed, [ev('concept.unlinked', { otherId: l.otherId, relation: l.relation })])}
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {readOnly || renaming !== null ? null : (
        <div className="gn-kg-concept__actions">
          <button ref={renameButton} className="gn-button gn-button--ghost" type="button" onClick={() => setRenaming(c.name)}>
            Rename
          </button>
          <button ref={deleteButton} className="gn-button gn-button--danger-quiet" type="button" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      )}
      {confirmDelete && !readOnly ? (
        <div role="alertdialog" aria-label="Delete concept" className="gn-kg-concept__confirm" onKeyDown={escapeCloses(cancelDelete)}>
          <p>Delete the concept {c.name}? Its items stay; only the grouping goes.</p>
          <div className="gn-kg-concept__actions">
            <button
              className="gn-button gn-button--danger"
              type="button"
              onClick={async () => {
                if (await send(props, [ev('concept.deleted', {})])) {
                  setConfirmDelete(false);
                  setDeleted(true);
                }
              }}
            >
              Delete
            </button>
            {/* Focus lands on the safe choice. */}
            <button className="gn-button gn-button--ghost" type="button" autoFocus onClick={cancelDelete}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type SuggestionRead = { status: 'loading' } | { status: 'failed' } | { status: 'gone' } | { status: 'ready'; suggestion: SuggestionView };

function SuggestionPanel(props: ConceptInspectorProps) {
  const [read, setRead] = useState<SuggestionRead>({ status: 'loading' });
  const [name, setName] = useState('');
  const [narrowing, setNarrowing] = useState<string | null>(null);
  /**
   * A Confirm or Reject the server took (even in part: a half-committed batch already made the concept), so the form
   * stays disabled until the refreshed graph drops the suggestion. A second Confirm would make a second concept.
   */
  const [done, setDone] = useState(false);
  const readOnly = props.readOnly === true;
  const { dataSource, workspaceId } = props;
  const suggestionId = props.item.id;
  useEffect(() => {
    let live = true;
    dataSource.query.getSuggestions(workspaceId).then(
      (all) => {
        if (!live) return;
        const s = all.find((x) => x.id === suggestionId);
        if (s === undefined) {
          setRead({ status: 'gone' });
          return;
        }
        setRead({ status: 'ready', suggestion: s });
        setName(s.label);
        if (readOnly) return; // nothing to confirm; the route refuses a guest anyway
        // The preview, BEFORE Confirm: the click is the confirmation, so the sentence is never shown after it.
        dataSource.query.getConceptAudience(workspaceId, null, s.items).then(
          (a) => {
            if (live) setNarrowing(a.after < a.before ? `Fewer people will see this concept: ${String(a.after)} of ${String(a.members)} members` : null);
          },
          () => {
            if (live) setNarrowing(null); // no preview is no sentence; Confirm still works
          },
        );
      },
      () => {
        if (live) setRead({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [dataSource, workspaceId, suggestionId, readOnly]);
  if (read.status === 'loading') {
    return (
      <SkeletonRegion label="Loading suggestion" className="gn-kg-concept-inspector">
        <Skeleton width="40%" height="1.25rem" />
        <Skeleton rows={3} height="0.875rem" />
      </SkeletonRegion>
    );
  }
  if (read.status === 'failed') return <p className="gn-kg-concept__note">Suggestions could not be loaded.</p>;
  if (read.status === 'gone') return <p className="gn-kg-concept__note">This suggestion is no longer offered.</p>;
  const s = read.suggestion;
  const conceptEv = (id: string, type: string, payload: unknown) => props.make({ workspaceId, entity: { kind: 'concept', id }, type, payload });
  // Sends, holding the form while the server answers; it is released only if nothing committed.
  const submit = async (events: SubmittedEvent[]) => {
    setDone(true);
    let committed = false;
    const onChanged = () => {
      committed = true;
      props.onChanged();
    };
    await send({ ...props, onChanged }, events);
    setDone(committed);
  };
  return (
    <section className="gn-kg-concept-inspector gn-kg-concept-inspector--suggested" aria-label={`Suggested concept ${s.label}`}>
      <p className="gn-kg-pill gn-kg-pill--suggested gn-kg-concept__badge">Suggested</p>
      {/* planner ruling 2026-10-04, Q5: the label, then the terms as a secondary line under it (27.524). */}
      <h3 className="gn-kg-concept__name">{s.label}</h3>
      <p className="gn-kg-concept__terms">{s.terms.join(', ')}</p>
      <section className="gn-kg-concept__section">
        <h4>Items</h4>
        <ul className="gn-kg-concept__items">
          {s.items.map((i) => (
            <li key={`${i.kind}:${i.id}`}>
              <span className="gn-kg-concept__label">{i.label}</span>
            </li>
          ))}
        </ul>
      </section>
      {readOnly ? null : (
        <form
          className="gn-kg-concept__form"
          onSubmit={async (e) => {
            e.preventDefault();
            const chosen = name.trim();
            if (chosen === '' || done) return;
            const id = newUlid(); // a fresh concept; the suggestion's id is only its `fromSuggestion`
            await submit([
              conceptEv(id, 'concept.created', { name: chosen, fromSuggestion: s.id }),
              ...s.items.map((i) => conceptEv(id, 'concept.item_tagged', { itemKind: i.kind, itemId: i.id })),
            ]);
          }}
        >
          <label className="gn-field">
            <span className="gn-field__label">Name</span>
            <input className="gn-field__input" value={name} disabled={done} onChange={(e) => setName(e.target.value)} />
          </label>
          {narrowing === null ? null : <p className="gn-kg-concept__narrowing">{narrowing}</p>}
          <div className="gn-kg-concept__actions">
            <button className="gn-button gn-button--primary" type="submit" disabled={name.trim() === '' || done}>
              Confirm
            </button>
            <button
              className="gn-button gn-button--ghost"
              type="button"
              disabled={done}
              onClick={() =>
                void submit([
                  props.make({ workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.concept_suggestion_rejected', payload: { signature: s.signature, itemHashes: s.itemHashes } }),
                ])
              }
            >
              Reject
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
