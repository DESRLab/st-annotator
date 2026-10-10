import type { Vector3XYZ } from "sta/common";

import type {
  BoxType,
  ReadonlyLabelBox,
  ReadonlyLabelClass,
  ReadonlyLabelTrack,
  UUID,
} from "../data";
import type { Action, BBoxSettingsInputtedData, DrawMode } from "../widgets";
import type { LabelBoxInspectorPaneControllerParams } from "../widgets/LabelBoxInspectorPane.ts";
import {
  getLabelBoxSelectionItemText,
  getLabelTrackSelectionItemText,
} from "../widgets/LabelSelectionText";
import type { LabelTrackInspectorPaneControllerParams } from "../widgets/LabelTrackInspectorPane.ts";

/**
 * A plain quality level value in the snapshot: `0`/`1`/`2` for the defined
 * levels, `null` for unknown. (The models hold `QualityLevel` objects whose
 * `value` this mirrors.)
 */
export type QualityLevelValue = 0 | 1 | 2 | null;

/**
 * The plain snapshot DTO of a bounding box, projected from the model.
 *
 * Field names keep the domain relation names (`entityId` is the parent
 * track, `perceivedClassId` the perceived class) so write paths wired in
 * the pane migration target the right relation. `text` is relationally
 * derived (it depends on the perceived/inherited class), so it is
 * recomputed on every mapping rather than cached.
 */
export interface BBoxEntity {
  readonly id: UUID;
  readonly text: string;
  readonly boxType: BoxType;
  readonly hidden: boolean;
  readonly center: Vector3XYZ;
  readonly size: Vector3XYZ;
  readonly angle: number;
  readonly entityId: UUID | null;
  readonly perceivedClassId: number | null;
  readonly distinctiveLv: QualityLevelValue;
  readonly occlusionLv: QualityLevelValue;
}

/** The plain snapshot DTO of an object track, projected from the model. */
export interface BBoxTrackEntity {
  readonly id: UUID;
  readonly text: string;
  readonly gtClassId: number | null;
  readonly isBlack: boolean;
}

/** The plain snapshot DTO of a label class, projected from the model. */
export interface BBoxClassEntity {
  readonly id: number;
  readonly name: string;
}

/**
 * The narrow labels surface the slice maps entity lists from: only the
 * iteration accessors, which are safe to call while no index is loaded
 * (they fall back to an empty index).
 */
export interface BBoxSliceLabelsSource {
  iterLabelBoxes(): IterableIterator<ReadonlyLabelBox>;
  iterLabelTracks(): IterableIterator<ReadonlyLabelTrack>;
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;
}

/**
 * The plain editor-state slice of the bounding box plugin, merged into the
 * snapshot under `layers.bbox`.
 */
export interface BBoxSlice {
  readonly ui: {
    /** The selected interaction action. */
    readonly action: Action;
    /** The draw origin used when creating a box. */
    readonly drawMode: DrawMode;
    /** `true` while interaction is disabled (inactive layer / no data). */
    readonly disabled: boolean;
    /** The id of the selected box, or `null` if none. */
    readonly selectedBoxId: UUID | null;
    /** The id of the track being edited; `null` outside the edit state. */
    readonly selectedTrackId: UUID | null;
    /** Whether the clipboard can copy the current selection. */
    readonly canCopy: boolean;
    /** Whether the clipboard has data to paste. */
    readonly canPaste: boolean;
    /** `true` while tracks are managed automatically (one box each). */
    readonly autoTracks: boolean;
    /** Whether the draw-box button of the box inspector is active. */
    readonly drawBoxActive: boolean;
    /** The exact disabled state of the box inspector pane. */
    readonly boxInspectorDisabled: boolean;
    /** The exact disabled state of the track inspector pane. */
    readonly trackInspectorDisabled: boolean;
  };
  /** The committed state of the layer settings pane. */
  readonly settings: {
    /** The committed settings values edited by the pane. */
    readonly values: BBoxSettingsInputtedData;
    /** `true` while the pane is disabled (no label data loaded). */
    readonly disabled: boolean;
    /** `true` while relative elevation is unavailable (no ground mesh). */
    readonly disallowRelativeElevation: boolean;
  };
  /** The bounding boxes of the current labels index. */
  readonly boxes: readonly BBoxEntity[];
  /** The object tracks of the current labels index. */
  readonly tracks: readonly BBoxTrackEntity[];
  /** The label classes of the current labels index. */
  readonly classes: readonly BBoxClassEntity[];
}

/**
 * The narrow interaction state the slice is mapped from.
 *
 * Kept structural and plain so the mapping is unit-testable without
 * constructing the layer (which needs a live scene context).
 */
export interface BBoxSliceInput {
  readonly action: Action;
  readonly drawMode: DrawMode;
  readonly disabled: boolean;
  readonly selectedBoxId: UUID | null;
  readonly selectedTrackId: UUID | null;
  readonly autoTracks: boolean;
  readonly drawBoxActive: boolean;
  readonly boxInspectorDisabled: boolean;
  readonly trackInspectorDisabled: boolean;
  readonly clipboard: {
    readonly disableCopy: boolean;
    readonly disablePaste: boolean;
  };
  readonly settings: BBoxSlice["settings"];
  /**
   * The labels source, or `null` while a load is in flight (between
   * `beforeload` and `afterload`); the entity lists map empty meanwhile.
   */
  readonly labels: BBoxSliceLabelsSource | null;
}

/** Projects one bounding box model into its plain snapshot DTO. */
export function projectBBoxEntity(box: ReadonlyLabelBox): BBoxEntity {
  return {
    id: box.id,
    text: getLabelBoxSelectionItemText(box),
    boxType: box.boxType,
    hidden: box.hidden,
    center: { x: box.center.x, y: box.center.y, z: box.center.z },
    size: { x: box.size.x, y: box.size.y, z: box.size.z },
    angle: box.angle,
    entityId: box.entityId,
    perceivedClassId: box.perceivedClassId,
    distinctiveLv: box.distinctiveLv.value as QualityLevelValue,
    occlusionLv: box.occlusionLv.value as QualityLevelValue,
  };
}

/** Projects one object track model into its plain snapshot DTO. */
export function projectBBoxTrackEntity(
  track: ReadonlyLabelTrack,
): BBoxTrackEntity {
  return {
    id: track.id,
    text: getLabelTrackSelectionItemText(track),
    gtClassId: track.gtClassId,
    isBlack: track.isBlack,
  };
}

/** Projects one label class model into its plain snapshot DTO. */
export function projectBBoxClassEntity(
  labelClass: ReadonlyLabelClass,
): BBoxClassEntity {
  return {
    id: labelClass.id,
    name: labelClass.name,
  };
}

function sameBBoxEntity(a: BBoxEntity, b: BBoxEntity): boolean {
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.boxType === b.boxType &&
    a.hidden === b.hidden &&
    a.center.x === b.center.x &&
    a.center.y === b.center.y &&
    a.center.z === b.center.z &&
    a.size.x === b.size.x &&
    a.size.y === b.size.y &&
    a.size.z === b.size.z &&
    a.angle === b.angle &&
    a.entityId === b.entityId &&
    a.perceivedClassId === b.perceivedClassId &&
    a.distinctiveLv === b.distinctiveLv &&
    a.occlusionLv === b.occlusionLv
  );
}

function sameBBoxTrackEntity(a: BBoxTrackEntity, b: BBoxTrackEntity): boolean {
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.gtClassId === b.gtClassId &&
    a.isBlack === b.isBlack
  );
}

function sameBBoxClassEntity(a: BBoxClassEntity, b: BBoxClassEntity): boolean {
  return a.id === b.id && a.name === b.name;
}

function sameUi(a: BBoxSlice["ui"], b: BBoxSlice["ui"]): boolean {
  return (
    a.action === b.action &&
    a.drawMode === b.drawMode &&
    a.disabled === b.disabled &&
    a.selectedBoxId === b.selectedBoxId &&
    a.selectedTrackId === b.selectedTrackId &&
    a.canCopy === b.canCopy &&
    a.canPaste === b.canPaste &&
    a.autoTracks === b.autoTracks &&
    a.drawBoxActive === b.drawBoxActive &&
    a.boxInspectorDisabled === b.boxInspectorDisabled &&
    a.trackInspectorDisabled === b.trackInspectorDisabled
  );
}

function sameSettings(
  a: BBoxSlice["settings"],
  b: BBoxSlice["settings"],
): boolean {
  return (
    a.values === b.values &&
    a.disabled === b.disabled &&
    a.disallowRelativeElevation === b.disallowRelativeElevation
  );
}

/**
 * Reuses the previous record of each unchanged entity (structural sharing).
 *
 * Every record is reprojected and compared field by field, including
 * `text`, which is relationally derived and can change through another
 * entity's update (e.g. a class rename). Mapping is therefore O(N) per
 * invalidation and O(1) only while idle; the sharing keeps the downstream
 * selector/memo/Tweakpane identities stable, not the mapping cheap.
 *
 * Unchanged records survive adds/deletes too: when the length changes the
 * records are matched by id instead of position.
 */
function shareEntityList<TEntity extends { readonly id: unknown }>(
  projected: readonly TEntity[],
  previous: readonly TEntity[] | undefined,
  isSame: (a: TEntity, b: TEntity) => boolean,
): readonly TEntity[] {
  if (previous == null) return projected;
  if (previous.length === 0)
    return projected.length === 0 ? previous : projected;

  if (previous.length === projected.length) {
    let shared = true;
    const next = projected.map((entity, index) => {
      const previousEntity = previous[index];
      if (isSame(entity, previousEntity)) return previousEntity;
      shared = false;
      return entity;
    });
    return shared ? previous : next;
  }

  const previousById = new Map(previous.map((entity) => [entity.id, entity]));
  return projected.map((entity) => {
    const previousEntity = previousById.get(entity.id);
    return previousEntity != null && isSame(entity, previousEntity)
      ? previousEntity
      : entity;
  });
}

/**
 * Maps the bbox interaction state to its plain slice, reusing `previous`
 * when nothing changed (structural sharing).
 */
export function mapBBoxSlice(
  input: BBoxSliceInput,
  previous: BBoxSlice | null,
): BBoxSlice {
  const ui = {
    action: input.action,
    drawMode: input.drawMode,
    disabled: input.disabled,
    selectedBoxId: input.selectedBoxId,
    selectedTrackId: input.selectedTrackId,
    canCopy: !input.clipboard.disableCopy,
    canPaste: !input.clipboard.disablePaste,
    autoTracks: input.autoTracks,
    drawBoxActive: input.drawBoxActive,
    boxInspectorDisabled: input.boxInspectorDisabled,
    trackInspectorDisabled: input.trackInspectorDisabled,
  };

  const previousUi = previous?.ui;
  const nextUi = previousUi != null && sameUi(previousUi, ui) ? previousUi : ui;

  const settings = input.settings;
  const previousSettings = previous?.settings;
  const nextSettings =
    previousSettings != null && sameSettings(previousSettings, settings)
      ? previousSettings
      : settings;

  const labels = input.labels;
  const boxes = shareEntityList(
    labels == null
      ? []
      : Array.from(labels.iterLabelBoxes(), projectBBoxEntity),
    previous?.boxes,
    sameBBoxEntity,
  );
  const tracks = shareEntityList(
    labels == null
      ? []
      : Array.from(labels.iterLabelTracks(), projectBBoxTrackEntity),
    previous?.tracks,
    sameBBoxTrackEntity,
  );
  const classes = shareEntityList(
    labels == null
      ? []
      : Array.from(labels.iterLabelClasses(), projectBBoxClassEntity),
    previous?.classes,
    sameBBoxClassEntity,
  );

  const next: BBoxSlice = {
    ui: nextUi,
    settings: nextSettings,
    boxes,
    tracks,
    classes,
  };
  if (previous == null) return next;

  return previous.ui === next.ui &&
    previous.settings === next.settings &&
    previous.boxes === next.boxes &&
    previous.tracks === next.tracks &&
    previous.classes === next.classes
    ? previous
    : next;
}

/**
 * The editor intents of the bounding box plugin, merged into the editor
 * intents under `bbox` by the composition root.
 *
 * Every intent runs through the layer's existing imperative APIs, which
 * mutate and notify synchronously, so the slice contributor invalidates the
 * snapshot in the same dispatch.
 */
export interface BBoxIntents {
  /** Sets whether the box is temporarily hidden locally. */
  setBoxHidden(id: UUID, hidden: boolean): void;
  /** Selects the interaction action. */
  setAction(action: Action): void;
  /** Selects the draw origin used when creating a box. */
  setDrawMode(drawMode: DrawMode): void;
  /** Applies new settings values to the layer. */
  setSettings(values: BBoxSettingsInputtedData): void;
  /** Applies new box inspector pane input (selection rides the same path). */
  applyBoxInspectorInput(
    values: LabelBoxInspectorPaneControllerParams["inputtedData"],
  ): void;
  /** Applies new track inspector pane input (selection rides the same path). */
  applyTrackInspectorInput(
    values: LabelTrackInspectorPaneControllerParams["inputtedData"],
  ): void;
  /** Selects a box from the labels tree (`null` deselects). */
  selectBox(id: UUID | null): void;
  /** Selects a track from the labels tree (`null` deselects). */
  selectTrack(id: UUID | null): void;
  /** Forwards a box inspector pane event (e.g. the draw-box toggle). */
  boxInspectorPaneEvent(event: { type: string }): void;
  /** Forwards a track inspector pane event (e.g. create-track). */
  trackInspectorPaneEvent(event: { type: string }): void;
}

/** The plugin slice merge of the bbox plugin into `EditorState`. */
export interface BBoxPluginSlices {
  readonly bbox: BBoxSlice;
}

/** The plugin intent merge of the bbox plugin into `EditorIntents`. */
export interface BBoxPluginIntents {
  readonly bbox: BBoxIntents;
}
