'use client';
import { useState, type ReactNode } from 'react';
import { GROUP_LABEL, GROUP_OF_EDGE_KIND, type GraphEdgeView, type GraphItemView } from '@gisik-nokma/domain';
import { truncate } from '../engine/levels.js';
import type { GraphStore } from '../engine/model.js';
import { edgeSentence, howText, provenanceLine } from '../engine/sentences.js';
import { Glyph } from './glyph.js';
import { longLabel } from './inspect-model.js';

/** Spec A's typed links: the only kinds a person removes from here (`knowledge-graph-sigma.html:993`). */
const TYPED: ReadonlySet<GraphEdgeView['kind']> = new Set(['blocks', 'relates', 'duplicates']);
/** The snippet's `[[…]]` (spec B §2.1). Split, never `innerHTML`: a snippet is user text. */
const MARK = /\[\[(.+?)\]\]/;

/** The snippet with each `[[…]]` as a `<mark>` (`:988`): the split keeps the captures at the odd indexes. */
export function Marked({ text }: { text: string }) {
  return <>{text.split(MARK).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}</>;
}

/** A reference's snippet, quoted with its source (`:988`). */
export function SnippetQuote({ source, snippet }: { source: GraphItemView; snippet: string }): ReactNode {
  return (
    <blockquote className="gn-kg-snip">
      <div className="gn-kg-snip__src">
        <Glyph item={source} />
        {`In ${longLabel(source)}`}
      </div>
      <p>
        <Marked text={snippet} />
      </p>
    </blockquote>
  );
}

export type EdgeInspectorProps = {
  edge: GraphEdgeView;
  store: GraphStore;
  label: (ref: string) => string;
  onPick: (ref: string) => void;
  onCenter: (ref: string) => void;
  /** The view's wrapper: the host's removal, then the edge leaves the drawn store; `undo` puts it back. */
  onRemoveLink?: (edge: GraphEdgeView) => Promise<{ undo: () => Promise<void> }>;
  canRemoveLink?: (edge: GraphEdgeView) => boolean;
  status: string;
  setStatus: (status: string) => void;
};

/**
 * The edge inspector (`edgeInsp`, `knowledge-graph-sigma.html:984-997`): the group, the sentence, its two ends, the
 * snippet, who added it and how, and spec A's "Remove link" with Undo. Mount it keyed by the edge, so Undo belongs to
 * the edge it removed.
 */
export function EdgeInspector(p: EdgeInspectorProps) {
  const { edge } = p;
  const group = GROUP_OF_EDGE_KIND[edge.kind];
  const [undo, setUndo] = useState<(() => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false);
  const removable = TYPED.has(edge.kind) && p.onRemoveLink !== undefined && p.canRemoveLink?.(edge) !== false;
  const how = [provenanceLine(edge), howText(edge)].filter((s) => s !== null).join(' ');
  const source = p.store.items.get(edge.from);

  async function remove() {
    setBusy(true);
    try {
      const done = await p.onRemoveLink!(edge);
      setUndo(() => done.undo);
      p.setStatus('Link removed.');
    } catch (e) {
      // the server's refusal sentence (spec A §2.3: "refused by <rule>: <reason>")
      p.setStatus(e instanceof Error ? e.message : "Couldn't remove the link.");
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (undo === null) return;
    setBusy(true);
    try {
      await undo();
      setUndo(null);
      p.setStatus('Link restored.');
    } catch (e) {
      p.setStatus(e instanceof Error ? e.message : "Couldn't restore the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="gn-kg-insp__head">
        <span className={`gn-kg__swatch gn-kg__swatch--${group}`} aria-hidden="true" />
        <span>{GROUP_LABEL[group]}</span>
        {edge.suggested && <span className="gn-kg-pill gn-kg-pill--suggested">Suggested</span>}
      </div>
      <h3 className="gn-kg-insp__title">{edgeSentence(edge, p.label)}</h3>
      <ul className="gn-kg-links gn-kg-links--ends">
        {[edge.from, edge.to].map((ref, i) => {
          const it = p.store.items.get(ref);
          return (
            <li key={ref}>
              <button type="button" className="gn-kg-links__row" onClick={() => p.onPick(ref)}>
                {it !== undefined ? <Glyph item={it} /> : <span aria-hidden="true" />}
                <span className="gn-kg-links__rel">{i === 0 ? 'From' : 'To'}</span>
                <span className="gn-kg-links__name">{it !== undefined ? longLabel(it) : p.label(ref)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {(edge.kind === 'ref' || edge.kind === 'mention') && edge.snippet !== null && source !== undefined && <SnippetQuote source={source} snippet={edge.snippet} />}
      <p className="gn-kg-insp__prov">{how}</p>
      <div className="gn-kg-insp__acts">
        <button type="button" className="gn-button gn-button--primary" onClick={() => p.onCenter(edge.from)}>
          {`Center on ${truncate(p.label(edge.from), 14)}`}
        </button>
        {removable && undo === null && (
          <button type="button" className="gn-button gn-button--ghost" disabled={busy} onClick={() => void remove()}>
            Remove link
          </button>
        )}
        {undo !== null && (
          <button type="button" className="gn-button gn-button--ghost" disabled={busy} onClick={() => void restore()}>
            Undo
          </button>
        )}
      </div>
      <p className="gn-kg__status" aria-live="polite">
        {p.status}
      </p>
    </>
  );
}
