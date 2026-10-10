import { useEffect, useId, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  OptionalDecimalVector3Data,
  OptionalVector3Data,
  PartialSTBounds,
  Timestamp,
} from "sta/common";

type AxisKey = "x" | "y" | "z" | "t";
type AxisTab = "cells" | "range";
type MainTab = "data" | "sourceData" | "meshgrid";

interface CoordCell {
  min: number | null;
  max: number | null;
}

interface TimestampCell {
  min: Timestamp | null;
  max: Timestamp | null;
}

interface SourceGroupOption {
  id: number;
  name: string;
  description?: string;
}

export interface SourceLookupData {
  name: string;
  [key: string]: unknown;
}

export interface SourceDataRecord {
  id: number;
  st_bounds: PartialSTBounds;
  group?: {
    id: number;
    name: string;
  } | null;
}

export type SourceMetadataLoader = (
  sourceLookup: SourceLookupData,
  sourceGroupId: number,
) => Promise<readonly SourceDataRecord[]>;

interface NumberRangeState {
  start: string;
  end: string;
  stride: string;
  size: string;
}

interface TimeRangeState {
  start: string;
  end: string;
  stride: string;
  size: string;
}

interface AxisEditorShellProps<TCell> {
  idPrefix: string;
  cells: readonly TCell[];
  disabled?: boolean;
  getRangeCells: () => readonly TCell[];
  parseCellsText: (text: string) => readonly TCell[] | null;
  rangeCount: number;
  rangeDisabled: boolean;
  rangeEditor: React.ReactNode;
  onCellsChange: (cells: readonly TCell[]) => void;
}

interface FrameModalFormProps {
  className?: string;
  defaultSourceGroupId?: number | null;
  defaultSTBoundsMulti?: readonly PartialSTBounds[];
  disabled?: boolean;
  isOpen?: boolean;
  loadSourceMetadata?: SourceMetadataLoader;
  onSTBoundsMultiChange?: (stBoundsMulti: readonly PartialSTBounds[]) => void;
  sourceGroupInputName?: string;
  sourceGroups: readonly SourceGroupOption[];
  sourceLookups: readonly SourceLookupData[];
  stBoundsInputName?: string;
}

const ST_AXES: readonly AxisKey[] = ["x", "y", "z", "t"];
const DEFAULT_NUMBER_RANGE: NumberRangeState = {
  start: "0",
  end: "0",
  stride: "1",
  size: "1",
};
const DEFAULT_ENABLED_AXES: Record<AxisKey, boolean> = {
  x: true,
  y: true,
  z: true,
  t: true,
};

/** Removes boundaries on axes the user chose not to generate. */
export function restrictSTBoundsToAxes(
  stBounds: PartialSTBounds,
  enabledAxes: Record<AxisKey, boolean>,
): PartialSTBounds {
  return PartialSTBounds.create({
    min_coords: OptionalDecimalVector3Data.create({
      x: enabledAxes.x ? stBounds.min_coords.x : null,
      y: enabledAxes.y ? stBounds.min_coords.y : null,
      z: enabledAxes.z ? stBounds.min_coords.z : null,
    }),
    max_coords: OptionalDecimalVector3Data.create({
      x: enabledAxes.x ? stBounds.max_coords.x : null,
      y: enabledAxes.y ? stBounds.max_coords.y : null,
      z: enabledAxes.z ? stBounds.max_coords.z : null,
    }),
    min_timestamp: enabledAxes.t ? stBounds.min_timestamp : null,
    max_timestamp: enabledAxes.t ? stBounds.max_timestamp : null,
  });
}
// Avoid lagging the UI when too many frames are inputted
const RAW_BOUNDS_TEXT_LIMIT = 200;

const coordCellSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
});

const timestampCellSchema = z.object({
  min: Timestamp.SCHEMA.nullable(),
  max: Timestamp.SCHEMA.nullable(),
});

function cn(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

function serializePretty(value: unknown) {
  return JSON.stringify(value, undefined, 2);
}

function parseJsonArray(text: string): readonly unknown[] | null {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function parseCoordCells(text: string): readonly CoordCell[] | null {
  const parsed = parseJsonArray(text);
  if (parsed == null) return null;
  const result = z.array(coordCellSchema).safeParse(parsed);
  return result.success ? result.data : null;
}

function parseTimestampCells(text: string): readonly TimestampCell[] | null {
  const parsed = parseJsonArray(text);
  if (parsed == null) return null;
  const result = z.array(timestampCellSchema).safeParse(parsed);
  return result.success
    ? result.data.map((cell) => ({
        min: cell.min ?? null,
        max: cell.max ?? null,
      }))
    : null;
}

function parseSTBoundsMulti(text: string): readonly PartialSTBounds[] | null {
  const parsed = parseJsonArray(text);
  if (parsed == null) return null;
  const result = z.array(PartialSTBounds.SCHEMA).safeParse(parsed);
  return result.success ? result.data : null;
}

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parsePositiveNumber(value: string): number | null {
  const parsed = parseNumber(value);
  if (parsed == null || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseTimestamp(value: string): Timestamp | null {
  try {
    return new Timestamp(value);
  } catch {
    return null;
  }
}

function cellStartRangeLength(params: {
  start: number;
  end: number;
  stride: number;
  size: number;
}) {
  return Math.max(
    0,
    Math.ceil(
      (params.end - params.size + params.stride - params.start) / params.stride,
    ),
  );
}

function cellStartRangeInclusive(params: {
  start: number;
  end: number;
  stride: number;
  size: number;
}) {
  const length = cellStartRangeLength(params);
  if (length === 0) {
    return [] as number[];
  }

  return Array.from(
    { length },
    (_value, index) => params.start + index * params.stride,
  );
}

function buildNumberAxisCells(range: NumberRangeState): readonly CoordCell[] {
  const start = parseNumber(range.start);
  const end = parseNumber(range.end);
  const stride = parsePositiveNumber(range.stride);
  const size = parsePositiveNumber(range.size);

  if (start == null || end == null || stride == null || size == null) {
    return [];
  }

  return cellStartRangeInclusive({ start, end, stride, size }).map(
    (cellStart) => ({ min: cellStart, max: cellStart + size }),
  );
}

function buildTimeAxisCells(range: TimeRangeState): readonly TimestampCell[] {
  const start = parseTimestamp(range.start);
  const end = parseTimestamp(range.end);
  const stride = parsePositiveNumber(range.stride);
  const size = parsePositiveNumber(range.size);

  if (start == null || end == null || stride == null || size == null) {
    return [];
  }

  return cellStartRangeInclusive({
    start: start.getTime(),
    end: end.getTime(),
    stride,
    size,
  }).map((cellStart) => ({
    min: new Timestamp(cellStart),
    max: new Timestamp(cellStart + size),
  }));
}

const MAX_AXIS_CELLS = 100_000;

function numberAxisCellCount(range: NumberRangeState): number {
  const start = parseNumber(range.start);
  const end = parseNumber(range.end);
  const stride = parsePositiveNumber(range.stride);
  const size = parsePositiveNumber(range.size);
  return start == null || end == null || stride == null || size == null
    ? 0
    : cellStartRangeLength({ start, end, stride, size });
}

function timeAxisCellCount(range: TimeRangeState): number {
  const start = parseTimestamp(range.start);
  const end = parseTimestamp(range.end);
  const stride = parsePositiveNumber(range.stride);
  const size = parsePositiveNumber(range.size);
  return start == null || end == null || stride == null || size == null
    ? 0
    : cellStartRangeLength({
        start: start.getTime(),
        end: end.getTime(),
        stride,
        size,
      });
}

function formatNullableNumber(value: number | null) {
  return value == null ? "null" : `${value}`;
}

function formatNullableTimestamp(value: Timestamp | null) {
  return value == null ? "null" : value.toString();
}

function formatSourceBounds(stBounds: PartialSTBounds) {
  const spatial = stBounds.getSpatialBounds();
  const parts = [
    `x: [${formatNullableNumber(spatial.xBounds.min)}, ${formatNullableNumber(spatial.xBounds.max)}]`,
    `y: [${formatNullableNumber(spatial.yBounds.min)}, ${formatNullableNumber(spatial.yBounds.max)}]`,
    `z: [${formatNullableNumber(spatial.zBounds.min)}, ${formatNullableNumber(spatial.zBounds.max)}]`,
    `t: [${formatNullableTimestamp(stBounds.min_timestamp)}, ${formatNullableTimestamp(stBounds.max_timestamp)}]`,
  ];

  return parts.join(" | ");
}

function readonlyCountField(
  id: string,
  label: string,
  value: number,
  description?: string,
) {
  return (
    <div className="mb-3">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <input
        className="form-control"
        id={id}
        disabled
        type="number"
        value={value}
      />
      {description && <div className="form-text">{description}</div>}
    </div>
  );
}

function SourceMetadataTable({ data }: { data: readonly SourceDataRecord[] }) {
  if (data.length === 0) {
    return (
      <div className="text-body-secondary small">No reference data loaded.</div>
    );
  }

  const visibleData = data.slice(0, 200);

  return (
    <>
      {data.length > visibleData.length && (
        <div className="text-body-secondary small mb-2">
          Showing first {visibleData.length} of {data.length} reference data
          instances.
        </div>
      )}
      <div
        className="table-responsive border rounded"
        style={{ maxHeight: 256 }}
      >
        <table className="table table-sm align-middle mb-0">
          <thead className="table-light" style={{ position: "sticky", top: 0 }}>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Bounds</th>
            </tr>
          </thead>
          <tbody>
            {visibleData.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td className="small" style={{ fontFamily: "monospace" }}>
                  {formatSourceBounds(item.st_bounds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AxisEditorShell<TCell>({
  idPrefix,
  cells,
  disabled,
  getRangeCells,
  onCellsChange,
  parseCellsText,
  rangeCount,
  rangeDisabled,
  rangeEditor,
}: AxisEditorShellProps<TCell>) {
  const [activeTab, setActiveTab] = useState<AxisTab>("cells");
  const [cellsText, setCellsText] = useState(() => serializePretty(cells));
  const [cellsError, setCellsError] = useState<string | null>(null);
  useEffect(() => {
    setCellsText(serializePretty(cells));
  }, [cells]);

  function handleApplyRange() {
    onCellsChange(getRangeCells());
    setActiveTab("cells");
  }

  function handleCellsBlur() {
    const parsed = parseCellsText(cellsText);
    if (parsed == null) {
      setCellsError("Enter a valid JSON list with the required fields.");
      return;
    }
    setCellsError(null);
    onCellsChange(parsed);
    setActiveTab("cells");
  }

  return (
    <div className="border rounded p-2">
      <ul className="nav nav-tabs mb-3" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={cn("nav-link", activeTab === "cells" && "active")}
            onClick={() => setActiveTab("cells")}
            type="button"
          >
            List of cells{" "}
            <span className="badge text-bg-primary ms-1">{cells.length}</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={cn("nav-link", activeTab === "range" && "active")}
            onClick={() => setActiveTab("range")}
            type="button"
          >
            Generate from range
          </button>
        </li>
      </ul>

      {activeTab === "cells" && (
        <fieldset disabled={disabled}>
          <div>
            {readonlyCountField(
              `${idPrefix}-cells-count`,
              "Number of Cells:",
              cells.length,
            )}
            <div>
              <label className="form-label" htmlFor={`${idPrefix}-cells-text`}>
                Raw Data:
              </label>
              <textarea
                className="form-control"
                id={`${idPrefix}-cells-text`}
                onBlur={handleCellsBlur}
                onChange={(event) => setCellsText(event.target.value)}
                rows={10}
                style={{ fontFamily: "monospace" }}
                value={cellsText}
              />
              <div className="form-text">
                Expressed in JSON format as a list of{" "}
                <code>{"{min, max}"}</code> objects.
              </div>
              {cellsError && (
                <div className="text-danger small">{cellsError}</div>
              )}
            </div>
          </div>
        </fieldset>
      )}

      {activeTab === "range" && (
        <fieldset disabled={disabled}>
          <div>
            {rangeEditor}
            {readonlyCountField(
              `${idPrefix}-range-count`,
              "Number of cells to generate:",
              rangeCount,
              "Generates cells from a sliding window.",
            )}
            <div className="d-grid">
              <button
                className="btn btn-outline-primary"
                disabled={rangeDisabled}
                onClick={handleApplyRange}
                type="button"
              >
                Generate and set cells
              </button>
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function FrameModalForm({
  className,
  defaultSourceGroupId = null,
  defaultSTBoundsMulti = [],
  disabled,
  isOpen = false,
  loadSourceMetadata,
  onSTBoundsMultiChange,
  sourceGroupInputName = "source_group_id",
  sourceGroups,
  sourceLookups,
  stBoundsInputName = "st_bounds_multi",
}: FrameModalFormProps) {
  const idBase = useId().replace(/:/g, "");
  const now = useMemo(() => new Timestamp().toString(), []);
  const wasOpenRef = useRef(isOpen);
  const defaultSTBoundsText = useMemo(
    () => serializePretty(defaultSTBoundsMulti),
    [defaultSTBoundsMulti],
  );
  const defaultTimeRange = useMemo<TimeRangeState>(
    () => ({ start: now, end: now, stride: "1000", size: "1000" }),
    [now],
  );

  const [activeTab, setActiveTab] = useState<MainTab>("data");
  const [activeMeshAxis, setActiveMeshAxis] = useState<AxisKey>("x");
  const [sourceGroupId, setSourceGroupId] = useState<number | null>(
    defaultSourceGroupId,
  );
  const [stBoundsMulti, setStBoundsMulti] =
    useState<readonly PartialSTBounds[]>(defaultSTBoundsMulti);
  const [stBoundsText, setStBoundsText] = useState(defaultSTBoundsText);
  const [stBoundsTextError, setStBoundsTextError] = useState<string | null>(
    null,
  );
  const [selectedLookupName, setSelectedLookupName] = useState("");
  const [refData, setRefData] = useState<readonly SourceDataRecord[]>([]);
  const [loadingSourceData, setLoadingSourceData] = useState(false);
  const [loadSourceDataError, setLoadSourceDataError] = useState<string | null>(
    null,
  );

  const [xCells, setXCells] = useState<readonly CoordCell[]>([]);
  const [yCells, setYCells] = useState<readonly CoordCell[]>([]);
  const [zCells, setZCells] = useState<readonly CoordCell[]>([]);
  const [tCells, setTCells] = useState<readonly TimestampCell[]>([]);

  const [xRange, setXRange] = useState<NumberRangeState>(DEFAULT_NUMBER_RANGE);
  const [yRange, setYRange] = useState<NumberRangeState>(DEFAULT_NUMBER_RANGE);
  const [zRange, setZRange] = useState<NumberRangeState>(DEFAULT_NUMBER_RANGE);
  const [tRange, setTRange] = useState<TimeRangeState>(defaultTimeRange);

  const [enabledAxes, setEnabledAxes] =
    useState<Record<AxisKey, boolean>>(DEFAULT_ENABLED_AXES);

  const xRangeCount = numberAxisCellCount(xRange);
  const yRangeCount = numberAxisCellCount(yRange);
  const zRangeCount = numberAxisCellCount(zRange);
  const tRangeCount = timeAxisCellCount(tRange);
  const showRawBoundsEditor = stBoundsMulti.length <= RAW_BOUNDS_TEXT_LIMIT;
  const stBoundsInputValue = useMemo(
    () => (showRawBoundsEditor ? stBoundsText : JSON.stringify(stBoundsMulti)),
    [showRawBoundsEditor, stBoundsMulti, stBoundsText],
  );
  const selectedLookup = useMemo(
    () =>
      sourceLookups.find((lookup) => lookup.name === selectedLookupName) ??
      null,
    [selectedLookupName, sourceLookups],
  );

  useEffect(() => {
    if (stBoundsMulti.length <= RAW_BOUNDS_TEXT_LIMIT) {
      setStBoundsText(serializePretty(stBoundsMulti));
    } else {
      setStBoundsText("");
    }
    onSTBoundsMultiChange?.(stBoundsMulti);
  }, [onSTBoundsMultiChange, stBoundsMulti]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setActiveTab("data");
      setActiveMeshAxis("x");
      setSourceGroupId(defaultSourceGroupId);
      setStBoundsMulti(defaultSTBoundsMulti);
      setStBoundsText(defaultSTBoundsText);
      setSelectedLookupName("");
      setRefData([]);
      setLoadingSourceData(false);
      setLoadSourceDataError(null);
      setXCells([]);
      setYCells([]);
      setZCells([]);
      setTCells([]);
      setXRange(DEFAULT_NUMBER_RANGE);
      setYRange(DEFAULT_NUMBER_RANGE);
      setZRange(DEFAULT_NUMBER_RANGE);
      setTRange(defaultTimeRange);
      setEnabledAxes(DEFAULT_ENABLED_AXES);
    }

    wasOpenRef.current = isOpen;
  }, [
    defaultSourceGroupId,
    defaultSTBoundsMulti,
    defaultSTBoundsText,
    defaultTimeRange,
    isOpen,
  ]);

  useEffect(() => {
    if (
      selectedLookupName !== "" &&
      !sourceLookups.some((lookup) => lookup.name === selectedLookupName)
    ) {
      setSelectedLookupName("");
    }
  }, [selectedLookupName, sourceLookups]);

  useEffect(() => {
    let cancelled = false;

    if (
      loadSourceMetadata == null ||
      sourceGroupId == null ||
      selectedLookup == null
    ) {
      setRefData([]);
      setLoadingSourceData(false);
      setLoadSourceDataError(null);
      return undefined;
    }

    setLoadingSourceData(true);
    setLoadSourceDataError(null);

    void loadSourceMetadata(selectedLookup, sourceGroupId)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setRefData([...data]);
        setLoadingSourceData(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRefData([]);
        setLoadingSourceData(false);
        setLoadSourceDataError(
          error instanceof Error
            ? error.message
            : "Failed to load source metadata.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [loadSourceMetadata, selectedLookup, sourceGroupId]);

  const gridCells = useMemo(
    () => ({
      x: enabledAxes.x ? xCells : [{ min: null, max: null }],
      y: enabledAxes.y ? yCells : [{ min: null, max: null }],
      z: enabledAxes.z ? zCells : [{ min: null, max: null }],
      t: enabledAxes.t ? tCells : [{ min: null, max: null }],
    }),
    [enabledAxes, tCells, xCells, yCells, zCells],
  );

  const generateCount = useMemo(
    () => ST_AXES.reduce((count, key) => count * gridCells[key].length, 1),
    [gridCells],
  );

  function handleSourceGroupChange(value: string) {
    setSourceGroupId(value === "" ? null : Number.parseInt(value, 10));
  }

  function handleRawBoundsBlur() {
    const parsed = parseSTBoundsMulti(stBoundsText);
    if (parsed == null) {
      setStBoundsTextError(
        "Enter a valid JSON list of spatiotemporal boundaries.",
      );
      return;
    }
    setStBoundsTextError(null);
    setStBoundsMulti(parsed);
    setActiveTab("data");
  }

  function handleGenerateFromData() {
    setStBoundsMulti(
      refData.map((item) =>
        restrictSTBoundsToAxes(item.st_bounds, enabledAxes),
      ),
    );
    setActiveTab("data");
  }

  function renderAxisSettings() {
    return (
      <fieldset disabled={disabled}>
        <label className="form-label">Axis Settings:</label>
        <div className="border rounded p-2 mb-3">
          {ST_AXES.map((axis) => (
            <div className="form-check form-check-inline" key={axis}>
              <input
                checked={enabledAxes[axis]}
                className="form-check-input"
                id={`${idBase}-axis-enabled-${axis}`}
                onChange={(event) =>
                  setEnabledAxes({
                    ...enabledAxes,
                    [axis]: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <label
                className="form-check-label"
                htmlFor={`${idBase}-axis-enabled-${axis}`}
              >
                Enable {axis.toUpperCase()} Axis
              </label>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }

  function handleGenerateSTBounds() {
    const next = gridCells.x.flatMap((xc) =>
      gridCells.y.flatMap((yc) =>
        gridCells.z.flatMap((zc) =>
          gridCells.t.map((tc) =>
            PartialSTBounds.create({
              min_coords: OptionalVector3Data.create({
                x: xc.min,
                y: yc.min,
                z: zc.min,
              }).toDecimalData(),
              max_coords: OptionalVector3Data.create({
                x: xc.max,
                y: yc.max,
                z: zc.max,
              }).toDecimalData(),
              min_timestamp: tc.min,
              max_timestamp: tc.max,
            }),
          ),
        ),
      ),
    );

    setStBoundsMulti(next);
    setActiveTab("data");
  }

  function renderNumberRangeEditor(
    idPrefix: string,
    range: NumberRangeState,
    setRange: (value: NumberRangeState) => void,
  ) {
    return (
      <>
        <div className="row">
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-start`}>
                Start Value (Inclusive):
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-start`}
                onChange={(event) =>
                  setRange({
                    ...range,
                    start: event.target.value,
                  })
                }
                type="number"
                value={range.start}
              />
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-end`}>
                End Value (Inclusive):
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-end`}
                onChange={(event) =>
                  setRange({
                    ...range,
                    end: event.target.value,
                  })
                }
                type="number"
                value={range.end}
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-stride`}>
                Cell Stride:
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-stride`}
                min={0}
                onChange={(event) =>
                  setRange({
                    ...range,
                    stride: event.target.value,
                  })
                }
                type="number"
                value={range.stride}
              />
              <div className="form-text">This must be a positive number.</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-size`}>
                Cell Size:
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-size`}
                min={0}
                onChange={(event) =>
                  setRange({
                    ...range,
                    size: event.target.value,
                  })
                }
                type="number"
                value={range.size}
              />
              <div className="form-text">This must be a positive number.</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderTimeRangeEditor(
    idPrefix: string,
    range: TimeRangeState,
    setRange: (value: TimeRangeState) => void,
  ) {
    return (
      <>
        <div className="row">
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-start`}>
                Start Value (Inclusive):
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-start`}
                onChange={(event) =>
                  setRange({
                    ...range,
                    start: event.target.value,
                  })
                }
                type="text"
                value={range.start}
              />
              <div className="form-text">
                Expressed in ISO-8601 format, for example <code>{now}</code>.
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-end`}>
                End Value (Inclusive):
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-end`}
                onChange={(event) =>
                  setRange({
                    ...range,
                    end: event.target.value,
                  })
                }
                type="text"
                value={range.end}
              />
              <div className="form-text">
                Expressed in ISO-8601 format, for example <code>{now}</code>.
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-stride`}>
                Cell Stride:
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-stride`}
                onChange={(event) =>
                  setRange({
                    ...range,
                    stride: event.target.value,
                  })
                }
                type="text"
                value={range.stride}
              />
              <div className="form-text">
                The interval is measured in milliseconds (ms).
              </div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-size`}>
                Cell Size:
              </label>
              <input
                className="form-control"
                id={`${idPrefix}-size`}
                min={0}
                onChange={(event) =>
                  setRange({
                    ...range,
                    size: event.target.value,
                  })
                }
                type="number"
                value={range.size}
              />
              <div className="form-text">This must be a positive number.</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={cn("container-fluid p-2", className)}>
      <fieldset disabled={disabled}>
        <div className="mb-3">
          <label className="form-label" htmlFor={`${idBase}-source-group`}>
            Source Group:
          </label>
          <select
            className="form-select"
            id={`${idBase}-source-group`}
            name={sourceGroupInputName}
            onChange={(event) => handleSourceGroupChange(event.target.value)}
            value={sourceGroupId == null ? "" : `${sourceGroupId}`}
          >
            <option value="">Select a source group...</option>
            {sourceGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <ul className="nav nav-tabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={cn("nav-link", activeTab === "data" && "active")}
            onClick={() => setActiveTab("data")}
            type="button"
          >
            List of spatiotemporal boundaries
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={cn("nav-link", activeTab === "sourceData" && "active")}
            onClick={() => setActiveTab("sourceData")}
            type="button"
          >
            Generate from data
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={cn("nav-link", activeTab === "meshgrid" && "active")}
            onClick={() => setActiveTab("meshgrid")}
            type="button"
          >
            Generate from meshgrid
          </button>
        </li>
      </ul>

      <div className="border border-top-0 p-3">
        {activeTab === "data" && (
          <fieldset disabled={disabled}>
            <div>
              <input
                name={stBoundsInputName}
                type="hidden"
                value={stBoundsInputValue}
              />
              {readonlyCountField(
                `${idBase}-frame-count`,
                "Number of Spatiotemporal Boundaries:",
                stBoundsMulti.length,
              )}
              {showRawBoundsEditor ? (
                <div>
                  <label
                    className="form-label"
                    htmlFor={`${idBase}-st-bounds-text`}
                  >
                    Raw Data:
                  </label>
                  <textarea
                    className="form-control"
                    id={`${idBase}-st-bounds-text`}
                    onBlur={handleRawBoundsBlur}
                    onChange={(event) => setStBoundsText(event.target.value)}
                    rows={12}
                    style={{ fontFamily: "monospace" }}
                    value={stBoundsText}
                  />
                  <div className="form-text">
                    Expressed in JSON format as a list of partial spatiotemporal
                    bounds.
                  </div>
                  {stBoundsTextError && (
                    <div className="text-danger small">{stBoundsTextError}</div>
                  )}
                </div>
              ) : (
                <div className="text-body-secondary small">
                  Raw JSON is hidden for large generated batches. The compact
                  payload will be submitted with the form.
                </div>
              )}
            </div>
          </fieldset>
        )}

        {activeTab === "sourceData" && (
          <fieldset disabled={disabled}>
            <div className="container-fluid p-0">
              <div className="mb-3">
                <label
                  className="form-label"
                  htmlFor={`${idBase}-source-data-lookup`}
                >
                  Reference data type:
                </label>
                <select
                  className="form-select"
                  disabled={
                    loadSourceMetadata == null || sourceLookups.length === 0
                  }
                  id={`${idBase}-source-data-lookup`}
                  onChange={(event) =>
                    setSelectedLookupName(event.target.value)
                  }
                  value={selectedLookupName}
                >
                  <option value="">Select a data type...</option>
                  {sourceLookups.map((lookup) => (
                    <option key={lookup.name} value={lookup.name}>
                      {typeof lookup.title === "string"
                        ? lookup.title
                        : lookup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                {selectedLookup != null && sourceGroupId == null && (
                  <div className="text-body-secondary small">
                    Select a source group to load reference data.
                  </div>
                )}
                {loadingSourceData && (
                  <div className="text-body-secondary small">
                    Loading reference data...
                  </div>
                )}
                {!loadingSourceData && loadSourceDataError && (
                  <div className="text-danger small">{loadSourceDataError}</div>
                )}
                {!loadingSourceData &&
                  sourceGroupId != null &&
                  !loadSourceDataError && (
                    <SourceMetadataTable data={refData} />
                  )}
              </div>

              {renderAxisSettings()}

              {readonlyCountField(
                `${idBase}-source-data-count`,
                "Number of spatiotemporal boundaries to generate:",
                refData.length,
                "Generates one spatiotemporal boundary per source data instance.",
              )}

              <div className="d-grid">
                <button
                  className="btn btn-outline-primary"
                  disabled={refData.length === 0}
                  onClick={handleGenerateFromData}
                  type="button"
                >
                  Generate and set spatiotemporal boundaries
                </button>
              </div>
            </div>
          </fieldset>
        )}

        {activeTab === "meshgrid" && (
          <div className="container-fluid p-0">
            <label className="form-label">Axis Cells:</label>
            <div className="border rounded p-2 mb-3">
              <ul className="nav nav-tabs mb-3" role="tablist">
                {ST_AXES.map((axis) => {
                  const count =
                    axis === "x"
                      ? xCells.length
                      : axis === "y"
                        ? yCells.length
                        : axis === "z"
                          ? zCells.length
                          : tCells.length;

                  return (
                    <li className="nav-item" key={axis} role="presentation">
                      <button
                        className={cn(
                          "nav-link",
                          activeMeshAxis === axis && "active",
                        )}
                        onClick={() => setActiveMeshAxis(axis)}
                        type="button"
                      >
                        {axis.toUpperCase()} Axis{" "}
                        <span
                          className={cn(
                            "badge",
                            enabledAxes[axis]
                              ? "text-bg-primary"
                              : "text-bg-secondary",
                          )}
                        >
                          {enabledAxes[axis] ? count : "-"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {activeMeshAxis === "x" && (
                <AxisEditorShell
                  cells={xCells}
                  disabled={disabled}
                  getRangeCells={() => buildNumberAxisCells(xRange)}
                  idPrefix={`${idBase}-axis-x`}
                  onCellsChange={setXCells}
                  parseCellsText={parseCoordCells}
                  rangeCount={xRangeCount}
                  rangeDisabled={
                    xRangeCount === 0 || xRangeCount > MAX_AXIS_CELLS
                  }
                  rangeEditor={renderNumberRangeEditor(
                    `${idBase}-axis-x`,
                    xRange,
                    setXRange,
                  )}
                />
              )}

              {activeMeshAxis === "y" && (
                <AxisEditorShell
                  cells={yCells}
                  disabled={disabled}
                  getRangeCells={() => buildNumberAxisCells(yRange)}
                  idPrefix={`${idBase}-axis-y`}
                  onCellsChange={setYCells}
                  parseCellsText={parseCoordCells}
                  rangeCount={yRangeCount}
                  rangeDisabled={
                    yRangeCount === 0 || yRangeCount > MAX_AXIS_CELLS
                  }
                  rangeEditor={renderNumberRangeEditor(
                    `${idBase}-axis-y`,
                    yRange,
                    setYRange,
                  )}
                />
              )}

              {activeMeshAxis === "z" && (
                <AxisEditorShell
                  cells={zCells}
                  disabled={disabled}
                  getRangeCells={() => buildNumberAxisCells(zRange)}
                  idPrefix={`${idBase}-axis-z`}
                  onCellsChange={setZCells}
                  parseCellsText={parseCoordCells}
                  rangeCount={zRangeCount}
                  rangeDisabled={
                    zRangeCount === 0 || zRangeCount > MAX_AXIS_CELLS
                  }
                  rangeEditor={renderNumberRangeEditor(
                    `${idBase}-axis-z`,
                    zRange,
                    setZRange,
                  )}
                />
              )}

              {activeMeshAxis === "t" && (
                <AxisEditorShell
                  cells={tCells}
                  disabled={disabled}
                  getRangeCells={() => buildTimeAxisCells(tRange)}
                  idPrefix={`${idBase}-axis-t`}
                  onCellsChange={setTCells}
                  parseCellsText={parseTimestampCells}
                  rangeCount={tRangeCount}
                  rangeDisabled={
                    tRangeCount === 0 || tRangeCount > MAX_AXIS_CELLS
                  }
                  rangeEditor={renderTimeRangeEditor(
                    `${idBase}-axis-t`,
                    tRange,
                    setTRange,
                  )}
                />
              )}
            </div>

            {renderAxisSettings()}

            <fieldset disabled={disabled}>
              {readonlyCountField(
                `${idBase}-meshgrid-count`,
                "Number of spatiotemporal boundaries to generate:",
                generateCount,
                "Generates spatiotemporal boundaries by performing a Cartesian product between the cells along each axis.",
              )}

              <div className="d-grid">
                <button
                  className="btn btn-outline-primary"
                  disabled={generateCount === 0}
                  onClick={handleGenerateSTBounds}
                  type="button"
                >
                  Generate and set spatiotemporal boundaries
                </button>
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}

export default FrameModalForm;
