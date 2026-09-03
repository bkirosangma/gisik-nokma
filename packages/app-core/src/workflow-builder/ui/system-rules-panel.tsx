/**
 * The builder's honesty about its own limits (spec §4): two invariants sit
 * above all workflows and cannot be authored away. Static by design — there is
 * nothing to configure, which is the whole point.
 *
 * No props, no store, no context: it renders the same words in every workflow,
 * so it must not be mounted inside a BuilderProvider to work (its test renders
 * it bare, and would fail the moment somebody wired a hook in here).
 *
 * Colours come from packages/ui/src/ui.css via BEM classes, not from the
 * `tokens.workflowBuilder.*` inline styles the plan's Task 8 snippet spells —
 * that export does not exist in this repo. See issues-panel.tsx's docblock for
 * the full correction.
 */
export function SystemRulesPanel() {
  return (
    <aside className="system-rules-panel">
      <h3 className="system-rules-panel__title">System rules — in every workflow</h3>
      <ul className="system-rules-panel__list">
        <li className="system-rules-panel__rule">
          Provenance on everything: every move records who made it and when. "Done" always unfolds to
          "marked done by X on a date".
        </li>
        <li className="system-rules-panel__rule">
          Parents cannot outrun children: no ticket can enter a terminal state while any of its children
          is still open.
        </li>
      </ul>
      <p className="system-rules-panel__footer">
        These two sit above all workflows and cannot be authored away (product design, §4).
      </p>
    </aside>
  );
}
