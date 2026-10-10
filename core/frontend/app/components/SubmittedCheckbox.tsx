import { useId, type ComponentProps } from "react";
import { Form } from "react-bootstrap";

type SubmittedCheckboxProps = Omit<
  ComponentProps<typeof Form.Check>,
  "type" | "name" | "value"
> & {
  name: string;
  value?: string;
  uncheckedValue?: string;
};

export function SubmittedCheckbox({
  name,
  value = "true",
  uncheckedValue = "false",
  ...props
}: SubmittedCheckboxProps) {
  // react-bootstrap only writes the label's `htmlFor` when the input has an id,
  // so without one the checkbox renders with no accessible name.
  const generatedId = useId();
  return (
    <>
      <input type="hidden" name={name} value={uncheckedValue} />
      <Form.Check
        {...props}
        id={props.id ?? generatedId}
        type="checkbox"
        name={name}
        value={value}
      />
    </>
  );
}
