import * as THREE from "three";

import { ThreeUtils } from "sta/common";

import { LabelSelection } from "../data/LabelSelection";
import type { ReadonlyLabelSelection as _ReadonlyLabelSelection } from "../data/LabelSelection";
import { SelectionParametricCurator, SelectionVertexCurator } from "../tools";
import type {
  BrushCurator,
  LassoCurator,
  PolygonCurator,
  RectangleCurator,
  SelectionCurator,
} from "../tools";
import { VectorUtils } from "../utils";
import type { PointCloudUtils } from "../utils";
import type {
  EditMode,
  EditModePaneControllerParams,
} from "../widgets/EditModePane.react.tsx";

// Re-export the ReadonlyLabelSelection type from LabelSelection for compatibility.
export type ReadonlyLabelSelection = _ReadonlyLabelSelection;

export interface PropertyChangeEvent {
  obj: LabelSelection;
  propertyKey: string;
}

export interface ParametricGeo {
  center: THREE.Vector2;
  radius: number;
}
export interface VertexGeo {
  pixelVertices: THREE.Vector2[];
  ndcVertices: THREE.Vector2[];
}
export type ObjQuery = ParametricGeo | VertexGeo;

export interface SelectionCuratorEventMap<T extends ObjQuery> {
  begin: { objQuery: T };
  pause: { objQuery: T };
  abort: { objQuery: T };
  end: { objQuery: T };
}

export type LocalSelectionData = Readonly<{
  pointCoords: readonly THREE.Vector3[];
  centerPoint: Readonly<THREE.Vector3>;
}>;

export interface SelectionEditControlsEventMap {
  change: {};
  begin: { obj: ReadonlyLabelSelection | null };
  create: { newSelectionData: { pointCoords: readonly THREE.Vector3[] } };
  update: {
    obj: ReadonlyLabelSelection;
    mode: string;
    newSelectionData: { pointCoords: readonly THREE.Vector3[] };
    prevSelectionData: { pointCoords: readonly THREE.Vector3[] };
  };
  abort: { obj: ReadonlyLabelSelection | null };
}

interface SelectionCurators {
  polygon: PolygonCurator;
  lasso: LassoCurator;
  box: RectangleCurator;
  brush: BrushCurator;
}

/**
 * Handles creation of a selection as well as modifications.
 */
export class SelectionEditControls extends THREE.EventDispatcher<SelectionEditControlsEventMap> {
  #pcdUtils: PointCloudUtils | null = null;

  get pcdUtils(): PointCloudUtils | null {
    return this.#pcdUtils;
  }

  set pcdUtils(value: PointCloudUtils | null) {
    if (this.#pcdUtils !== value) {
      this.#pcdUtils = value;
    }
  }

  #camera: THREE.Camera;

  get camera(): THREE.Camera {
    return this.#camera;
  }

  set camera(value: THREE.Camera) {
    if (this.#camera !== value) {
      this.#camera = value;
    }
  }

  get activateCurator():
    (PolygonCurator | LassoCurator | RectangleCurator | BrushCurator) | null {
    return (
      Object.values(this.curators).find(
        (curator) => curator.enabled === true,
      ) ?? null
    );
  }

  /** A set of objQuery creators to draw specific objQuery type. */
  readonly curators: SelectionCurators;

  /** The selection's coordinate data at the beginning of the current edit state. */
  #startSelection: LocalSelectionData | null = null;

  #currentObj: ReadonlyLabelSelection | null = null;

  /** Selection points that were painted by brush. */
  #paintedMask: THREE.Vector3[] = [];

  /** The object to be modified, if any. */
  get selectedObj(): ReadonlyLabelSelection | null {
    return this.#currentObj;
  }

  /**
   * Sets or unsets the stored state of an object.
   */
  #setState(obj: ReadonlyLabelSelection | null): void {
    if (obj == null) {
      this.#currentObj?.removeEventListener("change", this.#onObjChanged);

      this.#startSelection = null;
      this.#currentObj = null;
    } else {
      const currentObj = obj;

      this.#startSelection = {
        pointCoords: [...currentObj.pointCoords],
        centerPoint: currentObj.centerPoint.clone(),
      };

      currentObj.addEventListener("change", this.#onObjChanged);

      this.#currentObj = currentObj;
    }
  }

  #disabled = false;

  /**
   * `true` if this editor is disabled; otherwise, `false.`
   *
   * If set to `true` while an object is being modified, aborts the process.
   */
  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(value: boolean) {
    if (this.#disabled !== value) {
      this.#disabled = value;

      if (value) {
        this.abort();
      }

      this.render();
    }
  }

  #editMode: EditMode = "add";

  /** The edit mode to modify a selection. */
  get editMode(): EditMode {
    return this.#editMode;
  }

  get isCuratorDrawing(): boolean {
    const activeCurator = this.activateCurator;

    return activeCurator ? activeCurator.isCreating : false;
  }

  get hasSelection(): boolean {
    return this.#currentObj != null;
  }

  get isCreating(): boolean {
    return !this.hasSelection && !this.disabled && this.editMode === "add";
  }

  get isEditing(): boolean {
    return this.hasSelection && !this.disabled;
  }

  /**
   * Creates a new object editor.
   */
  constructor(selectionCurators: SelectionCurators) {
    super();

    this.curators = selectionCurators;

    const curators = Object.values(this.curators);
    for (const curator of curators) {
      curator.addEventListener("begin", this.#onCuratorBegin);
      curator.addEventListener("end", this.#onCuratorEnd);
      curator.addEventListener("pause", this.#onCuratorPause);
      curator.addEventListener("abort", this.#onCuratorAbort);
    }
  }

  onEditModeInputChange = (
    change: Partial<EditModePaneControllerParams["inputtedData"]>,
  ): void => {
    if (change.editMode == null || change.editMode === this.#editMode) return;
    this.#editMode = change.editMode;
    this.render();
  };

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    const curators = Object.values(this.curators);
    for (const curator of curators) {
      curator.removeEventListener("begin", this.#onCuratorBegin);
      curator.removeEventListener("end", this.#onCuratorEnd);
      curator.removeEventListener("pause", this.#onCuratorPause);
      curator.removeEventListener("abort", this.#onCuratorAbort);
    }
  }

  /**
   * Reset the current object when the object is modified from undo and redo.
   */
  #onObjChanged = (event: PropertyChangeEvent): void => {
    const currentObj = this.#currentObj;
    const startSelection = this.#startSelection;
    if (currentObj == null || startSelection == null) return;

    if (event.propertyKey === "points") {
      if (
        !ThreeUtils.areVerticesEqual(
          event.obj.pointCoords,
          startSelection.pointCoords,
        )
      ) {
        this.#setState(event.obj);
      }
    }
  };

  /**
   * Sets the start state of editing a selection object.
   */
  #onCuratorBegin = (
    event: SelectionCuratorEventMap<ObjQuery>["begin"],
  ): void => {
    if (this.disabled) return;

    const currentObj = this.#currentObj;
    this.#setState(currentObj);

    this.dispatchEvent({ type: "begin", obj: currentObj });

    if (Object.hasOwn(event.objQuery, "center")) {
      const currentMasks = this.#paintedMask;
      const pointsInObjQuery = this.#getPointsInObjQuery(event.objQuery);
      this.#paintedMask = VectorUtils.concatRemoveDuplicates(
        currentMasks,
        pointsInObjQuery,
      );
    }
  };

  #onCuratorEnd = (event: SelectionCuratorEventMap<ObjQuery>["end"]): void => {
    if (this.disabled) return;

    const pointsInObjQuery = this.#getPointsInObjQuery(event.objQuery);
    this.#checkpoint(pointsInObjQuery);
  };

  #onCuratorPause = (
    event: SelectionCuratorEventMap<ObjQuery>["pause"],
  ): void => {
    let currentMask = this.#paintedMask;
    const pointsInObjQuery = this.#getPointsInObjQuery(event.objQuery);
    currentMask = VectorUtils.concatRemoveDuplicates(
      currentMask,
      pointsInObjQuery,
    );
    this.#paintedMask = [];

    this.#checkpoint(currentMask);
  };

  #onCuratorAbort = (): void => {
    this.#paintedMask = [];
  };

  /**
   * Runs the given query against the given curator, either over the points of the
   * current object (when erasing) or over the whole point cloud.
   */
  #queryPoints<T extends ObjQuery>(
    curator: SelectionCurator<T>,
    objQuery: T,
    currentObj: ReadonlyLabelSelection | null,
    pcdUtils: PointCloudUtils,
    editMode: EditMode,
  ): THREE.Vector3[] {
    if (editMode === "erase" && currentObj != null) {
      return curator.queryPointsFromBuffer(
        [...currentObj.pointCoords],
        objQuery,
      );
    }
    return curator.queryPointTree(pcdUtils.tree, objQuery);
  }

  /**
   * Finds the points inside object query drawn by curator tools.
   */
  #getPointsInObjQuery(objQuery: ObjQuery): THREE.Vector3[] {
    const { pcdUtils, activateCurator, editMode } = this;
    if (pcdUtils == null || activateCurator == null) return [];

    const currentObj = this.#currentObj;

    // The active curator always produces the query it is paired with:
    // parametric curators draw `center`-based queries, vertex curators draw vertex-based ones.
    if (
      activateCurator instanceof SelectionParametricCurator &&
      "center" in objQuery
    ) {
      return this.#queryPoints(
        activateCurator,
        objQuery,
        currentObj,
        pcdUtils,
        editMode,
      );
    }
    if (
      activateCurator instanceof SelectionVertexCurator &&
      !("center" in objQuery)
    ) {
      return this.#queryPoints(
        activateCurator,
        objQuery,
        currentObj,
        pcdUtils,
        editMode,
      );
    }

    return [];
  }

  /**
   * Handles creating a new label selection data or modifying existing selection point.
   */
  #checkpoint(queriedPoints: readonly THREE.Vector3[]): void {
    const editMode = this.editMode;
    const currentObj = this.#currentObj;
    const startSelection = this.#startSelection;

    if (currentObj == null) {
      if (this.isCreating) {
        this.dispatchEvent({
          type: "create",
          newSelectionData: { pointCoords: queriedPoints },
        });
      }
    } else {
      if (startSelection == null) return;

      const startPoints = [...startSelection.pointCoords];

      let newPoints: THREE.Vector3[] = [];

      switch (editMode) {
        case "add":
          newPoints = VectorUtils.concatRemoveDuplicates(
            startPoints,
            queriedPoints,
          );
          break;
        case "erase":
          newPoints = VectorUtils.findDisjoint(startPoints, queriedPoints);
          break;
        default:
      }

      currentObj.getSelection().pointCoords = newPoints;

      // if no changes has been made.
      if (startSelection.centerPoint.equals(currentObj.centerPoint)) {
        return;
      }

      const updatedObj = newPoints.length === 0 ? null : currentObj;
      this.#setState(updatedObj);

      this.dispatchEvent({
        type: "update",
        obj: currentObj,
        mode: this.editMode,
        newSelectionData: { pointCoords: newPoints },
        prevSelectionData: {
          pointCoords: startSelection.pointCoords,
        },
      });
    }
  }

  /**
   * Selects an object to edit. If null is passed, the control creates a new selection object.
   */
  select(obj: ReadonlyLabelSelection | null): void {
    if (this.hasSelection) {
      this.deselect();
    }

    this.#setState(obj);
  }

  /**
   * Deselects the object so it can no longer be modified.
   */
  deselect(): void {
    if (!this.hasSelection) return;

    this.abort();
    this.#setState(null);
  }

  /**
   * Aborts create or editing a label selection data points.
   */
  abort(): void {
    const { isCuratorDrawing, activateCurator } = this;

    if (isCuratorDrawing) {
      activateCurator?.abort();
    }
    this.#paintedMask = [];

    const startSelection = this.#startSelection;
    const currentObj = this.#currentObj;

    if (currentObj != null && startSelection != null) {
      currentObj.getSelection().pointCoords = startSelection.pointCoords;
    }

    this.dispatchEvent({ type: "abort", obj: currentObj });
  }

  /**
   * Renders the avaiable edit mode inputs.
   */
  render(): void {
    this.dispatchEvent({ type: "change" });
  }
}
