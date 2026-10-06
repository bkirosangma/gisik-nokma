import { SEMANTIC_KEY, type ConceptSummary, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import { Toast } from '@gisik-nokma/ui';
import { useEffect, useId, useState } from 'react';
import type { DataSource } from '../data-source.js';
import type { MakeSubmitted } from '../submit.js';

export type ConceptsRowProps = {
  workspaceId: string;
  /** The ticket or note whose Details this row sits on. */
  item: { kind: 'ticket' | 'note'; id: string };
  dataSource: DataSource;
  make: MakeSubmitted;
  /** The first refusal of a write, as `ticket-notes-section.tsx` reports one. */
  onRefusal: (r: { rule: string; reason: string }) => void;
  /** The host can show a concept (the Knowledge Graph). Absent = the name is text, never a button that does nothing. */
  onOpenConcept?: (conceptId: string) => void;
  /** Spec D §3.3: a reader who may not write (a guest) sees the pills with no remove button. Default false. */
  readOnly?: boolean;
};

/** Spec C §6.4 / plan C 27.324: the switch is read where it is shown, and storage that throws means the default, On. */
function semanticOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(SEMANTIC_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Knowledge Graph spec D §6 (KG-D Task 9): the item's concepts as removable pills (D2: visible, attributed in the
 * concept's History, removable by a member), shown only while the semantic layer is on (D6, a VIEW switch: hiding the
 * row changes no data). D4 is the server's: the row draws exactly what `getItemConcepts` answers, and a refused read
 * draws nothing. One instance per item, so a switch to another ticket or note starts empty and a late answer for the
 * old item lands on an instance that is gone.
 */
export function ConceptsRow(props: ConceptsRowProps) {
  return <ItemConcepts key={`${props.item.kind}:${props.item.id}`} {...props} />;
}

function ItemConcepts(props: ConceptsRowProps) {
  const { workspaceId, dataSource, make, onRefusal } = props;
  const { kind, id } = props.item;
  const on = semanticOn();
  const headingId = useId();
  const [concepts, setConcepts] = useState<ConceptSummary[] | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<ConceptSummary | null>(null);
  useEffect(() => {
    if (!on) return;
    dataSource.query.getItemConcepts(workspaceId, { kind, id }).then(setConcepts, () => setConcepts([]));
  }, [on, dataSource, workspaceId, kind, id]);
  if (!on || concepts === null) return null;
  const shown = concepts.filter((c) => !hidden.has(c.id));
  if (shown.length === 0 && toast === null) return null;

  const ev = (conceptId: string, type: string): SubmittedEvent =>
    make({ workspaceId, entity: { kind: 'concept', id: conceptId }, type, payload: { itemKind: kind, itemId: id } });
  const show = (conceptId: string) =>
    setHidden((s) => {
      const n = new Set(s);
      n.delete(conceptId);
      return n;
    });
  /** One event, one answer; a transport that throws or answers nothing is `undefined`. */
  async function submit(event: SubmittedEvent): Promise<IngestResult | undefined> {
    try {
      const [result] = await dataSource.ingest([event]);
      return result;
    } catch {
      return undefined;
    }
  }
  function report(result: IngestResult | undefined): void {
    if (result === undefined) onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' });
    else if (result.status === 'refused') onRefusal({ rule: result.rule, reason: result.reason });
    else if (result.status === 'invalid') onRefusal({ rule: result.code, reason: result.message });
  }
  async function remove(c: ConceptSummary): Promise<void> {
    // At once (optimistic); put back if the server does not commit it.
    setHidden((s) => new Set(s).add(c.id));
    const result = await submit(ev(c.id, 'concept.item_untagged'));
    if (result?.status === 'committed') {
      setToast(c);
      return;
    }
    show(c.id);
    report(result);
  }
  async function undo(c: ConceptSummary): Promise<void> {
    setToast(null);
    const result = await submit(ev(c.id, 'concept.item_tagged'));
    if (result?.status === 'committed') show(c.id);
    else report(result);
  }

  return (
    <section className="gn-concepts-row" aria-labelledby={headingId}>
      <h3 id={headingId} className="gn-ticket-sheet__caption">
        Concepts
      </h3>
      <ul className="gn-concepts-row__pills">
        {shown.map((c) => (
          <li key={c.id} className="gn-concept-pill">
            {props.onOpenConcept === undefined ? (
              <span className="gn-concept-pill__name">{c.name}</span>
            ) : (
              <button type="button" className="gn-concept-pill__name" onClick={() => props.onOpenConcept?.(c.id)}>
                {c.name}
              </button>
            )}
            {props.readOnly === true ? null : (
              <button type="button" className="gn-concept-pill__remove" aria-label={`Remove from concept ${c.name}`} onClick={() => void remove(c)}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
      <Toast
        open={toast !== null}
        message={toast === null ? '' : `Removed from ${toast.name}`}
        undo={toast === null ? null : { onUndo: () => void undo(toast) }}
        onDismiss={() => setToast(null)}
      />
    </section>
  );
}
