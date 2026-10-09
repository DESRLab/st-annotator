import { Fragment } from 'react';
import { Form, InputGroup } from 'react-bootstrap';


export type VectorField<TField extends string> = {
  key: TField;
  label: string;
  axis: string;
};

type VectorInputFieldsProps<TField extends string, TState extends Record<TField, string>> = {
  label?: string;
  fields: VectorField<TField>[];
  formData: TState;
  disabled: boolean;
  helperText?: string;
  className?: string;
  onChange: (field: TField, value: string) => void;
};

export function VectorInputFields<TField extends string, TState extends Record<TField, string>>({
  label,
  fields,
  formData,
  disabled,
  helperText,
  className = 'mb-3',
  onChange,
}: VectorInputFieldsProps<TField, TState>) {
  return (
    <Form.Group className={className}>
      {label && <Form.Label>{label}</Form.Label>}
      <fieldset disabled={disabled} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <InputGroup>
          {fields.map((field) => (
            <Fragment key={field.key}>
              <InputGroup.Text>{field.axis}</InputGroup.Text>
              <Form.Control
                type="text"
                name={field.key}
                value={formData[field.key]}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.label}
              />
            </Fragment>
          ))}
        </InputGroup>
      </fieldset>
      {helperText && !disabled && <Form.Text className="text-muted d-block mt-2">{helperText}</Form.Text>}
    </Form.Group>
  );
}