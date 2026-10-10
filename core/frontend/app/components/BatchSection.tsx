import { useId, type ChangeEvent, type ReactNode } from "react";
import { Form } from "react-bootstrap";

import { SubmittedCheckbox } from "./SubmittedCheckbox";

export interface BatchSectionProps {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
  name?: string;
  value?: string;
}

export function BatchSection({
  label,
  checked,
  onToggle,
  children,
  name,
  value = "true",
}: BatchSectionProps) {
  // react-bootstrap associates a check's label only when the input has an id;
  // SubmittedCheckbox supplies its own, this branch has to supply one.
  const id = useId();
  return (
    <>
      <Form.Group className="mb-2">
        {name ? (
          <SubmittedCheckbox
            name={name}
            value={value}
            label={label}
            checked={checked}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onToggle(event.target.checked)
            }
          />
        ) : (
          <Form.Check
            id={id}
            type="checkbox"
            label={label}
            checked={checked}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onToggle(event.target.checked)
            }
          />
        )}
      </Form.Group>
      {checked && <div className="ms-4 mb-3">{children}</div>}
    </>
  );
}
