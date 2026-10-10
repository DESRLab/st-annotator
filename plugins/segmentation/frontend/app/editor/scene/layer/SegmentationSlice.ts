import type {
  ReadonlyLabelClass,
  ReadonlyLabelInstance,
  ReadonlyLabelSelection,
  UUID,
} from "../data";
import type {
  Action,
  DrawMode,
  EditMode,
  SegmentationSettingsInputtedData,
} from "../widgets";
import type { LabelInstanceInspectorPaneControllerParams } from "../widgets/LabelInstanceInspectorPane.ts";
import type { LabelSelectionInspectorPaneControllerParams } from "../widgets/LabelSelectionInspectorPane.ts";
import {
  getLabelInstanceSelectionItemText,
  getLabelSelectionSelectionItemText,
} from "../widgets/LabelSelectionText";

/**
 * A plain quality level value in the snapshot: `0`/`1`/`2` for the defined
 * levels, `null` for unknown. (The models hold `QualityLevel` objects whose
 * `value` this mirrors.)
 */
export type QualityLevelValue = 0 | 1 | 2 | null;

/**
 * The plain snapshot DTO of an object instance, projected from the model.
 *
 * `text` is relationally derived (it depends on the ground truth class),
 * so it is recomputed on every mapping rather than cached.
 */
export interface SegmentationInstanceEntity {
  readonly id: UUID;
  readonly text: string;
  readonly gtClassId: number | null;
  readonly isBlack: boolean;
}

/**
 * The plain snapshot DTO of a label selection, projected from the model.
 *
 * Field names keep the domain relation names (`entityId` is the parent
 * instance, `perceivedClassId` the perceived class) so write paths wired in
 * the pane migration target the right relation. `text` is relationally
 * derived (it depends on the perceived/inherited class), so it is
 * recomputed on every mapping rather than cached.
 */
export interface SegmentationSelectionEntity {
  readonly id: UUID;
  readonly text: string;
  readonly entityId: UUID | null;
  readonly perceivedClassId: number | null;
  readonly distinctiveLv: QualityLevelValue;
  readonly occlusionLv: QualityLevelValue;
}

/** The plain snapshot DTO of a label class, projected from the model. */
export interface SegmentationClassEntity {
  readonly id: number;
  readonly name: string;
}

/**
 * The narrow labels surface the slice maps entity lists from: only the
 * iteration accessors, which are safe to call while no index is loaded
 * (they fall back to an empty index).
 */
export interface SegmentationSliceLabelsSource {
  iterLabelInstances(): IterableIterator<ReadonlyLabelInstance>;
  iterLabelSelections(): IterableIterator<ReadonlyLabelSelection>;
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;
}

/**
 * The plain editor-state slice of the segmentation plugin, merged into the
 * snapshot under `layers.segmentation`.
 */
export interface SegmentationSlice {
  readonly ui: {
    /** The selected interaction action. */
    readonly action: Action;
    /** The query/prompt tool used while drawing a selection. */
    readonly drawMode: DrawMode;
    /** The edit mode used to modify a selection. */
    readonly editMode: EditMode;
    /** `true` while interaction is disabled (inactive layer / no data). */
    readonly disabled: boolean;
    /** The id of the selected object instance, or `null` if none. */
    readonly selectedInstanceId: UUID | null;
    /** The id of the selected label selection, or `null` if none. */
    readonly selectedSelectionId: UUID | null;
    /**
     * `true` while instances are managed automatically (one selection
     * each).
     *
     * Mapped as a constant `true` for now: the plugin currently
     * hardcodes it (see `SegmentationLayer.tsx`,
     * `autoInstances: true`); there is no config counterpart (the base
     * `EditorConfig` only has `autoTracks`).
     */
    readonly autoInstances: boolean;
    /** Whether the draw-selection button of the selection inspector is active. */
    readonly drawSelectionActive: boolean;
    /** The exact disabled state of the instance inspector pane. */
    readonly instanceInspectorDisabled: boolean;
    /** The exact disabled state of the selection inspector pane. */
    readonly selectionInspectorDisabled: boolean;
  };
  /** The committed state of the layer settings pane. */
  readonly settings: {
    /** The committed settings values edited by the pane. */
    readonly values: SegmentationSettingsInputtedData;
    /** `true` while the pane is disabled (no label data loaded). */
    readonly disabled: boolean;
    /** Whether the backend reports a reachable labeling assistant. */
    readonly isAssistantAvailable: boolean;
  };
  /** The object instances of the current labels index. */
  readonly instances: readonly SegmentationInstanceEntity[];
  /** The label selections of the current labels index. */
  readonly selections: readonly SegmentationSelectionEntity[];
  /** The label classes of the current labels index. */
  readonly classes: readonly SegmentationClassEntity[];
}

/**
 * The narrow interaction state the slice is mapped from.
 *
 * Kept structural and plain so the mapping is unit-testable without
 * constructing the layer (which needs a live scene context).
 */
export interface SegmentationSliceInput {
  readonly action: Action;
  readonly drawMode: DrawMode;
  readonly editMode: EditMode;
  readonly disabled: boolean;
  readonly selectedInstanceId: UUID | null;
  readonly selectedSelectionId: UUID | null;
  readonly autoInstances: boolean;
  readonly drawSelectionActive: boolean;
  readonly instanceInspectorDisabled: boolean;
  readonly selectionInspectorDisabled: boolean;
  readonly settings: SegmentationSlice["settings"];
  /**
   * The labels source, or `null` while a load is in flight (between
   * `beforeload` and `afterload`); the entity lists map empty meanwhile.
   */
  readonly labels: SegmentationSliceLabelsSource | null;
}

/** Projects one object instance model into its plain snapshot DTO. */
export function projectSegmentationInstanceEntity(
  instance: ReadonlyLabelInstance,
): SegmentationInstanceEntity {
  return {
    id: instance.id,
    text: getLabelInstanceSelectionItemText(instance),
    gtClassId: instance.gtClassId,
    isBlack: instance.isBlack,
  };
}

/** Projects one label selection model into its plain snapshot DTO. */
export function projectSegmentationSelectionEntity(
  selection: ReadonlyLabelSelection,
): SegmentationSelectionEntity {
  return {
    id: selection.id,
    text: getLabelSelectionSelectionItemText(selection),
    entityId: selection.entityId,
    perceivedClassId: selection.perceivedClassId,
    distinctiveLv: selection.distinctiveLv.value as QualityLevelValue,
    occlusionLv: selection.occlusionLv.value as QualityLevelValue,
  };
}

/** Projects one label class model into its plain snapshot DTO. */
export function projectSegmentationClassEntity(
  labelClass: ReadonlyLabelClass,
): SegmentationClassEntity {
  return {
    id: labelClass.id,
    name: labelClass.name,
  };
}

function sameSegmentationInstanceEntity(
  a: SegmentationInstanceEntity,
  b: SegmentationInstanceEntity,
): boolean {
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.gtClassId === b.gtClassId &&
    a.isBlack === b.isBlack
  );
}

function sameSegmentationSelectionEntity(
  a: SegmentationSelectionEntity,
  b: SegmentationSelectionEntity,
): boolean {
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.entityId === b.entityId &&
    a.perceivedClassId === b.perceivedClassId &&
    a.distinctiveLv === b.distinctiveLv &&
    a.occlusionLv === b.occlusionLv
  );
}

function sameSegmentationClassEntity(
  a: SegmentationClassEntity,
  b: SegmentationClassEntity,
): boolean {
  return a.id === b.id && a.name === b.name;
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
 * Maps the segmentation interaction state to its plain slice, reusing
 * `previous` when nothing changed (structural sharing).
 */
export function mapSegmentationSlice(
  input: SegmentationSliceInput,
  previous: SegmentationSlice | null,
): SegmentationSlice {
  const ui = {
    action: input.action,
    drawMode: input.drawMode,
    editMode: input.editMode,
    disabled: input.disabled,
    selectedInstanceId: input.selectedInstanceId,
    selectedSelectionId: input.selectedSelectionId,
    autoInstances: input.autoInstances,
    drawSelectionActive: input.drawSelectionActive,
    instanceInspectorDisabled: input.instanceInspectorDisabled,
    selectionInspectorDisabled: input.selectionInspectorDisabled,
  };

  const previousUi = previous?.ui;
  const sameUi =
    previousUi?.action === ui.action &&
    previousUi?.drawMode === ui.drawMode &&
    previousUi?.editMode === ui.editMode &&
    previousUi?.disabled === ui.disabled &&
    previousUi?.selectedInstanceId === ui.selectedInstanceId &&
    previousUi?.selectedSelectionId === ui.selectedSelectionId &&
    previousUi?.autoInstances === ui.autoInstances &&
    previousUi?.drawSelectionActive === ui.drawSelectionActive &&
    previousUi?.instanceInspectorDisabled === ui.instanceInspectorDisabled &&
    previousUi?.selectionInspectorDisabled === ui.selectionInspectorDisabled;
  const nextUi = previousUi != null && sameUi ? previousUi : ui;

  const settings = input.settings;
  const previousSettings = previous?.settings;
  const sameSettings =
    previousSettings?.values === settings.values &&
    previousSettings?.disabled === settings.disabled &&
    previousSettings?.isAssistantAvailable === settings.isAssistantAvailable;
  const nextSettings =
    previousSettings != null && sameSettings ? previousSettings : settings;

  const labels = input.labels;
  const instances = shareEntityList(
    labels == null
      ? []
      : Array.from(
          labels.iterLabelInstances(),
          projectSegmentationInstanceEntity,
        ),
    previous?.instances,
    sameSegmentationInstanceEntity,
  );
  const selections = shareEntityList(
    labels == null
      ? []
      : Array.from(
          labels.iterLabelSelections(),
          projectSegmentationSelectionEntity,
        ),
    previous?.selections,
    sameSegmentationSelectionEntity,
  );
  const classes = shareEntityList(
    labels == null
      ? []
      : Array.from(labels.iterLabelClasses(), projectSegmentationClassEntity),
    previous?.classes,
    sameSegmentationClassEntity,
  );

  const unchanged =
    previous?.ui === nextUi &&
    previous?.settings === nextSettings &&
    previous?.instances === instances &&
    previous?.selections === selections &&
    previous?.classes === classes;
  if (previous != null && unchanged) {
    return previous;
  }

  return {
    ui: nextUi,
    settings: nextSettings,
    instances,
    selections,
    classes,
  };
}

/**
 * The editor intents of the segmentation plugin, merged into the editor
 * intents under `segmentation` by the composition root.
 *
 * Every intent runs through the layer's existing imperative APIs, which
 * mutate and notify synchronously, so the slice contributor invalidates the
 * snapshot in the same dispatch.
 */
export interface SegmentationIntents {
  /** Selects the interaction action. */
  setAction(action: Action): void;
  /** Selects the query/prompt tool used while drawing a selection. */
  setDrawMode(drawMode: DrawMode): void;
  /** Selects the edit mode used to modify a selection. */
  setEditMode(editMode: EditMode): void;
  /** Applies new settings values to the layer. */
  setSettings(values: SegmentationSettingsInputtedData): void;
  /** Applies new instance inspector pane input (selection rides the same path). */
  applyInstanceInspectorInput(
    values: LabelInstanceInspectorPaneControllerParams["inputtedData"],
  ): void;
  /** Applies new selection inspector pane input (selection rides the same path). */
  applySelectionInspectorInput(
    values: LabelSelectionInspectorPaneControllerParams["inputtedData"],
  ): void;
  /** Selects an instance from the labels tree (`null` deselects). */
  selectInstance(id: UUID | null): void;
  /** Selects a selection from the labels tree (`null` deselects). */
  selectSelection(id: UUID | null): void;
  /** Forwards an instance inspector pane event (e.g. create-instance). */
  instanceInspectorPaneEvent(event: { type: string }): void;
  /** Forwards a selection inspector pane event (e.g. the draw-selection toggle). */
  selectionInspectorPaneEvent(event: { type: string }): void;
}

/** The plugin slice merge of the segmentation plugin into `EditorState`. */
export interface SegmentationPluginSlices {
  readonly segmentation: SegmentationSlice;
}

/** The plugin intent merge of the segmentation plugin into `EditorIntents`. */
export interface SegmentationPluginIntents {
  readonly segmentation: SegmentationIntents;
}
