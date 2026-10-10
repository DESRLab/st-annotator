import type { ReadonlyLabelClass, ReadonlyLabelVector, UUID } from "../data";
import type { Action, DrawMode, VectorSettingsInputtedData } from "../widgets";
import { getLabelVectorSelectionItemText } from "../widgets/LabelSelectionText";
import type { LabelVectorInspectorPaneControllerParams } from "../widgets/LabelVectorInspectorPane.ts";

/**
 * The plain snapshot DTO of a vector, projected from the model.
 *
 * Field names keep the domain relation names (`gtClassId` is the ground
 * truth class) so write paths wired in the pane migration target the right
 * relation. `text` is relationally derived (it depends on the ground truth
 * class), so it is recomputed on every mapping rather than cached.
 */
export interface VectorEntity {
  readonly id: UUID;
  readonly text: string;
  readonly gtClassId: number | null;
}

/** The plain snapshot DTO of a label class, projected from the model. */
export interface VectorClassEntity {
  readonly id: number;
  readonly name: string;
}

/**
 * The narrow labels surface the slice maps entity lists from: only the
 * iteration accessors, which are safe to call while no index is loaded
 * (they fall back to an empty index).
 */
export interface VectorSliceLabelsSource {
  iterLabelVectors(): IterableIterator<ReadonlyLabelVector>;
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;
}

/**
 * The plain editor-state slice of the vector plugin, merged into the
 * snapshot under `layers.vector`.
 */
export interface VectorSlice {
  readonly ui: {
    /** The selected interaction action. */
    readonly action: Action;
    /** The type of vector drawn while drawing. */
    readonly drawMode: DrawMode;
    /** `true` while interaction is disabled (inactive layer / no data). */
    readonly disabled: boolean;
    /** The id of the selected vector, or `null` if none. */
    readonly selectedVectorId: UUID | null;
    /** Whether the clipboard can copy the current selection. */
    readonly canCopy: boolean;
    /** Whether the clipboard has data to paste. */
    readonly canPaste: boolean;
    /** Whether the draw-vector button of the vector inspector is active. */
    readonly drawVectorActive: boolean;
    /** The exact disabled state of the vector inspector pane. */
    readonly vectorInspectorDisabled: boolean;
  };
  /** The committed state of the layer settings pane. */
  readonly settings: {
    /** The committed settings values edited by the pane. */
    readonly values: VectorSettingsInputtedData;
    /** `true` while the pane is disabled (no label data loaded). */
    readonly disabled: boolean;
  };
  /** The vectors of the current labels index. */
  readonly vectors: readonly VectorEntity[];
  /** The label classes of the current labels index. */
  readonly classes: readonly VectorClassEntity[];
}

/**
 * The narrow interaction state the slice is mapped from.
 *
 * Kept structural and plain so the mapping is unit-testable without
 * constructing the layer (which needs a live scene context).
 */
export interface VectorSliceInput {
  readonly action: Action;
  readonly drawMode: DrawMode;
  readonly disabled: boolean;
  readonly selectedVectorId: UUID | null;
  readonly drawVectorActive: boolean;
  readonly vectorInspectorDisabled: boolean;
  readonly clipboard: {
    readonly disableCopy: boolean;
    readonly disablePaste: boolean;
  };
  readonly settings: VectorSlice["settings"];
  /**
   * The labels source, or `null` while a load is in flight (between
   * `beforeload` and `afterload`); the entity lists map empty meanwhile.
   */
  readonly labels: VectorSliceLabelsSource | null;
}

/** Projects one vector model into its plain snapshot DTO. */
export function projectVectorEntity(vector: ReadonlyLabelVector): VectorEntity {
  return {
    id: vector.id,
    text: getLabelVectorSelectionItemText(vector),
    gtClassId: vector.gtClassId,
  };
}

/** Projects one label class model into its plain snapshot DTO. */
export function projectVectorClassEntity(
  labelClass: ReadonlyLabelClass,
): VectorClassEntity {
  return {
    id: labelClass.id,
    name: labelClass.name,
  };
}

function sameVectorEntity(a: VectorEntity, b: VectorEntity): boolean {
  return a.id === b.id && a.text === b.text && a.gtClassId === b.gtClassId;
}

function sameVectorClassEntity(
  a: VectorClassEntity,
  b: VectorClassEntity,
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
 * Maps the vector interaction state to its plain slice, reusing `previous`
 * when nothing changed (structural sharing).
 */
export function mapVectorSlice(
  input: VectorSliceInput,
  previous: VectorSlice | null,
): VectorSlice {
  const ui = {
    action: input.action,
    drawMode: input.drawMode,
    disabled: input.disabled,
    selectedVectorId: input.selectedVectorId,
    canCopy: !input.clipboard.disableCopy,
    canPaste: !input.clipboard.disablePaste,
    drawVectorActive: input.drawVectorActive,
    vectorInspectorDisabled: input.vectorInspectorDisabled,
  };

  const previousUi = previous?.ui;
  const nextUi =
    previousUi?.action === ui.action &&
    previousUi?.drawMode === ui.drawMode &&
    previousUi?.disabled === ui.disabled &&
    previousUi?.selectedVectorId === ui.selectedVectorId &&
    previousUi?.canCopy === ui.canCopy &&
    previousUi?.canPaste === ui.canPaste &&
    previousUi?.drawVectorActive === ui.drawVectorActive &&
    previousUi?.vectorInspectorDisabled === ui.vectorInspectorDisabled
      ? previousUi
      : ui;

  const settings = input.settings;
  const previousSettings = previous?.settings;
  const nextSettings =
    previousSettings?.values === settings.values &&
    previousSettings?.disabled === settings.disabled
      ? previousSettings
      : settings;

  const labels = input.labels;
  const vectors = shareEntityList(
    labels == null
      ? []
      : Array.from(labels.iterLabelVectors(), projectVectorEntity),
    previous?.vectors,
    sameVectorEntity,
  );
  const classes = shareEntityList(
    labels == null
      ? []
      : Array.from(labels.iterLabelClasses(), projectVectorClassEntity),
    previous?.classes,
    sameVectorClassEntity,
  );

  if (
    previous?.ui === nextUi &&
    previous?.settings === nextSettings &&
    previous?.vectors === vectors &&
    previous?.classes === classes
  ) {
    return previous;
  }

  return { ui: nextUi, settings: nextSettings, vectors, classes };
}

/**
 * The editor intents of the vector plugin, merged into the editor
 * intents under `vector` by the composition root.
 *
 * Every intent runs through the layer's existing imperative APIs, which
 * mutate and notify synchronously, so the slice contributor invalidates the
 * snapshot in the same dispatch.
 */
export interface VectorIntents {
  /** Selects the interaction action. */
  setAction(action: Action): void;
  /** Selects the type of vector drawn while drawing. */
  setDrawMode(drawMode: DrawMode): void;
  /** Applies new settings values to the layer. */
  setSettings(values: VectorSettingsInputtedData): void;
  /** Applies new vector inspector pane input (selection rides the same path). */
  applyVectorInspectorInput(
    values: LabelVectorInspectorPaneControllerParams["inputtedData"],
  ): void;
  /** Selects a vector from the labels tree (`null` deselects). */
  selectVector(id: UUID | null): void;
  /** Forwards a vector inspector pane event (e.g. the draw-vector toggle). */
  vectorInspectorPaneEvent(event: { type: string }): void;
}

/** The plugin slice merge of the vector plugin into `EditorState`. */
export interface VectorPluginSlices {
  readonly vector: VectorSlice;
}

/** The plugin intent merge of the vector plugin into `EditorIntents`. */
export interface VectorPluginIntents {
  readonly vector: VectorIntents;
}
