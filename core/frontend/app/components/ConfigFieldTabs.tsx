import { useState, useId, type ReactNode } from "react";
import { Button, Form } from "react-bootstrap";

import type { OpenAPIJSONSchema } from "../models/openapi";

export type ConfigParse<TValue> =
  { ok: true; value: TValue } | { ok: false; error: string };

export interface ConfigEditorState<TValue> {
  value: TValue;
  disabled: boolean;
  onChange: (value: TValue) => void;
}

/**
 * The field tab for a JSON value whose shape is not known to the UI.
 *
 * A schema-less field has no controls to offer, but the tab is still worth
 * keeping: it says so plainly rather than leaving the reader to wonder whether
 * an editor exists somewhere they have not looked.
 */
export function ConfigFieldPlaceholder() {
  return (
    <div className="text-muted small border rounded p-3 mb-2">
      Nothing to configure just yet!
    </div>
  );
}

export interface ConfigFieldTabsProps<TValue> {
  /** Names the field on its tabs: `<label>` and `<label> (Raw JSON)`. */
  label: string;
  /** FormData key carried by the raw textarea; the structured tab never submits. */
  name: string;
  text: string;
  onTextChange: (text: string) => void;
  parse: (text: string) => ConfigParse<TValue>;
  format: (value: TValue) => string;
  editor: (state: ConfigEditorState<TValue>) => ReactNode;
  /** Shown by the structured tab when the raw text has never parsed. */
  emptyValue: TValue;
  schema?: OpenAPIJSONSchema;
  readOnly?: boolean;
  rows?: number;
  helperText?: ReactNode;
}

/**
 * A form field whose value is structured text, edited on two tabs: the
 * bespoke field editor, and the raw JSON beside it.
 *
 * The raw text is the only state: the field tab reads a value parsed out of it
 * and writes back through `format`, so what the form submits, and what the
 * server-side validator sees, is exactly the text on the raw tab. While the
 * text does not parse, the field tab holds the last valid value disabled rather
 * than discarding either half, and says why.
 */
export function ConfigFieldTabs<TValue>({
  label,
  name,
  text,
  onTextChange,
  parse,
  format,
  editor,
  emptyValue,
  schema,
  readOnly = false,
  rows = 10,
  helperText,
}: ConfigFieldTabsProps<TValue>) {
  const [showRaw, setShowRaw] = useState(false);
  const ids = useId();
  const fieldsTabId = `${ids}-fields`;
  const rawTabId = `${ids}-raw`;
  const fieldsPanelId = `${ids}-fields-panel`;
  const rawPanelId = `${ids}-raw-panel`;

  const parsed = parse(text);
  const [lastValid, setLastValid] = useState<{
    text: string;
    value: TValue;
  } | null>(null);
  if (parsed.ok && lastValid?.text !== text) {
    // State adjusted during render, gated on the text so re-parsing the same
    // text cannot loop: an invalid edit must not throw away the last good value.
    setLastValid({ text, value: parsed.value });
  }

  const invalid = !parsed.ok;
  const disabled = invalid || readOnly;
  const editorValue = parsed.ok
    ? parsed.value
    : lastValid
      ? lastValid.value
      : emptyValue;

  return (
    <Form.Group className="mb-3">
      <ul className="nav nav-tabs mb-3" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={`nav-link${showRaw ? "" : " active"}`}
            id={fieldsTabId}
            aria-controls={fieldsPanelId}
            aria-selected={!showRaw}
            onClick={() => setShowRaw(false)}
            type="button"
            role="tab"
          >
            {label}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={`nav-link${showRaw ? " active" : ""}`}
            id={rawTabId}
            aria-controls={rawPanelId}
            aria-selected={showRaw}
            onClick={() => setShowRaw(true)}
            type="button"
            role="tab"
          >
            {label} (Raw JSON)
            {invalid && (
              <span className="badge text-bg-danger ms-1">invalid</span>
            )}
          </button>
        </li>
      </ul>
      {helperText && (
        <Form.Text className="d-block mb-2">{helperText}</Form.Text>
      )}

      {/* Both tabs stay mounted: the raw textarea is what carries the FormData
          key, so unmounting it while the field tab is shown would drop the
          field from the submit entirely. */}
      <div
        className={showRaw ? "d-none" : undefined}
        role="tabpanel"
        id={fieldsPanelId}
        aria-labelledby={fieldsTabId}
      >
        {invalid && (
          <div className="text-danger small mb-2">
            {parsed.error} Fix it on the raw JSON tab to edit these fields.
          </div>
        )}
        <fieldset
          disabled={disabled}
          style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
        >
          {editor({
            value: editorValue,
            disabled,
            onChange: (value) => onTextChange(format(value)),
          })}
        </fieldset>
      </div>
      <div
        className={showRaw ? undefined : "d-none"}
        role="tabpanel"
        id={rawPanelId}
        aria-labelledby={rawTabId}
      >
        <Form.Control
          as="textarea"
          name={name}
          rows={rows}
          className="font-monospace"
          aria-label={`${label} raw JSON`}
          value={text}
          readOnly={readOnly}
          onChange={(event) => onTextChange(event.target.value)}
        />
        {invalid && (
          <div className="text-danger small mt-1">{parsed.error}</div>
        )}
        {schema && (
          <details className="mt-2">
            <summary className="small text-muted">
              Show this field's JSON Schema
            </summary>
            <Button
              size="sm"
              variant="outline-secondary"
              className="mt-2 mb-1"
              onClick={() => {
                void navigator.clipboard.writeText(
                  JSON.stringify(schema, null, 2),
                );
              }}
            >
              Copy schema
            </Button>
            <pre
              className="small bg-body-tertiary border rounded p-2 mb-0"
              style={{ maxHeight: "12rem", overflow: "auto" }}
            >
              {JSON.stringify(schema, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Form.Group>
  );
}
