import type { ReactNode } from 'react';
import { Form } from 'react-bootstrap';


type BatchSectionProps = {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
};

export function BatchSection({ label, checked, onToggle, children }: BatchSectionProps) {
  return (
    <>
      <Form.Group className="mb-2">
        <Form.Check
          type="checkbox"
          label={label}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </Form.Group>
      {checked && <div className="ms-4 mb-3">{children}</div>}
    </>
  );
}