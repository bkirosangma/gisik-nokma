import { newUlid, type CustomFieldDef } from '@gisik-nokma/domain';

const FIELD_TYPES: readonly CustomFieldDef['type'][] = ['text', 'number', 'date', 'select', 'person'];

function parseOptions(raw: string): string[] | undefined {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? undefined : lines;
}

/** The five field kinds; only select carries options (one per line). Field ids are minted ULIDs — display names are the human layer. */
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
  return (
    <div className="fields-editor">
      <ul className="fields-editor__rows">
        {props.fields.map((field, index) => (
          <li className="fields-editor__row" data-testid={`field-row-${index}`} key={field.id}>
            <input
              type="text"
              aria-label="Field name"
              disabled={props.disabled === true}
              value={field.name}
              onChange={(changeEvent) => updateField(index, { name: changeEvent.target.value })}
            />
            <select
              aria-label="Field type"
              disabled={props.disabled === true}
              value={field.type}
              onChange={(changeEvent) =>
                updateField(index, { type: changeEvent.target.value as CustomFieldDef['type'] })
              }
            >
              {FIELD_TYPES.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {fieldType}
                </option>
              ))}
            </select>
            {field.type === 'select' ? (
              <textarea
                aria-label="Select options"
                placeholder="one option per line"
                disabled={props.disabled === true}
                defaultValue={field.options?.join('\n') ?? ''}
                onChange={(changeEvent) => updateField(index, { options: parseOptions(changeEvent.target.value) })}
              />
            ) : null}
            {props.disabled === true ? null : (
              <button
                type="button"
                aria-label="Remove field"
                onClick={() => props.onChange(props.fields.filter((_field, at) => at !== index))}
              >
                Remove field
              </button>
            )}
          </li>
        ))}
      </ul>
      {props.disabled === true ? null : (
        <button
          type="button"
          className="fields-editor__add"
          onClick={() =>
            props.onChange([...props.fields, { id: newUlid(), name: 'New field', type: 'text' }])
          }
        >
          Add field
        </button>
      )}
    </div>
  );
}
