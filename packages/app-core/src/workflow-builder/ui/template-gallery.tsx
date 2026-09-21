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
            <h3 className="template-gallery__name">{template.name}</h3>
            <p className="template-gallery__tagline">{template.tagline}</p>
            {/* E4-10 — the shared `Button`, not a bare `<button>`. These four
                carried NO `className` at all, so nothing in the product's three
                stylesheets matched them and they painted as raw user-agent
                chrome: measured 143x29 x3 and 95x29, flagged by the UA-chrome
                detector (`borderTopStyle === 'outset'` or the UA's
                `rgb(239,239,239)` fill) on the route. Round 1's P1 population
                was "each static `className` literal on a `<button|input|…>`",
                so a CLASS-LESS button was outside it by construction — which
                is why this is its own finding rather than a P1 member. The
                sibling comment at `workflow-builder-screen.tsx:42` states the
                rule this file now follows: *"The shared `Button`, not a bare
                `<button>`"* (`fill-tertiary` + `text-accent` + 600, no border). */}
            <Button
              aria-label={`Use this template — ${template.name}`}
              onClick={() => props.onPick(template)}
            >
              Use this template
            </Button>
          </li>
        ))}
        <li className="template-gallery__card template-gallery__card--blank">
          <Button onClick={() => props.onPick(null)}>Start blank</Button>
        </li>
      </ul>
    </section>
  );
}
