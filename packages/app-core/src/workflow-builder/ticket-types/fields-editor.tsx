import { newUlid, type CustomFieldDef } from '@gisik-nokma/domain';
import { Button, Select } from '@gisik-nokma/ui';

const FIELD_TYPES: readonly CustomFieldDef['type'][] = ['text', 'number', 'date', 'select', 'person'];

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
                options={FIELD_TYPES.map((fieldType) => ({ value: fieldType, label: fieldType }))}
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
