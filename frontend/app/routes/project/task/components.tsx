import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { OptionalVector3Data, PartialSTBounds } from '../../../../lib/common/lib/spatial';
import { Timestamp } from '../../../../lib/common/lib/utils';

type AxisKey = 'x' | 'y' | 'z' | 't';
type AxisTab = 'cells' | 'data' | 'range';
type MainTab = 'data' | 'meshgrid';

type CoordCell = {
  min: number | null;
  max: number | null;
};

type TimestampCell = {
  min: Timestamp | null;
  max: Timestamp | null;
};

type SourceGroupOption = {
  id: number;
  name: string;
  description?: string;
};

export type SourceLookupData = {
  name: string;
  [key: string]: unknown;
};

export type SourceDataRecord = {
  id: number;
  st_bounds: PartialSTBounds;
  group?: {
    id: number;
    name: string;
  } | null;
};

export type SourceMetadataLoader = (
  sourceLookup: SourceLookupData,
  sourceGroupId: number,
) => Promise<ReadonlyArray<SourceDataRecord>>;

type NumberRangeState = {
  start: string;
  end: string;
  stride: string;
  size: string;
};

type TimeRangeState = {
  start: string;
  end: string;
  stride: string;
  size: string;
};

type AxisEditorShellProps<TCell> = {
  idPrefix: string;
  cells: ReadonlyArray<TCell>;
  disabled?: boolean;
  getCellFromBounds: (stBounds: PartialSTBounds) => TCell;
  getRangeCells: () => ReadonlyArray<TCell>;
  parseCellsText: (text: string) => ReadonlyArray<TCell>;
  rangeCount: number;
  rangeDisabled: boolean;
  rangeEditor: React.ReactNode;
  sourceGroupId: number | null;
  sourceLookups: ReadonlyArray<SourceLookupData>;
  loadSourceMetadata?: SourceMetadataLoader;
  onCellsChange: (cells: ReadonlyArray<TCell>) => void;
};

export type FrameModalFormProps = {
  className?: string;
  defaultSourceGroupId?: number | null;
  defaultSTBoundsMulti?: ReadonlyArray<PartialSTBounds>;
  disabled?: boolean;
  isOpen?: boolean;
  loadSourceMetadata?: SourceMetadataLoader;
  onSTBoundsMultiChange?: (stBoundsMulti: ReadonlyArray<PartialSTBounds>) => void;
  sourceGroupInputName?: string;
  sourceGroups: ReadonlyArray<SourceGroupOption>;
  sourceLookups: ReadonlyArray<SourceLookupData>;
  stBoundsInputName?: string;
};

const ST_AXES: ReadonlyArray<AxisKey> = ['x', 'y', 'z', 't'];
const DEFAULT_NUMBER_RANGE: NumberRangeState = { start: '0', end: '0', stride: '1', size: '1' };
const DEFAULT_ENABLED_AXES: Record<AxisKey, boolean> = {
  x: true,
  y: true,
  z: true,
  t: true,
};

const coordCellSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
});

const timestampCellSchema = z.object({
  min: Timestamp.SCHEMA.nullable(),
  max: Timestamp.SCHEMA.nullable(),
});

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function serializePretty(value: unknown) {
  return JSON.stringify(value, undefined, 2);
}

function parseJsonArray(text: string): ReadonlyArray<unknown> {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function parseCoordCells(text: string): ReadonlyArray<CoordCell> {
  const result = z.array(coordCellSchema).safeParse(parseJsonArray(text));
  return result.success ? result.data : [];
}

function parseTimestampCells(text: string): ReadonlyArray<TimestampCell> {
  const result = z.array(timestampCellSchema).safeParse(parseJsonArray(text));
  return result.success
    ? result.data.map((cell) => ({
        min: cell.min ?? null,
        max: cell.max ?? null,
      }))
    : [];
}

function parseSTBoundsMulti(text: string): ReadonlyArray<PartialSTBounds> {
  const result = z.array(PartialSTBounds.SCHEMA).safeParse(parseJsonArray(text));
  return result.success ? result.data : [];
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

function cellStartRangeLength(params: { start: number; end: number; stride: number; size: number }) {
  return Math.max(0, Math.ceil((params.end - params.size + params.stride - params.start) / params.stride));
}

function cellStartRangeInclusive(params: { start: number; end: number; stride: number; size: number }) {
  const length = cellStartRangeLength(params);
  if (length === 0) {
    return [] as number[];
  }

  return Array.from({ length }, (_value, index) => params.start + index * params.stride);
}

function buildNumberAxisCells(range: NumberRangeState): ReadonlyArray<CoordCell> {
  const start = parseNumber(range.start);
  const end = parseNumber(range.end);
  const stride = parsePositiveNumber(range.stride);
  const size = parsePositiveNumber(range.size);

  if (start == null || end == null || stride == null || size == null) {
    return [];
  }

  return cellStartRangeInclusive({ start, end, stride, size })
    .map((cellStart) => ({ min: cellStart, max: cellStart + size }));
}

function buildTimeAxisCells(range: TimeRangeState): ReadonlyArray<TimestampCell> {
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

function formatNullableNumber(value: number | null) {
  return value == null ? 'null' : `${value}`;
}

function formatNullableTimestamp(value: Timestamp | null) {
  return value == null ? 'null' : value.toString();
}

function formatSourceBounds(stBounds: PartialSTBounds) {
  const spatial = stBounds.getSpatialBounds();
  const parts = [
    `x: [${formatNullableNumber(spatial.xBounds.min)}, ${formatNullableNumber(spatial.xBounds.max)}]`,
    `y: [${formatNullableNumber(spatial.yBounds.min)}, ${formatNullableNumber(spatial.yBounds.max)}]`,
    `z: [${formatNullableNumber(spatial.zBounds.min)}, ${formatNullableNumber(spatial.zBounds.max)}]`,
    `t: [${formatNullableTimestamp(stBounds.min_timestamp)}, ${formatNullableTimestamp(stBounds.max_timestamp)}]`,
  ];

  return parts.join(' | ');
}

function readonlyCountField(id: string, label: string, value: number, description?: string) {
  return (
    <div className="mb-3">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input className="form-control" id={id} disabled type="number" value={value} />
      {description && <div className="form-text">{description}</div>}
    </div>
  );
}

function SourceMetadataTable({ data }: { data: ReadonlyArray<SourceDataRecord> }) {
  if (data.length === 0) {
    return <div className="text-body-secondary small">No reference data loaded.</div>;
  }

  return (
    <div className="table-responsive border rounded" style={{ maxHeight: 256 }}>
      <table className="table table-sm align-middle mb-0">
        <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Group</th>
            <th scope="col">Bounds</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.group?.name ?? '-'}</td>
              <td className="small" style={{ fontFamily: 'monospace' }}>{formatSourceBounds(item.st_bounds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AxisEditorShell<TCell>({
  idPrefix,
  cells,
  disabled,
  getCellFromBounds,
  getRangeCells,
  loadSourceMetadata,
  onCellsChange,
  parseCellsText,
  rangeCount,
  rangeDisabled,
  rangeEditor,
  sourceGroupId,
  sourceLookups,
}: AxisEditorShellProps<TCell>) {
  const [activeTab, setActiveTab] = useState<AxisTab>('cells');
  const [cellsText, setCellsText] = useState(() => serializePretty(cells));
  const [selectedLookupName, setSelectedLookupName] = useState('');
  const [refData, setRefData] = useState<ReadonlyArray<SourceDataRecord>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedLookup = useMemo(
    () => sourceLookups.find((lookup) => lookup.name === selectedLookupName) ?? null,
    [selectedLookupName, sourceLookups],
  );

  useEffect(() => {
    setCellsText(serializePretty(cells));
  }, [cells]);

  useEffect(() => {
    if (selectedLookupName !== '' && selectedLookup == null) {
      setSelectedLookupName('');
    }
  }, [selectedLookup, selectedLookupName]);

  useEffect(() => {
    let cancelled = false;

    if (loadSourceMetadata == null || selectedLookup == null || sourceGroupId == null) {
      setRefData([]);
      setLoading(false);
      setLoadError(null);
      return undefined;
    }

    setLoading(true);
    setLoadError(null);

    void loadSourceMetadata(selectedLookup, sourceGroupId)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setRefData([...data]);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRefData([]);
        setLoading(false);
        setLoadError(error instanceof Error ? error.message : 'Failed to load source metadata.');
      });

    return () => {
      cancelled = true;
    };
  }, [loadSourceMetadata, selectedLookup, sourceGroupId]);

  function handleApplyData() {
    onCellsChange(refData.map((item) => getCellFromBounds(item.st_bounds)));
    setActiveTab('cells');
  }

  function handleApplyRange() {
    onCellsChange(getRangeCells());
    setActiveTab('cells');
  }

  function handleCellsBlur() {
    onCellsChange(parseCellsText(cellsText));
    setActiveTab('cells');
  }

  return (
    <div className="border rounded p-2">
      <ul className="nav nav-tabs mb-3" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={cn('nav-link', activeTab === 'cells' && 'active')}
            onClick={() => setActiveTab('cells')}
            type="button"
          >
            List of cells <span className="badge text-bg-primary ms-1">{cells.length}</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={cn('nav-link', activeTab === 'data' && 'active')}
            onClick={() => setActiveTab('data')}
            type="button"
          >
            Generate from data
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={cn('nav-link', activeTab === 'range' && 'active')}
            onClick={() => setActiveTab('range')}
            type="button"
          >
            Generate from range
          </button>
        </li>
      </ul>

      {activeTab === 'cells' && (
        <fieldset disabled={disabled}>
          <div>
            {readonlyCountField(`${idPrefix}-cells-count`, 'Number of Cells:', cells.length)}
            <div>
              <label className="form-label" htmlFor={`${idPrefix}-cells-text`}>Raw Data:</label>
              <textarea
                className="form-control"
                id={`${idPrefix}-cells-text`}
                onBlur={handleCellsBlur}
                onChange={(event) => setCellsText(event.target.value)}
                rows={10}
                style={{ fontFamily: 'monospace' }}
                value={cellsText}
              />
              <div className="form-text">Expressed in JSON format as a list of <code>{'{min, max}'}</code> objects.</div>
            </div>
          </div>
        </fieldset>
      )}

      {activeTab === 'data' && (
        <fieldset disabled={disabled}>
          <div className="container-fluid p-0">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-lookup`}>Reference data type:</label>
              <select
                className="form-select"
                disabled={loadSourceMetadata == null || sourceGroupId == null}
                id={`${idPrefix}-lookup`}
                onChange={(event) => setSelectedLookupName(event.target.value)}
                value={selectedLookupName}
              >
                <option value="">Select a data type...</option>
                {sourceLookups.map((lookup) => (
                  <option key={lookup.name} value={lookup.name}>{lookup.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              {loading && <div className="text-body-secondary small">Loading reference data...</div>}
              {!loading && loadError && <div className="text-danger small">{loadError}</div>}
              {!loading && !loadError && <SourceMetadataTable data={refData} />}
            </div>

            {readonlyCountField(
              `${idPrefix}-data-count`,
              'Number of cells to generate:',
              refData.length,
              'Generates one cell per source data instance.',
            )}

            <div className="d-grid">
              <button
                className="btn btn-outline-primary"
                disabled={refData.length === 0}
                onClick={handleApplyData}
                type="button"
              >
                Generate and set cells
              </button>
            </div>
          </div>
        </fieldset>
      )}

      {activeTab === 'range' && (
        <fieldset disabled={disabled}>
          <div>
            {rangeEditor}
            {readonlyCountField(
              `${idPrefix}-range-count`,
              'Number of cells to generate:',
              rangeCount,
              'Generates cells from a sliding window.',
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
  sourceGroupInputName = 'source_group_id',
  sourceGroups,
  sourceLookups,
  stBoundsInputName = 'st_bounds_multi',
}: FrameModalFormProps) {
  const idBase = useId().replace(/:/g, '');
  const now = useMemo(() => new Timestamp().toString(), []);
  const wasOpenRef = useRef(isOpen);
  const defaultSTBoundsText = useMemo(() => serializePretty(defaultSTBoundsMulti), [defaultSTBoundsMulti]);
  const defaultTimeRange = useMemo<TimeRangeState>(
    () => ({ start: now, end: now, stride: '1000', size: '1000' }),
    [now],
  );

  const [activeTab, setActiveTab] = useState<MainTab>('data');
  const [activeMeshAxis, setActiveMeshAxis] = useState<AxisKey>('x');
  const [sourceGroupId, setSourceGroupId] = useState<number | null>(defaultSourceGroupId);
  const [stBoundsMulti, setStBoundsMulti] = useState<ReadonlyArray<PartialSTBounds>>(defaultSTBoundsMulti);
  const [stBoundsText, setStBoundsText] = useState(defaultSTBoundsText);

  const [xCells, setXCells] = useState<ReadonlyArray<CoordCell>>([]);
  const [yCells, setYCells] = useState<ReadonlyArray<CoordCell>>([]);
  const [zCells, setZCells] = useState<ReadonlyArray<CoordCell>>([]);
  const [tCells, setTCells] = useState<ReadonlyArray<TimestampCell>>([]);

  const [xRange, setXRange] = useState<NumberRangeState>(DEFAULT_NUMBER_RANGE);
  const [yRange, setYRange] = useState<NumberRangeState>(DEFAULT_NUMBER_RANGE);
  const [zRange, setZRange] = useState<NumberRangeState>(DEFAULT_NUMBER_RANGE);
  const [tRange, setTRange] = useState<TimeRangeState>(defaultTimeRange);

  const [enabledAxes, setEnabledAxes] = useState<Record<AxisKey, boolean>>(DEFAULT_ENABLED_AXES);

  const xRangeCells = useMemo(() => buildNumberAxisCells(xRange), [xRange]);
  const yRangeCells = useMemo(() => buildNumberAxisCells(yRange), [yRange]);
  const zRangeCells = useMemo(() => buildNumberAxisCells(zRange), [zRange]);
  const tRangeCells = useMemo(() => buildTimeAxisCells(tRange), [tRange]);

  useEffect(() => {
    setStBoundsText(serializePretty(stBoundsMulti));
    onSTBoundsMultiChange?.(stBoundsMulti);
  }, [onSTBoundsMultiChange, stBoundsMulti]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setActiveTab('data');
      setActiveMeshAxis('x');
      setSourceGroupId(defaultSourceGroupId);
      setStBoundsMulti(defaultSTBoundsMulti);
      setStBoundsText(defaultSTBoundsText);
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
  }, [defaultSourceGroupId, defaultSTBoundsMulti, defaultSTBoundsText, defaultTimeRange, isOpen]);

  const gridCells = useMemo(() => ({
    x: enabledAxes.x ? xCells : [{ min: null, max: null }],
    y: enabledAxes.y ? yCells : [{ min: null, max: null }],
    z: enabledAxes.z ? zCells : [{ min: null, max: null }],
    t: enabledAxes.t ? tCells : [{ min: null, max: null }],
  }), [enabledAxes, tCells, xCells, yCells, zCells]);

  const generateCount = useMemo(
    () => ST_AXES.reduce((count, key) => count * gridCells[key].length, 1),
    [gridCells],
  );

  function handleSourceGroupChange(value: string) {
    setSourceGroupId(value === '' ? null : Number.parseInt(value, 10));
  }

  function handleRawBoundsBlur() {
    setStBoundsMulti(parseSTBoundsMulti(stBoundsText));
    setActiveTab('data');
  }

  function handleGenerateSTBounds() {
    const next = gridCells.x.flatMap((xc) => gridCells.y.flatMap((yc) => gridCells.z.flatMap((zc) => gridCells.t
      .map((tc) => PartialSTBounds.create({
        min_coords: OptionalVector3Data.create({ x: xc.min, y: yc.min, z: zc.min }).toDecimalData(),
        max_coords: OptionalVector3Data.create({ x: xc.max, y: yc.max, z: zc.max }).toDecimalData(),
        min_timestamp: tc.min,
        max_timestamp: tc.max,
      })))));

    setStBoundsMulti(next);
    setActiveTab('data');
  }

  function renderNumberRangeEditor(idPrefix: string, range: NumberRangeState, setRange: (value: NumberRangeState) => void) {
    return (
      <>
        <div className="row">
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-start`}>Start Value (Inclusive):</label>
              <input
                className="form-control"
                id={`${idPrefix}-start`}
                onChange={(event) => setRange({ ...range, start: event.target.value })}
                type="number"
                value={range.start}
              />
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-end`}>End Value (Inclusive):</label>
              <input
                className="form-control"
                id={`${idPrefix}-end`}
                onChange={(event) => setRange({ ...range, end: event.target.value })}
                type="number"
                value={range.end}
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-stride`}>Cell Stride:</label>
              <input
                className="form-control"
                id={`${idPrefix}-stride`}
                min={0}
                onChange={(event) => setRange({ ...range, stride: event.target.value })}
                type="number"
                value={range.stride}
              />
              <div className="form-text">This must be a positive number.</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-size`}>Cell Size:</label>
              <input
                className="form-control"
                id={`${idPrefix}-size`}
                min={0}
                onChange={(event) => setRange({ ...range, size: event.target.value })}
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

  function renderTimeRangeEditor(idPrefix: string, range: TimeRangeState, setRange: (value: TimeRangeState) => void) {
    return (
      <>
        <div className="row">
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-start`}>Start Value (Inclusive):</label>
              <input
                className="form-control"
                id={`${idPrefix}-start`}
                onChange={(event) => setRange({ ...range, start: event.target.value })}
                type="text"
                value={range.start}
              />
              <div className="form-text">Expressed in ISO-8601 format, for example <code>{now}</code>.</div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-end`}>End Value (Inclusive):</label>
              <input
                className="form-control"
                id={`${idPrefix}-end`}
                onChange={(event) => setRange({ ...range, end: event.target.value })}
                type="text"
                value={range.end}
              />
              <div className="form-text">Expressed in ISO-8601 format, for example <code>{now}</code>.</div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-stride`}>Cell Stride:</label>
              <input
                className="form-control"
                id={`${idPrefix}-stride`}
                onChange={(event) => setRange({ ...range, stride: event.target.value })}
                type="text"
                value={range.stride}
              />
              <div className="form-text">The interval is measured in milliseconds (ms).</div>
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="mb-3">
              <label className="form-label" htmlFor={`${idPrefix}-size`}>Cell Size:</label>
              <input
                className="form-control"
                id={`${idPrefix}-size`}
                min={0}
                onChange={(event) => setRange({ ...range, size: event.target.value })}
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
    <div className={cn('container-fluid p-2', className)}>
      <fieldset disabled={disabled}>
        <div className="mb-3">
          <label className="form-label" htmlFor={`${idBase}-source-group`}>Source Group:</label>
          <select
            className="form-select"
            id={`${idBase}-source-group`}
            name={sourceGroupInputName}
            onChange={(event) => handleSourceGroupChange(event.target.value)}
            value={sourceGroupId == null ? '' : `${sourceGroupId}`}
          >
            <option value="">Select a source group...</option>
            {sourceGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
      </fieldset>

      <ul className="nav nav-tabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={cn('nav-link', activeTab === 'data' && 'active')}
            onClick={() => setActiveTab('data')}
            type="button"
          >
            List of spatiotemporal boundaries
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={cn('nav-link', activeTab === 'meshgrid' && 'active')}
            onClick={() => setActiveTab('meshgrid')}
            type="button"
          >
            Generate from meshgrid
          </button>
        </li>
      </ul>

      <div className="border border-top-0 p-3">
        {activeTab === 'data' && (
          <fieldset disabled={disabled}>
            <div>
              {readonlyCountField(`${idBase}-frame-count`, 'Number of Spatiotemporal Boundaries:', stBoundsMulti.length)}
              <div>
                <label className="form-label" htmlFor={`${idBase}-st-bounds-text`}>Raw Data:</label>
                <textarea
                  className="form-control"
                  id={`${idBase}-st-bounds-text`}
                  name={stBoundsInputName}
                  onBlur={handleRawBoundsBlur}
                  onChange={(event) => setStBoundsText(event.target.value)}
                  rows={12}
                  style={{ fontFamily: 'monospace' }}
                  value={stBoundsText}
                />
                <div className="form-text">Expressed in JSON format as a list of partial spatiotemporal bounds.</div>
              </div>
            </div>
          </fieldset>
        )}

        {activeTab === 'meshgrid' && (
          <div className="container-fluid p-0">
            <label className="form-label">Axis Cells:</label>
            <div className="border rounded p-2 mb-3">
              <ul className="nav nav-tabs mb-3" role="tablist">
                {ST_AXES.map((axis) => {
                  const count = axis === 'x'
                    ? xCells.length
                    : axis === 'y'
                      ? yCells.length
                      : axis === 'z'
                        ? zCells.length
                        : tCells.length;

                  return (
                    <li className="nav-item" key={axis} role="presentation">
                      <button
                        className={cn('nav-link', activeMeshAxis === axis && 'active')}
                        onClick={() => setActiveMeshAxis(axis)}
                        type="button"
                      >
                        {axis.toUpperCase()} Axis{' '}
                        <span className={cn('badge', enabledAxes[axis] ? 'text-bg-primary' : 'text-bg-secondary')}>
                          {enabledAxes[axis] ? count : '-'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {activeMeshAxis === 'x' && (
                <AxisEditorShell
                  cells={xCells}
                  disabled={disabled}
                  getCellFromBounds={(stBounds) => stBounds.getSpatialBounds().xBounds}
                  getRangeCells={() => xRangeCells}
                  idPrefix={`${idBase}-axis-x`}
                  loadSourceMetadata={loadSourceMetadata}
                  onCellsChange={setXCells}
                  parseCellsText={parseCoordCells}
                  rangeCount={xRangeCells.length}
                  rangeDisabled={xRangeCells.length === 0}
                  rangeEditor={renderNumberRangeEditor(`${idBase}-axis-x`, xRange, setXRange)}
                  sourceGroupId={sourceGroupId}
                  sourceLookups={sourceLookups}
                />
              )}

              {activeMeshAxis === 'y' && (
                <AxisEditorShell
                  cells={yCells}
                  disabled={disabled}
                  getCellFromBounds={(stBounds) => stBounds.getSpatialBounds().yBounds}
                  getRangeCells={() => yRangeCells}
                  idPrefix={`${idBase}-axis-y`}
                  loadSourceMetadata={loadSourceMetadata}
                  onCellsChange={setYCells}
                  parseCellsText={parseCoordCells}
                  rangeCount={yRangeCells.length}
                  rangeDisabled={yRangeCells.length === 0}
                  rangeEditor={renderNumberRangeEditor(`${idBase}-axis-y`, yRange, setYRange)}
                  sourceGroupId={sourceGroupId}
                  sourceLookups={sourceLookups}
                />
              )}

              {activeMeshAxis === 'z' && (
                <AxisEditorShell
                  cells={zCells}
                  disabled={disabled}
                  getCellFromBounds={(stBounds) => stBounds.getSpatialBounds().zBounds}
                  getRangeCells={() => zRangeCells}
                  idPrefix={`${idBase}-axis-z`}
                  loadSourceMetadata={loadSourceMetadata}
                  onCellsChange={setZCells}
                  parseCellsText={parseCoordCells}
                  rangeCount={zRangeCells.length}
                  rangeDisabled={zRangeCells.length === 0}
                  rangeEditor={renderNumberRangeEditor(`${idBase}-axis-z`, zRange, setZRange)}
                  sourceGroupId={sourceGroupId}
                  sourceLookups={sourceLookups}
                />
              )}

              {activeMeshAxis === 't' && (
                <AxisEditorShell
                  cells={tCells}
                  disabled={disabled}
                  getCellFromBounds={(stBounds) => ({
                    min: stBounds.min_timestamp,
                    max: stBounds.max_timestamp,
                  })}
                  getRangeCells={() => tRangeCells}
                  idPrefix={`${idBase}-axis-t`}
                  loadSourceMetadata={loadSourceMetadata}
                  onCellsChange={setTCells}
                  parseCellsText={parseTimestampCells}
                  rangeCount={tRangeCells.length}
                  rangeDisabled={tRangeCells.length === 0}
                  rangeEditor={renderTimeRangeEditor(`${idBase}-axis-t`, tRange, setTRange)}
                  sourceGroupId={sourceGroupId}
                  sourceLookups={sourceLookups}
                />
              )}
            </div>

            <fieldset disabled={disabled}>
              <label className="form-label">Axis Settings:</label>
              <div className="border rounded p-2 mb-3">
                {ST_AXES.map((axis) => (
                  <div className="form-check form-check-inline" key={axis}>
                    <input
                      checked={enabledAxes[axis]}
                      className="form-check-input"
                      id={`${idBase}-axis-enabled-${axis}`}
                      onChange={(event) => setEnabledAxes({
                        ...enabledAxes,
                        [axis]: event.target.checked,
                      })}
                      type="checkbox"
                    />
                    <label className="form-check-label" htmlFor={`${idBase}-axis-enabled-${axis}`}>
                      Enable {axis.toUpperCase()} Axis
                    </label>
                  </div>
                ))}
              </div>

              {readonlyCountField(
                `${idBase}-meshgrid-count`,
                'Number of spatiotemporal boundaries to generate:',
                generateCount,
                'Generates spatiotemporal boundaries by performing a Cartesian product between the cells along each axis.',
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