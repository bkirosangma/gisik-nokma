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
