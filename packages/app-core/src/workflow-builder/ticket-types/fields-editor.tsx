import { CUSTOM_FIELD_KINDS, newUlid, type CustomFieldDef } from '@gisik-nokma/domain';
import { Button, Select } from '@gisik-nokma/ui';

/**
 * The five kinds' DISPLAY names, and the rule for this file is that they are
 * the ONLY thing that differs from the wire vocabulary.
 *
 * ## THE VOCABULARY IS NOT CHANGED, AND THE LABEL IS (Task 5b, item 5)
 *
 * The prototype offers `Text / Date / Number / Attachment` as capitalised pills
 * (`desktop.dc.html@6d7b67c0a52c:902`) and the product rendered the wire values
 * as raw lowercase labels — the delta audit recorded *"vocabulary AND casing
 * differ"* and the two halves are NOT the same question:
 *
 * - **Vocabulary: unchanged, deliberately.** `CUSTOM_FIELD_KINDS`
 *   (`packages/domain/src/ticket-types.ts:4`) `['text','number','date','select','person']`
 *   is `customFieldDefSchema`'s `type` — a WIRE value, recorded in every
 *   `ticket-type.defined` event ever written. Adding `attachment` is a
 *   DATA-MODEL decision (it decides whether a custom field can hold a file),
 *   not a label alignment, and it is with the owner. Nothing here renames,
 *   adds or removes a member.
 * - **Casing: fixed here, and it is a label change only.** `value` stays the
 *   lowercase member; `label` is what a person reads. Pinned by case 13.927,
 *   which asserts BOTH halves in one test precisely so a future rename cannot
 *   pass by satisfying the first.
 *
 * `Record<kind, string>` rather than a `Partial` or a lookup with a fallback:
 * the map is TOTAL over the vocabulary, so adding a sixth kind to the domain
 * fails `turbo run typecheck` here rather than rendering `undefined` in the
 * picker. That is the same "one source, spelled twice" argument the
 * `_css-binding` tests make for classes.
 */
const FIELD_TYPE_LABELS: Record<(typeof CUSTOM_FIELD_KINDS)[number], string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Select',
  person: 'Person',
};

function parseOptions(raw: string): string[] | undefined {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? undefined : lines;
}

/**
 * The five field kinds; only select carries options (one per line). Field ids
 * are minted ULIDs — display names are the human layer.
 *
 * `required` (owner ruling 2026-09-18, decision-list item 1) is the author's
 * declaration that this type expects a value for this field. **The button is
 * the whole carrier of that state and the whole of what ships:** nothing reads
 * the flag to refuse anything yet, and `customFieldDefSchema`'s own docblock
 * (`packages/domain/src/ticket-types.ts`) names that absence, why it is a
 * capability rather than a wiring job, and its owner. A toggle that changes
 * nothing is a promise the UI makes and the product does not keep, so the PR
 * body, `Features.md` and the catalogue all say so in the same change set.
 */
export function FieldsEditor(props: {
  fields: CustomFieldDef[];
  onChange(fields: CustomFieldDef[]): void;
  disabled?: boolean;
}) {
  function updateField(index: number, change: Partial<CustomFieldDef>): void {
    props.onChange(
      props.fields.map((field, at) => {
        if (at !== index) return field;
        const next = { ...field, ...change };
        if (next.type !== 'select') delete next.options; // only select fields take options (Plan 3 schema)
        return next;
      }),
    );
  }

  /**
   * The state lives in the accessible NAME and nowhere else — "Required" /
   * "Optional" — which is `TriStateChoice`'s own ruling one shape over
   * (`apps/web/src/tri-state-choice.tsx:46-47`: *"No `aria-pressed` — binary
   * semantics would lie for three states — so the state lives in the accessible
   * NAME"*). That control refused `aria-pressed` because three states would make
   * binary semantics lie; this one is genuinely binary and could carry it
   * truthfully, and still does not, for the other half of the same reasoning:
   * `aria-pressed` beside a state-named label is a SECOND statement of one fact,
   * free to disagree with the first the moment either moves. This repo refuses
   * that shape everywhere else — `ticket-types.ts:165-166` says it about day
   * claims in as many words ("two statements of one shape are two chances to
   * disagree"). One carrier, and it is the name a person hears.
   *
   * Absent is `false` here and ONLY here: `field.required === true` is the one
   * test, so a definition that never mentioned the flag reads "Optional" — not
   * because anyone said so, but because nothing has been claimed. The toggle
   * writes an explicit `true`/`false` the moment it is pressed, so the two
   * states stay distinguishable in the recorded definition
   * (`ticket-types.ts`, the `required` docblock's *"Absence means the definition
   * never said; `false` means the definition said optional"*).
   *
   * A newly added field carries neither member, exactly as it carries no
   * `options` — see `Add field` below.
   */
  function toggleRequired(index: number): void {
    updateField(index, { required: props.fields[index]?.required !== true });
  }
  return (
    <div className="fields-editor">
      <ul className="fields-editor__rows">
        {props.fields.map((field, index) => (
          <li className="fields-editor__row" data-testid={`field-row-${index}`} key={field.id}>
            <input
              type="text"
              className="gn-field__input fields-editor__name"
              aria-label="Field name"
              disabled={props.disabled === true}
              value={field.name}
              onChange={(changeEvent) => updateField(index, { name: changeEvent.target.value })}
            />
            <div className="fields-editor__type">
              <Select
                options={CUSTOM_FIELD_KINDS.map((fieldType) => ({
                  value: fieldType,
                  label: FIELD_TYPE_LABELS[fieldType],
                }))}
                value={field.type}
                onChange={(next) => updateField(index, { type: next as CustomFieldDef['type'] })}
                disabled={props.disabled === true}
                aria-label="Field type"
              />
            </div>
            <Button
              variant={field.required === true ? 'primary' : 'ghost'}
              className="fields-editor__required"
              disabled={props.disabled === true}
              onClick={() => toggleRequired(index)}
            >
              {field.required === true ? 'Required' : 'Optional'}
            </Button>
            {field.type === 'select' ? (
              <textarea
                className="gn-field__input fields-editor__options"
                aria-label="Select options"
                placeholder="one option per line"
                disabled={props.disabled === true}
                defaultValue={field.options?.join('\n') ?? ''}
                onChange={(changeEvent) => updateField(index, { options: parseOptions(changeEvent.target.value) })}
              />
            ) : null}
            {props.disabled === true ? null : (
              <Button
                variant="danger"
                aria-label="Remove field"
                onClick={() => props.onChange(props.fields.filter((_field, at) => at !== index))}
              >
                Remove field
              </Button>
            )}
          </li>
        ))}
      </ul>
      {props.disabled === true ? null : (
        <Button
          className="fields-editor__add"
          onClick={() =>
            props.onChange([...props.fields, { id: newUlid(), name: 'New field', type: 'text' }])
          }
        >
          Add field
        </Button>
      )}
    </div>
  );
}
