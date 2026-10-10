import { default as React, useId } from "react";
import { Button, Form, InputGroup } from "react-bootstrap";

import { CommitOnBlurText, type ConfigParse } from "sta/app/components";
import type { PointCloudConfig } from "sta/client";

export type PointCloudPreprocessor = NonNullable<
  PointCloudConfig["preprocessors"]
>[number];

export type PreprocessorOpName = PointCloudPreprocessor["op_name"];

/**
 * One stored preprocessor item, carried as the object it was parsed from.
 *
 * Editing a listed field writes through this copy, so keys the editor does not
 * know about, and optional keys the stored config leaves out, survive a
 * structured edit instead of being silently dropped.
 */
export interface PreprocessorDraft {
  op_name: PreprocessorOpName;
  item: Record<string, unknown>;
}

export type PreprocessorDrafts = PreprocessorDraft[];

interface ScalarLeaf {
  kind: "boolean" | "integer" | "number" | "string";
  key: string;
  label: string;
  helper?: string;
}

interface VectorLeaf {
  kind: "vector";
  key: string;
  label: string;
  helper?: string;
}

interface PairsLeaf {
  kind: "pairs";
  /** Names the field for React only; a pairs value is the whole `op_params`. */
  key: string;
  label: string;
  helper?: string;
}

type PreprocessorLeaf = ScalarLeaf | VectorLeaf | PairsLeaf;

/**
 * Field tables for every supported op, keyed by the op names the generated
 * client declares. An op added in Python without an entry here is a type error
 * rather than a silently missing editor, which is why this replaces the
 * hand-maintained op-name list the raw-textarea form needed.
 */
const PREPROCESSOR_EDITORS: Record<
  PreprocessorOpName,
  { summary: string; leaves: PreprocessorLeaf[] }
> = {
  "crop-box": {
    summary: "keep points inside a box",
    leaves: [
      { kind: "boolean", key: "keep", label: "Keep points inside the area" },
      {
        kind: "vector",
        key: "box_min",
        label: "Box minimum",
        helper:
          "Corner at or above this point. Leave an axis empty to leave it unbounded.",
      },
      {
        kind: "vector",
        key: "box_max",
        label: "Box maximum",
        helper:
          "Corner at or below this point. Leave an axis empty to leave it unbounded.",
      },
      {
        kind: "vector",
        key: "rotate_area",
        label: "Rotation area",
        helper:
          "Optional pivot point {x, y}: a point's angle is measured from it before the bounds are applied. Leave every axis empty for no rotation.",
      },
    ],
  },
  "crop-polygon": {
    summary: "keep points inside a polygon",
    leaves: [
      { kind: "boolean", key: "keep", label: "Keep points inside the area" },
      {
        kind: "string",
        key: "uri",
        label: "Polygon area file URI",
        helper: "URI of the file describing the polygon.",
      },
      {
        kind: "number",
        key: "min_z",
        label: "Minimum Z",
        helper:
          "Points below this height are removed. Empty leaves it unbounded.",
      },
      {
        kind: "number",
        key: "max_z",
        label: "Maximum Z",
        helper:
          "Points above this height are removed. Empty leaves it unbounded.",
      },
    ],
  },
  denoise: {
    summary: "remove noise outliers",
    leaves: [
      {
        kind: "integer",
        key: "nb_neighbours",
        label: "Number of neighbours",
        helper: "Neighbours consulted to determine the local mean position.",
      },
      {
        kind: "number",
        key: "std_ratio",
        label: "Standard deviation ratio",
        helper:
          "Points farther than the mean distance plus this many standard deviations are removed.",
      },
    ],
  },
  "downsample-random": {
    summary: "randomly downsample",
    leaves: [
      {
        kind: "number",
        key: "proportion",
        label: "Proportion",
        helper: "Fraction of points to keep, from 0 to 1.",
      },
    ],
  },
  "remove-bg": {
    summary: "remove background points by intensity band",
    leaves: [
      {
        kind: "pairs",
        key: "bands",
        label: "Intensity bands",
        helper:
          "Each band needs a minimum and a maximum channel-value file URI. Points inside any band are removed.",
      },
    ],
  },
};

/** Insertion order is the order the ops are offered and listed in errors. */
export const PREPROCESSOR_OP_NAMES = Object.keys(
  PREPROCESSOR_EDITORS,
) as PreprocessorOpName[];

const BLANK_PARAMS: Record<
  PreprocessorOpName,
  () => Record<string, unknown> | unknown[]
> = {
  "crop-box": () => ({ keep: true, box_min: {}, box_max: {} }),
  "crop-polygon": () => ({ keep: true, uri: "", min_z: null, max_z: null }),
  denoise: () => ({ nb_neighbours: 10, std_ratio: 2 }),
  "downsample-random": () => ({ proportion: 0.5 }),
  "remove-bg": () => [],
};

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatPreprocessors(
  value: PointCloudConfig["preprocessors"] | undefined,
): string {
  return JSON.stringify(value ?? [], null, 2);
}

export function parsePreprocessors(value: string): {
  preprocessors?: PointCloudPreprocessor[];
  error?: string;
} {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { preprocessors: [] };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: "Config: Preprocessors must be a JSON array." };
    }

    for (const [index, item] of parsed.entries()) {
      if (!isPlainObject(item)) {
        return {
          error: `Config: Preprocessor ${index + 1} must be an object.`,
        };
      }

      if (
        typeof item.op_name !== "string" ||
        !PREPROCESSOR_OP_NAMES.includes(item.op_name as PreprocessorOpName)
      ) {
        return {
          error: `Config: Preprocessor ${index + 1} must use one of ${PREPROCESSOR_OP_NAMES.join(", ")}.`,
        };
      }

      if (!("op_params" in item)) {
        return {
          error: `Config: Preprocessor ${index + 1} must include op_params.`,
        };
      }
    }

    return { preprocessors: parsed as PointCloudPreprocessor[] };
  } catch {
    return { error: "Config: Preprocessors must be valid JSON." };
  }
}

function paramsOf(item: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(item.op_params) ? item.op_params : {};
}

function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function numberText(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function integerError(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  return /^-?\d+$/.test(trimmed) ? null : "Enter a whole number.";
}

function numberError(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  return Number.isNaN(Number(trimmed)) ? "Enter a number." : null;
}

function withParams(
  draft: PreprocessorDraft,
  params: Record<string, unknown> | unknown[],
): PreprocessorDraft {
  return { ...draft, item: { ...draft.item, op_params: params } };
}

function writeScalar(
  draft: PreprocessorDraft,
  leaf: ScalarLeaf,
  text: string,
): PreprocessorDraft {
  const params = { ...paramsOf(draft.item) };
  const trimmed = text.trim();
  switch (leaf.kind) {
    case "boolean":
      params[leaf.key] = trimmed === "true";
      break;
    case "string":
      params[leaf.key] = text;
      break;
    default:
      // An empty numeric field is written as null rather than deleted: the
      // optional bounds read null as "unbounded", and a required one then fails
      // with a message naming it instead of reading as an omitted key.
      params[leaf.key] = trimmed === "" ? null : Number(trimmed);
      break;
  }
  return withParams(draft, params);
}

function writeVectorAxis(
  draft: PreprocessorDraft,
  leaf: VectorLeaf,
  axis: string,
  text: string,
): PreprocessorDraft {
  const current = isPlainObject(paramsOf(draft.item)[leaf.key])
    ? { ...(paramsOf(draft.item)[leaf.key] as Record<string, unknown>) }
    : {};
  if (text.trim() === "") {
    // An omitted axis is the documented "unbounded" spelling, and keeping it
    // absent means an untouched vector re-emits byte-identically.
    delete current[axis];
  } else {
    current[axis] = Number(text);
  }
  return withParams(draft, { ...paramsOf(draft.item), [leaf.key]: current });
}

export function preprocessorDrafts(
  value: string,
): ConfigParse<PreprocessorDrafts> {
  const parsed = parsePreprocessors(value);
  if (!parsed.preprocessors) {
    return {
      ok: false,
      error: parsed.error ?? "Config: Preprocessors are invalid.",
    };
  }

  return {
    ok: true,
    value: parsed.preprocessors.map((item) => ({
      op_name: item.op_name,
      item: item,
    })),
  };
}

export function jsonFromPreprocessorDrafts(drafts: PreprocessorDrafts): string {
  return JSON.stringify(
    drafts.map((draft) => ({ ...draft.item, op_name: draft.op_name })),
    null,
    2,
  );
}

function blankDraft(opName: PreprocessorOpName): PreprocessorDraft {
  return {
    op_name: opName,
    item: { op_name: opName, op_params: BLANK_PARAMS[opName]() },
  };
}

export interface PreprocessorFieldsProps {
  drafts: PreprocessorDrafts;
  disabled: boolean;
  onChange: (drafts: PreprocessorDrafts) => void;
}

/** Structured editor for a point cloud spec's `preprocessors` config list. */
export function PreprocessorFields({
  drafts,
  disabled,
  onChange,
}: PreprocessorFieldsProps) {
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= drafts.length) {
      return;
    }
    const next = [...drafts];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div className="mb-2">
      {drafts.length === 0 && (
        <div className="text-muted small mb-2">(Empty)</div>
      )}
      {drafts.map((draft, index) => (
        <PreprocessorCard
          key={index}
          draft={draft}
          index={index}
          total={drafts.length}
          disabled={disabled}
          onDraftChange={(next) =>
            onChange(drafts.map((current, i) => (i === index ? next : current)))
          }
          onMove={(offset) => move(index, offset)}
          onRemove={() => onChange(drafts.filter((_, i) => i !== index))}
        />
      ))}
      <Button
        size="sm"
        variant="outline-secondary"
        disabled={disabled}
        onClick={() => onChange([...drafts, blankDraft("crop-box")])}
      >
        Add preprocessor
      </Button>
    </div>
  );
}

interface PreprocessorCardProps {
  draft: PreprocessorDraft;
  index: number;
  total: number;
  disabled: boolean;
  onDraftChange: (draft: PreprocessorDraft) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}

function PreprocessorCard({
  draft,
  index,
  total,
  disabled,
  onDraftChange,
  onMove,
  onRemove,
}: PreprocessorCardProps) {
  const editor = PREPROCESSOR_EDITORS[draft.op_name];
  const params = draft.item.op_params;
  const editable = isPlainObject(params) || Array.isArray(params);

  return (
    <div className="border rounded p-2 mb-2">
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="text-muted small">{index + 1}</span>
        {/* Switching op starts a fresh item: the params of one op do not carry
            over to another, and item-level extras would be meaningless. */}
        <Form.Select
          size="sm"
          className="flex-grow-1"
          value={draft.op_name}
          disabled={disabled}
          aria-label={`Operation ${index + 1}`}
          onChange={(event) =>
            onDraftChange(blankDraft(event.target.value as PreprocessorOpName))
          }
        >
          {PREPROCESSOR_OP_NAMES.map((opName) => (
            <option key={opName} value={opName}>
              {opName} — {PREPROCESSOR_EDITORS[opName].summary}
            </option>
          ))}
        </Form.Select>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          title="Move earlier in the pipeline"
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
          title="Move later in the pipeline"
        >
          ↓
        </Button>
        <Button
          size="sm"
          variant="outline-danger"
          disabled={disabled}
          onClick={onRemove}
          title="Remove this preprocessor"
        >
          ×
        </Button>
      </div>

      {!editable && (
        <div className="text-muted small">
          This item's op_params is neither an object nor a list, so only the raw
          JSON can edit it.
        </div>
      )}
      {editable &&
        editor.leaves.map((leaf) => (
          <LeafField
            key={leaf.key}
            leaf={leaf}
            draft={draft}
            disabled={disabled}
            onChange={onDraftChange}
          />
        ))}
    </div>
  );
}

interface LeafFieldProps {
  leaf: PreprocessorLeaf;
  draft: PreprocessorDraft;
  disabled: boolean;
  onChange: (draft: PreprocessorDraft) => void;
}

function LeafField({ leaf, draft, disabled, onChange }: LeafFieldProps) {
  const params = paramsOf(draft.item);
  const checkId = useId();

  if (leaf.kind === "vector") {
    const axes = params[leaf.key];
    const vector = isPlainObject(axes) ? axes : {};
    return (
      <Form.Group className="mb-2">
        <Form.Label className="small d-block mb-1">{leaf.label}</Form.Label>
        <InputGroup size="sm">
          {(["x", "y", "z"] as const).map((axis) => (
            <React.Fragment key={axis}>
              <InputGroup.Text>{axis}</InputGroup.Text>
              <CommitOnBlurText
                ariaLabel={`${leaf.label} ${axis}`}
                value={numberText(vector[axis])}
                disabled={disabled}
                validate={numberError}
                onCommit={(text) =>
                  onChange(writeVectorAxis(draft, leaf, axis, text))
                }
              />
            </React.Fragment>
          ))}
        </InputGroup>
        {leaf.helper && (
          <Form.Text className="text-muted d-block">{leaf.helper}</Form.Text>
        )}
      </Form.Group>
    );
  }

  if (leaf.kind === "pairs") {
    const stored = draft.item.op_params;
    const bands: unknown[] = Array.isArray(stored) ? stored : [];
    const setBand = (
      index: number,
      key: "min_values_uri" | "max_values_uri",
      text: string,
    ) => {
      onChange(
        withParams(
          draft,
          bands.map((band, i) => ({
            ...(isPlainObject(band) ? band : {}),
            ...(i === index ? { [key]: text } : {}),
          })),
        ),
      );
    };

    return (
      <Form.Group className="mb-2">
        <Form.Label className="small d-block mb-1">{leaf.label}</Form.Label>
        {bands.length === 0 && (
          <div className="text-muted small mb-1">(Empty)</div>
        )}
        {bands.map((band, index) => {
          const row = isPlainObject(band) ? band : {};
          return (
            <div key={index} className="d-flex gap-2 mb-1">
              <Form.Control
                size="sm"
                type="text"
                aria-label={`Band ${index + 1} minimum values URI`}
                value={textOf(row.min_values_uri)}
                placeholder="minimum channel values file URI"
                disabled={disabled}
                onChange={(event) =>
                  setBand(index, "min_values_uri", event.target.value)
                }
              />
              <Form.Control
                size="sm"
                type="text"
                aria-label={`Band ${index + 1} maximum values URI`}
                value={textOf(row.max_values_uri)}
                placeholder="maximum channel values file URI"
                disabled={disabled}
                onChange={(event) =>
                  setBand(index, "max_values_uri", event.target.value)
                }
              />
              <Button
                size="sm"
                variant="outline-danger"
                disabled={disabled}
                title="Remove this band"
                onClick={() =>
                  onChange(
                    withParams(
                      draft,
                      bands.filter((_, i) => i !== index),
                    ),
                  )
                }
              >
                ×
              </Button>
            </div>
          );
        })}
        {/* Own block: the button must never share the header's line, which it
            would while the list is empty. */}
        <div className="mt-1">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={disabled}
            onClick={() =>
              onChange(
                withParams(draft, [
                  ...bands,
                  { min_values_uri: "", max_values_uri: "" },
                ]),
              )
            }
          >
            Add band
          </Button>
        </div>
        {leaf.helper && (
          <Form.Text className="text-muted d-block">{leaf.helper}</Form.Text>
        )}
      </Form.Group>
    );
  }

  if (leaf.kind === "boolean") {
    return (
      <Form.Group className="mb-2" controlId={checkId}>
        <Form.Check
          type="checkbox"
          label={leaf.label}
          className="small"
          checked={params[leaf.key] === true}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              writeScalar(draft, leaf, event.target.checked ? "true" : "false"),
            )
          }
        />
      </Form.Group>
    );
  }

  if (leaf.kind === "string") {
    return (
      <Form.Group className="mb-2">
        <Form.Label className="small d-block mb-1">{leaf.label}</Form.Label>
        <Form.Control
          size="sm"
          type="text"
          value={textOf(params[leaf.key])}
          disabled={disabled}
          onChange={(event) =>
            onChange(writeScalar(draft, leaf, event.target.value))
          }
        />
        {leaf.helper && (
          <Form.Text className="text-muted d-block">{leaf.helper}</Form.Text>
        )}
      </Form.Group>
    );
  }

  return (
    <CommitOnBlurText
      label={leaf.label}
      value={numberText(params[leaf.key])}
      disabled={disabled}
      helperText={leaf.helper}
      validate={leaf.kind === "integer" ? integerError : numberError}
      onCommit={(text) => onChange(writeScalar(draft, leaf, text))}
    />
  );
}
