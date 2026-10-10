import { useEffect, useId, useRef, useState } from "react";
import { Form } from "react-bootstrap";

export interface CommitOnBlurTextProps {
  value: string;
  onCommit: (value: string) => void;
  /** Rejects a candidate without committing it; the message shows under the input. */
  validate?: (value: string) => string | null;
  disabled: boolean;
  /** Visible label. Omit it for a bare control, e.g. one axis in an InputGroup. */
  label?: string;
  /** Accessible name; defaults to the visible label. */
  ariaLabel?: string;
  placeholder?: string;
  helperText?: string;
}

/**
 * A text input whose value only reaches the surrounding form on blur.
 *
 * A numeric leaf cannot be committed per keystroke: "1." and "-" are not
 * representable in the JSON the form holds, so committing eagerly would rewrite
 * what the user is typing mid-keystroke, "1." becomes "1", and the next "5"
 * then yields 15. The same contract as the frame bounds editors' "Raw Data"
 * field: keep the draft, parse on blur, and leave the value alone on failure.
 */
export function CommitOnBlurText({
  value,
  onCommit,
  validate,
  disabled,
  label,
  ariaLabel,
  placeholder,
  helperText,
}: CommitOnBlurTextProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const inputId = useId();

  useEffect(() => {
    if (!focused.current) {
      setText(value);
      setError(null);
    }
  }, [value]);

  const commit = () => {
    focused.current = false;
    const problem = validate?.(text) ?? null;
    setError(problem);
    if (!problem && text !== value) {
      onCommit(text);
    }
  };

  const control = (
    <Form.Control
      type="text"
      size="sm"
      aria-label={ariaLabel ?? label}
      isInvalid={error != null}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={commit}
    />
  );
  const errorText = error && (
    <div className="invalid-feedback d-block small">{error}</div>
  );

  if (!label) {
    // A bare control sits inside an InputGroup, but its message still has to
    // reach the user: a rejected edit that says nothing looks like an ignored
    // keystroke.
    return (
      <>
        {control}
        {errorText}
      </>
    );
  }

  return (
    <Form.Group className="mb-2" controlId={inputId}>
      {/* Bootstrap's .form-label is not block-level, so without this a control
          that follows an empty group would ride on the label's own line. */}
      <Form.Label className="small d-block mb-1">{label}</Form.Label>
      {control}
      {errorText}
      {helperText && !error && (
        <Form.Text className="text-muted d-block">{helperText}</Form.Text>
      )}
    </Form.Group>
  );
}
