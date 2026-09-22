import type { Rule, WorkspaceRole } from '@gisik-nokma/domain';
import { useBuilderEnv, useBuilderStore } from '../builder-context.js';
import { memberLabel } from '../../../member-label.js';

const ALL_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member', 'guest'];

type RestrictTo = Extract<Rule, { kind: 'restrict-to' }>;

/** Normalise: empty arrays and false flags are omitted, so the def never carries dead keys. */
function normalised(rule: RestrictTo): RestrictTo {
  const next: RestrictTo = { kind: 'restrict-to' };
  if (rule.assignee === true) next.assignee = true;
  if (rule.roles !== undefined && rule.roles.length > 0) next.roles = rule.roles;
  if (rule.userIds !== undefined && rule.userIds.length > 0) next.userIds = rule.userIds;
  return next;
}

/**
 * A guest may not call GET /v1/workspaces/:id/members (executor ruling
 * 2026-09-02) and the shipped default is no-guests, so `members` here may
 * legitimately be empty — the fieldset just renders no rows, never a crash.
 */
export function RestrictToEditor(props: { transitionIndex: number; ruleIndex: number; rule: RestrictTo }) {
  const store = useBuilderStore();
  const { members } = useBuilderEnv();
  const { rule } = props;
  const isEmpty =
    rule.assignee !== true &&
    (rule.roles === undefined || rule.roles.length === 0) &&
    (rule.userIds === undefined || rule.userIds.length === 0);

  function update(change: Partial<RestrictTo>): void {
    store.actions.updateRule(props.transitionIndex, props.ruleIndex, normalised({ ...rule, ...change }));
  }

  return (
    <div className="restrict-to-editor" data-testid="restrict-to-editor">
      <label className="restrict-to-editor__option">
        <input
          type="checkbox"
          aria-label="The assignee"
          checked={rule.assignee === true}
          onChange={(changeEvent) => update({ assignee: changeEvent.target.checked })}
        />
        <span>The assignee</span>
      </label>
      <fieldset className="restrict-to-editor__roles">
        <legend>Roles</legend>
        {ALL_ROLES.map((role) => (
          <label key={role}>
            <input
              type="checkbox"
              aria-label={`Role: ${role}`}
              checked={rule.roles?.includes(role) ?? false}
              onChange={(changeEvent) => {
                const current = rule.roles ?? [];
                update({
                  roles: changeEvent.target.checked
                    ? [...current, role]
                    : current.filter((candidate) => candidate !== role),
                });
              }}
            />
            <span>{role}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="restrict-to-editor__people">
        <legend>Named people</legend>
        {members.map((member) => {
          // BOTH the visible span and the ACCESSIBLE NAME, off ONE resolved
          // label (2026-09-22). `member.displayName` verbatim made a
          // magic-link member a blank checkbox whose `aria-label` was the empty
          // string — invisible AND unannounceable — which is the defect class
          // the members screen closed by resolving its label once per row. Two
          // reads of one possibly-empty string is how a control and its
          // accessible name come to disagree.
          const label = memberLabel({
            id: member.userId,
            name: member.displayName,
            email: member.email,
          });
          return (
            <label key={member.userId}>
              <input
                type="checkbox"
                aria-label={label}
                checked={rule.userIds?.includes(member.userId) ?? false}
                onChange={(changeEvent) => {
                  const current = rule.userIds ?? [];
                  update({
                    userIds: changeEvent.target.checked
                      ? [...current, member.userId]
                      : current.filter((candidate) => candidate !== member.userId),
                  });
                }}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </fieldset>
      {isEmpty ? (
        <p className="restrict-to-editor__empty-warning">
          Pick at least one — a restriction that names nobody can never be satisfied.
        </p>
      ) : null}
    </div>
  );
}
