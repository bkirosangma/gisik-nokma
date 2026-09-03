import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../templates.js';

/** Cloning is the caller's job (draftFromTemplate / newDraft) — the gallery only picks. */
export function TemplateGallery(props: { onPick(template: WorkflowTemplate | null): void }) {
  return (
    <section className="template-gallery">
      <h2 className="template-gallery__title">Start from a template</h2>
      <ul className="template-gallery__cards">
        {WORKFLOW_TEMPLATES.map((template) => (
          <li className="template-gallery__card" key={template.id}>
            <h3 className="template-gallery__name">{template.name}</h3>
            <p className="template-gallery__tagline">{template.tagline}</p>
            <button
              type="button"
              aria-label={`Use this template — ${template.name}`}
              onClick={() => props.onPick(template)}
            >
              Use this template
            </button>
          </li>
        ))}
        <li className="template-gallery__card template-gallery__card--blank">
          <button type="button" onClick={() => props.onPick(null)}>
            Start blank
          </button>
        </li>
      </ul>
    </section>
  );
}
