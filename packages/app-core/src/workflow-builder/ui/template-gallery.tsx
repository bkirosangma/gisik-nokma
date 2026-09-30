import { Button } from '@gisik-nokma/ui';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../templates.js';

/** Cloning is the caller's job (draftFromTemplate / newDraft) — the gallery only picks. */
export function TemplateGallery(props: { onPick(template: WorkflowTemplate | null): void }) {
  return (
    <section className="template-gallery">
      <h2 className="template-gallery__title">Start from a template</h2>
      <ul className="template-gallery__cards">
        {WORKFLOW_TEMPLATES.map((template) => (
          <li className="template-gallery__card" key={template.id}>
            {/* Touch-doors (owner, 2026-09-30): the WHOLE card is the one control that starts from
                this template — a P-LIFT door like the workspace home's cards, not a ghost button
                inside a card. N primary buttons would break rule 01 (one loud element), and four
                ghosts left the page with no affordance but a small text button; the raised card is
                the affordance. Phrasing-only content inside the `<button>` (spans, not the `<h3>`
                and `<p>` this card used to have), so the markup stays valid; the visible name is
                inside the accessible name (label-in-name). */}
            <button
              type="button"
              className="template-gallery__door"
              aria-label={`Use the ${template.name} template`}
              onClick={() => props.onPick(template)}
            >
              <span className="template-gallery__name">{template.name}</span>
              <span className="template-gallery__tagline">{template.tagline}</span>
            </button>
          </li>
        ))}
        <li className="template-gallery__card template-gallery__card--blank">
          <Button onClick={() => props.onPick(null)}>Start blank</Button>
        </li>
      </ul>
    </section>
  );
}
