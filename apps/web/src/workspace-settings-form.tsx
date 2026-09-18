'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import {
  makeSubmittedFactory,
  type DataSource,
  type WorkspaceSettings,
} from '@gisik-nokma/app-core';

export type WorkspaceSettingsFormProps = {
  dataSource: DataSource;
  workspaceId: string;
  /** The values as the SERVER answered them — never a local guess. */
  settings: WorkspaceSettings;
  /**
   * `session.role === 'owner' || session.role === 'admin'`.
   *
   * The gate the server actually enforces is `check-permission.ts:582`, which
   * refuses `workspace.settings_set` from anyone else with its own sentence.
   * This flag decides only whether the controls are OFFERED: a member sees the
   * same values read-only, because the honest thing to show someone who cannot
   * change a setting is the setting, not a disabled mystery.
   */
  canEdit: boolean;
  /**
   * NOT in the task plan's own prop list, which named
   * `{ dataSource, workspaceId, settings, canEdit, onSaved }` — added for the
   * same reason `BacklogStartButton` added it (its docblock says so in almost
   * these words): `makeSubmittedFactory` needs an `actorId` and nothing else in
   * that list can supply one. The page mounts this only for a resolved session,
   * exactly as it gates Start, so this is never `''` while Save can be reached.
   */
  currentUserId: string;
  /** A `committed` answer — the page re-reads so the form shows the server's values, not the request's. */
  onSaved: () => void;
};

/** The three knobs, in the order the form draws them. */
type Knob = 'staleDays' | 'dueSoonDays' | 'autoCloseAfterDays';

/**
 * Second wave, Task 6 (spec §8, plan ruling R5) — the `/settings` **Workspace**
 * tab's form, holding all THREE `workspace.settings_set` knobs.
 *
 * R5's own reasoning for one form rather than a lone auto-close field: the two
 * attention thresholds have had no UI at all since Plan 5, and one form for one
 * event is a smaller surface than a knob plus the settings tab it would need
 * next. So this is the first screen in the product that can set `staleDays` and
 * `dueSoonDays`, and the first that can set `autoCloseAfterDays`.
 *
 * ## `autoCloseAfterDays` is the one field here that is not a plain number
 *
 * The other two are required numbers with a range. Auto-close is
 * `number | null`, and `null` is a CLAIM — "off" — rather than an absence. It
 * gets an `Off` checkbox for exactly that reason: a user who wants auto-close
 * off has to be able to SAY so, and a blank number input cannot distinguish
 * "off" from "not filled in yet". Ticking `Off` disables the number input and
 * sends `null`; unticking it re-enables the input at its last value.
 *
 * ## ONE Save, carrying ONLY what changed
 *
 * The event is a partial update: the schema accepts any non-empty subset of the
 * three keys and its `.strict()` `refine` refuses the empty claim. So this form
 * diffs against the values it was given and submits the changed keys alone.
 * **Save is disabled when nothing has changed**, and that is not politeness —
 * it is the only way to avoid submitting a claim the schema is guaranteed to
 * refuse, and a button whose only outcome is a refusal notice is a trap.
 *
 * **`null` is compared by VALUE, not by falsiness.** `autoCloseAfterDays: null`
 * against a stored `null` is NOT a change; `null` against a stored `30` is. A
 * truthiness check here would make "turn it off" invisible and the Save button
 * would never fire — which is the same present-versus-null defect the
 * projection's CASE exists to prevent, one layer up.
 *
 * ## The refusal split is Ruling 27's, unchanged
 *
 * A server refusal (`gn-refusal--server`, `Refused by the server — <rule>:
 * <reason>`), silence, and a transport failure are three different facts and
 * get three different sentences, exactly as `BacklogStartButton` and
 * `board.tsx` do it. Reading them as one — "could not save" — would tell a user
 * whose claim was REFUSED that the network was down.
 */
export function WorkspaceSettingsForm({
  dataSource,
  workspaceId,
  settings,
  canEdit,
  currentUserId,
  onSaved,
}: WorkspaceSettingsFormProps) {
  // Draft state, as STRINGS: a number input's value is a string and coercing on
  // every keystroke would fight the user mid-typing (`.` or a trailing `0`).
  const [draft, setDraft] = useState<Record<Knob, string>>(() => ({
    staleDays: String(settings.staleDays),
    dueSoonDays: String(settings.dueSoonDays),
    autoCloseAfterDays:
      settings.autoCloseAfterDays === null ? '' : String(settings.autoCloseAfterDays),
  }));
  const [autoCloseOff, setAutoCloseOff] = useState<boolean>(settings.autoCloseAfterDays === null);
  // Unique per instance, so the three `htmlFor`/`id` pairs cannot collide with
  // a second form on the page or with any other labelled control.
  const fieldId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  /**
   * The keys whose value differs from what the server answered, computed from
   * the DRAFT rather than on submit, because Save's disabled state reads it.
   *
   * `null` for auto-close is reached two ways — the `Off` box, or an empty
   * input — and both mean off. Every other value must parse to a finite number;
   * an unparseable one is NOT dropped from the change set, because dropping it
   * would submit a claim that silently omits what the user typed. Instead the
   * whole form reports itself unsubmittable (below), so the user sees that
   * something is wrong rather than watching a field they edited be ignored.
   */
  const changes = useMemo(() => {
    const out: Partial<Record<Knob, number | null>> = {};

    const stale = Number(draft.staleDays.trim());
    const staleValid = draft.staleDays.trim() !== '' && Number.isFinite(stale);
    if (staleValid && stale !== settings.staleDays) out.staleDays = stale;

    const dueSoon = Number(draft.dueSoonDays.trim());
    const dueSoonValid = draft.dueSoonDays.trim() !== '' && Number.isFinite(dueSoon);
    if (dueSoonValid && dueSoon !== settings.dueSoonDays) out.dueSoonDays = dueSoon;

    if (autoCloseOff) {
      if (settings.autoCloseAfterDays !== null) out.autoCloseAfterDays = null;
    } else {
      const auto = Number(draft.autoCloseAfterDays.trim());
      const autoValid = draft.autoCloseAfterDays.trim() !== '' && Number.isFinite(auto);
      if (autoValid && auto !== settings.autoCloseAfterDays) out.autoCloseAfterDays = auto;
    }

    return out;
  }, [draft, autoCloseOff, settings]);

  const invalid =
    draft.staleDays.trim() === '' ||
    !Number.isFinite(Number(draft.staleDays.trim())) ||
    draft.dueSoonDays.trim() === '' ||
    !Number.isFinite(Number(draft.dueSoonDays.trim())) ||
    (!autoCloseOff &&
      (draft.autoCloseAfterDays.trim() === '' ||
        !Number.isFinite(Number(draft.autoCloseAfterDays.trim()))));

  const dirty = Object.keys(changes).length > 0;

  const save = async (): Promise<void> => {
    if (!canEdit || !dirty || invalid) return;
    setSubmitting(true);
    try {
      const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });
      const claim = make({
        workspaceId,
        entity: { kind: 'workspace', id: workspaceId },
        type: 'workspace.settings_set',
        // ONLY the changed keys — see this component's docblock. The server's
        // projection keeps the untouched ones by design.
        payload: changes,
      });
      const results = await dataSource.ingest([claim]);
      const result = results[0];
      if (result === undefined) {
        // Ruling 27: silence, not a refusal.
        if (mountedRef.current) {
          setServerRefusal(null);
          setTransportError('The server did not answer this save.');
        }
        return;
      }
      if (result.status === 'committed') {
        if (mountedRef.current) {
          setServerRefusal(null);
          setTransportError(null);
        }
        onSaved();
        return;
      }
      if (mountedRef.current) {
        setTransportError(null);
        setServerRefusal(
          result.status === 'refused'
            ? { rule: result.rule, reason: result.reason }
            : { rule: result.code, reason: result.message },
        );
      }
    } catch (cause) {
      if (mountedRef.current) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setTransportError(`We could not reach the server for this save — ${message}`);
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="gn-field">
        <label className="gn-field__label" htmlFor={`${fieldId}-stale`}>
          Stale after
        </label>
        <input
          id={`${fieldId}-stale`}
          className="gn-field__input"
          type="number"
          min={1}
          max={365}
          value={draft.staleDays}
          disabled={!canEdit || submitting}
          onChange={(event) => setDraft({ ...draft, staleDays: event.target.value })}
        />
        {/* The unit is OUTSIDE the label element on purpose: the inputs are
            addressed by `htmlFor`/`id` rather than by wrapping, so each
            control's accessible name is exactly `Stale after` and not
            `Stale after days`. `gn-field__label` is reused for the unit rather
            than a new class invented for it — it is the product's one small
            muted text treatment, and a new class here would be a new token to
            keep in step with it. */}
        <span className="gn-field__label">days</span>
      </div>

      <div className="gn-field">
        <label className="gn-field__label" htmlFor={`${fieldId}-due-soon`}>
          Due soon within
        </label>
        <input
          id={`${fieldId}-due-soon`}
          className="gn-field__input"
          type="number"
          min={0}
          max={365}
          value={draft.dueSoonDays}
          disabled={!canEdit || submitting}
          onChange={(event) => setDraft({ ...draft, dueSoonDays: event.target.value })}
        />
        <span className="gn-field__label">days</span>
      </div>

      <div className="gn-field">
        <label className="gn-field__label" htmlFor={`${fieldId}-auto-close`}>
          Auto-close after
        </label>
        <input
          id={`${fieldId}-auto-close`}
          className="gn-field__input"
          type="number"
          min={1}
          max={365}
          value={autoCloseOff ? '' : draft.autoCloseAfterDays}
          disabled={!canEdit || submitting || autoCloseOff}
          onChange={(event) => setDraft({ ...draft, autoCloseAfterDays: event.target.value })}
        />
        <span className="gn-field__label">days</span>
      </div>

      {/* The `Off` control, and the reason the field above is not simply a
          number input: `null` is a claim the user has to be able to make, and a
          blank number box cannot distinguish "off" from "not typed yet". Same
          bare-label-wrapping-a-checkbox idiom the list filter and the calendar
          legend use — no class of its own. */}
      <label>
        <input
          type="checkbox"
          checked={autoCloseOff}
          disabled={!canEdit || submitting}
          onChange={(event) => setAutoCloseOff(event.target.checked)}
        />
        Off
      </label>

      {canEdit ? (
        <Button
          variant="primary"
          disabled={submitting || !dirty || invalid}
          onClick={() => void save()}
        >
          Save
        </Button>
      ) : (
        <p>Only a workspace admin can change these.</p>
      )}

      {serverRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server — ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}
      {transportError !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {transportError}
        </p>
      ) : null}
    </div>
  );
}
