import * as THREE from "three";
import { vi } from "vitest";

import {
  EditorConfig,
  VanillaEventDispatcher,
  ProjectConfig,
} from "sta/app/editor";
import { Timestamp } from "sta/common";

import { LabelSelection } from "../../../../../app/editor/scene/data/LabelSelection";
import type { ReadonlyLabelSelection } from "../../../../../app/editor/scene/data/LabelSelection";
import { InteractContext } from "../../../../../app/editor/scene/layer/InteractContext";
import { shouldDisableSegmentationInteraction } from "../../../../../app/editor/scene/layer/InteractionGate";
import { DistinctiveLevel, OcclusionLevel } from "../../../../../models";

export const EDITOR_CONFIG = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 4 }),
);
export const FRAME_ID = 42;
export const FRAME_TIMESTAMP = new Timestamp("2026-08-15T12:00:00Z");

/** A loaded labels index; its events drive the inspector render signaller. */
export function createLoadedIndex(): unknown {
  return new THREE.EventDispatcher();
}

const uuid = (counter: number): string =>
  `${counter.toString().padStart(8, "0")}-0000-4000-8000-000000000000`;

export function createSelectionFixture(
  overrides: {
    id?: string;
    timestamp?: Timestamp | null;
    entityId?: string | null;
  } = {},
): any {
  return {
    id: overrides.id ?? uuid(1),
    timestamp:
      overrides.timestamp === undefined ? FRAME_TIMESTAMP : overrides.timestamp,
    entityId: overrides.entityId ?? null,
    perceivedClassId: null,
    perceivedClass: null,
    gtClassId: null,
    gtClass: null,
    distinctiveLv: DistinctiveLevel.Unknown,
    occlusionLv: OcclusionLevel.Unknown,
    pointCoords: [],
  };
}

/**
 * A real `LabelSelection`, for flows that run the label model's own logic
 * (the edit checkpoint reads `points` and rolls back through
 * `getSelection().pointCoords`).
 */
export function createLabelSelectionFixture(
  overrides: {
    id?: string;
    timestamp?: Timestamp | null;
    entityId?: string | null;
  } = {},
): LabelSelection {
  return new LabelSelection({
    config: EDITOR_CONFIG,
    labels: null,
    id: overrides.id ?? uuid(1),
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)],
    timestamp:
      overrides.timestamp === undefined ? FRAME_TIMESTAMP : overrides.timestamp,
    entityId: overrides.entityId ?? null,
    showPointSize: 1,
  });
}

/**
 * A fake labels view satisfying the surfaces consumed by the interaction
 * context and its inspectors, plus the creation APIs of the draw state.
 *
 * The load events of the real view (`beforeload`/`afterload`) drive the
 * inspector's stale-selection cleanup, so they are part of the map.
 */
export class FakeSegmentationLabelsView extends VanillaEventDispatcher<{
  beforeload: {};
  afterload: {};
}> {
  data: unknown = null;
  classes = new Map<number, { id: number; name: string }>();
  instances = new Map<string, any>();
  selections = new Map<string, any>();
  localSelections = new Set<any>();
  #nextId = 10;

  /** The load events of the real view are driven by the base data view. */
  readonly context = new THREE.EventDispatcher();

  iterLabelClasses() {
    return this.classes.values();
  }
  iterLabelInstances() {
    return this.instances.values();
  }
  iterLabelSelections() {
    return this.selections.values();
  }
  hasLabelClass(id: number) {
    return this.classes.has(id);
  }
  getLabelClass(id: number) {
    return this.classes.get(id);
  }
  hasLabelInstance(id: string) {
    return this.instances.has(id);
  }
  getLabelInstance(id: string) {
    return this.instances.get(id);
  }
  hasLabelSelection(id: string) {
    return this.selections.has(id);
  }
  getLabelSelection(id: string) {
    return this.selections.get(id);
  }

  addLabelSelectionLocalOnly = vi.fn((params: any) => {
    const selection = new LabelSelection({
      config: EDITOR_CONFIG,
      labels: null,
      ...params,
    });
    this.localSelections.add(selection);
    return selection;
  });

  deleteLabelSelectionLocalOnly = vi.fn((selection: any) => {
    this.localSelections.delete(selection);
  });

  addLabelInstance = vi.fn(async (params: any) => {
    const instance = {
      id: uuid((this.#nextId += 1)),
      gtClassId: params.gtClassId ?? null,
      gtClass: null,
      isBlack: params.isBlack ?? false,
    };
    this.instances.set(instance.id, instance);
    return instance;
  });

  addLabelSelection = vi.fn(async (selection: any) => {
    const registered = createSelectionFixture({
      id: uuid((this.#nextId += 1)),
      timestamp: selection.timestamp,
      entityId: selection.entityId,
    });
    this.selections.set(registered.id, registered);
    return registered;
  });

  deleteLabelSelection = vi.fn();

  predictMask = vi.fn();
  updateLabelPointSelection = vi.fn(
    async (selection: ReadonlyLabelSelection) =>
      [...this.selections.values()].includes(selection) ? selection : null,
  );
  updateLabelInstanceGtClass = vi.fn(async () => {});
  updateLabelInstanceIsBlack = vi.fn(async () => {});
  updateLabelSelectionParentInstance = vi.fn(async () => {});
  updateLabelSelectionPerceivedClass = vi.fn(async () => {});
  updateLabelSelectionDistinctiveLv = vi.fn(async () => {});
  updateLabelSelectionOcclusionLv = vi.fn(async () => {});
}

/** Mirrors `SelectionCurator`: disabling aborts an in-progress creation. */
export function createFakeCurator(toolType: string) {
  let enabled = false;
  const curator = Object.assign(new THREE.EventDispatcher<any>(), {
    toolType,
    isCreating: false,
    abort: vi.fn(() => {
      if (!curator.isCreating) return false;
      curator.isCreating = false;
      return true;
    }),
    finish: vi.fn(() => {
      if (!enabled || !curator.isCreating) return false;
      // Mirrors the real curators: the drawn state is cleared BEFORE
      // the `end` event, so a racing second finish is a no-op.
      curator.isCreating = false;
      curator.dispatchEvent({ type: "end", objQuery: null });
      return true;
    }),
  });
  Object.defineProperty(curator, "enabled", {
    configurable: true,
    enumerable: true,
    get: () => enabled,
    set: (value: boolean) => {
      if (enabled === value) return;
      enabled = value;
      if (!enabled && curator.isCreating) curator.abort();
    },
  });
  return curator as typeof curator & { enabled: boolean };
}

export type FakeCurator = ReturnType<typeof createFakeCurator>;

/** The fake `SelectionEditControls` surface consumed by the context/states. */
export interface FakeSelectionController {
  curators: Record<"polygon" | "box" | "lasso" | "brush", FakeCurator>;
  camera: unknown;
  pcdUtils: unknown;
  editMode: "add";
  hasSelection: boolean;
  selectedObj: any;
  /** The selection point data captured when the selection was selected,
   * replayed as `prevSelectionData` on update checkpoints and restored
   * on abort, like the real controls' `#startSelection`. */
  startPointCoords: THREE.Vector3[];
  isCuratorDrawing: boolean;
  /** The points the curator query "returns" when a gesture finishes
   * through the curator itself (the pointer-up or `g` hotkey route). */
  queriedPoints: THREE.Vector3[];
  readonly isCreating: boolean;
  readonly isEditing: boolean;
  readonly activateCurator: FakeCurator | null;
  disabled: boolean;
  select: ReturnType<typeof vi.fn>;
  deselect: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  startGesture: ReturnType<typeof vi.fn>;
  finishGesture: ReturnType<typeof vi.fn>;
  dispatchEvent(event: { type: string } & Record<string, unknown>): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}

/**
 * Mirrors `SelectionEditControls`: the controller routes curator gestures to
 * the state through `begin`/`abort`/`create`/`update` events, and disabling
 * aborts an in-progress gesture.
 */
export function createFakeSelectionController(): FakeSelectionController {
  let disabled = false;
  const controller = Object.assign(new THREE.EventDispatcher<any>(), {
    curators: {
      polygon: createFakeCurator("polygon"),
      box: createFakeCurator("box"),
      lasso: createFakeCurator("lasso"),
      brush: createFakeCurator("brush"),
    },
    camera: null,
    pcdUtils: null,
    editMode: "add" as const,
    hasSelection: false,
    selectedObj: null as any,
    startPointCoords: [] as THREE.Vector3[],
    isCuratorDrawing: false,
    /** The points the active curator's query "returns" when a gesture
     * finishes through the curator itself (e.g. the `g` hotkey route),
     * mirroring how `SelectionEditControls` checkpoints the queried
     * points on the curator's end event. */
    queriedPoints: [] as THREE.Vector3[],
    select: vi.fn((obj: any) => {
      // Mirrors `SelectionEditControls.select`: replaces the current
      // selection, capturing the selection data an abort must restore.
      if (controller.hasSelection) controller.deselect();
      controller.hasSelection = obj != null;
      controller.selectedObj = obj ?? null;
      controller.startPointCoords = obj != null ? [...obj.pointCoords] : [];
    }),
    deselect: vi.fn(() => {
      if (!controller.hasSelection) return;
      controller.abort();
      controller.hasSelection = false;
      controller.selectedObj = null;
    }),
    abort: vi.fn(() => {
      const wasActive = controller.isCuratorDrawing || controller.hasSelection;
      controller.isCuratorDrawing = false;
      for (const curator of Object.values(controller.curators))
        curator.isCreating = false;
      // Mirrors `SelectionEditControls.abort`: the selection data
      // captured at the start of the edit is restored (a transient
      // rollback that creates no operation).
      if (
        controller.hasSelection &&
        typeof controller.selectedObj?.getSelection === "function"
      ) {
        controller.selectedObj.getSelection().pointCoords =
          controller.startPointCoords;
      }
      if (wasActive)
        controller.dispatchEvent({
          type: "abort",
          obj: controller.selectedObj ?? null,
        });
      return wasActive;
    }),
    /** Simulates the pointer stroke that starts a curator gesture. */
    startGesture: vi.fn((toolType: string) => {
      if (disabled) return false;
      const curator = controller.curators[toolType as "box"];
      if (!curator?.enabled) return false;
      curator.isCreating = true;
      controller.isCuratorDrawing = true;
      controller.dispatchEvent({
        type: "begin",
        obj: controller.selectedObj ?? null,
      });
      return true;
    }),
    /** Simulates the gesture finishing with the queried points. */
    finishGesture: vi.fn((pointCoords: THREE.Vector3[]) => {
      if (disabled || !controller.isCuratorDrawing) return false;
      controller.isCuratorDrawing = false;
      for (const curator of Object.values(controller.curators))
        curator.isCreating = false;
      if (controller.hasSelection) {
        // Mirrors `SelectionEditControls.#checkpoint` while editing:
        // the queried points checkpoint as an UPDATE of the selected
        // object, carrying the pre-gesture selection data.
        controller.dispatchEvent({
          type: "update",
          obj: controller.selectedObj,
          mode: controller.editMode,
          prevSelectionData: {
            pointCoords: [...controller.startPointCoords],
          },
          newSelectionData: { pointCoords },
        });
      } else {
        controller.dispatchEvent({
          type: "create",
          newSelectionData: { pointCoords },
        });
      }
      return true;
    }),
  }) as unknown as FakeSelectionController;
  // Mirrors `SelectionEditControls`: when a curator finishes on its own
  // (the pointer-up or `g` hotkey route, as opposed to `finishGesture`),
  // the controller checkpoints the queried points as a create event. The
  // curator clears its own creating state before dispatching `end`, so a
  // racing second finish finds no gesture in progress.
  for (const curator of Object.values(controller.curators)) {
    curator.addEventListener("end", () => {
      if (disabled || !controller.isCuratorDrawing) return;
      controller.isCuratorDrawing = false;
      for (const c of Object.values(controller.curators)) c.isCreating = false;
      controller.dispatchEvent({
        type: "create",
        newSelectionData: {
          pointCoords: [...controller.queriedPoints],
        },
      });
    });
  }
  Object.defineProperty(controller, "disabled", {
    configurable: true,
    enumerable: true,
    get: () => disabled,
    set: (value: boolean) => {
      if (disabled === value) return;
      disabled = value;
      if (disabled) controller.abort();
    },
  });
  // `Object.assign` would invoke getters while copying, before `controller`
  // is initialized, so define the derived flags after construction.
  Object.defineProperty(controller, "isCreating", {
    configurable: true,
    enumerable: true,
    get: () =>
      !controller.hasSelection && !disabled && controller.isCuratorDrawing,
  });
  Object.defineProperty(controller, "isEditing", {
    configurable: true,
    enumerable: true,
    get: () => controller.hasSelection && !disabled,
  });
  Object.defineProperty(controller, "activateCurator", {
    configurable: true,
    enumerable: true,
    get: () =>
      Object.values(controller.curators).find((curator) => curator.enabled) ??
      null,
  });
  return controller;
}

export interface InteractContextFixture {
  context: InteractContext<any>;
  dataView: FakeSegmentationLabelsView;
  mainWindow: any;
  sceneContext: any;
  selectionController: ReturnType<typeof createFakeSelectionController>;
  assistedSelectionController: any;
  selectionSelector: any;
  /** Models the layer's source (point cloud) data readiness. */
  setPointCloudUtils(utils: unknown): void;
  /** The gate `SegmentationLayer` applies on load/activation events: the
   * layer is interactive only when it is active and both its label data
   * and its source data (the point cloud utils) are ready. */
  applyLayerGate(isActive: boolean): void;
  key(keyCombo: string): void;
}

/**
 * Builds a real `InteractContext` over fakes, mirroring how
 * `SegmentationLayer` constructs and gates it: the state machine starts
 * disabled, and the layer's load/activation handlers are modeled by
 * {@link applyLayerGate}.
 */
export function createInteractContextFixture(): InteractContextFixture {
  const dataView = new FakeSegmentationLabelsView();
  const mainWindow = Object.assign(new THREE.EventDispatcher(), {
    dom: document.createElement("div"),
    viewMode: "3D" as const,
    enableCameraControls: true,
    camera2D: new THREE.OrthographicCamera(),
    camera3D: new THREE.PerspectiveCamera(),
  });
  const sceneContext = {
    display: { windows: { main: mainWindow } },
    config: EDITOR_CONFIG,
    currentFrame: {
      id: FRAME_ID,
      getTimestampCenter: () => FRAME_TIMESTAMP,
      containsTimestamp: () => true,
    },
    displayFrameFromCurrent: vi.fn().mockResolvedValue(undefined),
  };
  const selectionController = createFakeSelectionController();
  const assistedSelectionController = Object.assign(
    new THREE.EventDispatcher(),
    {
      disabled: true,
      isCreating: false,
      isEditing: false,
      pointPrompter: { enabled: false },
      select: vi.fn(),
      deselect: vi.fn(),
      abort: vi.fn(),
      markPredictionAvailable: vi.fn(),
    },
  );
  const selectionSelector = Object.assign(new THREE.EventDispatcher(), {
    hoverEnabled: false,
    selectEnabled: false,
    selectedObj: null,
  });
  const context = new InteractContext({
    sceneContext: sceneContext as any,
    dataView: dataView as any,
    pointCloudUtils: null,
    canvas: document.createElement("canvas"),
    selectionController: selectionController as any,
    assistedSelectionController: assistedSelectionController as any,
    selectionSelector: selectionSelector as any,
    selectionMonitor: { selection: null } as any,
    autoInstances: true,
  });

  const setPointCloudUtils = (utils: unknown): void => {
    context.pointCloudUtils = utils as any;
  };

  const applyLayerGate = (isActive: boolean): void => {
    context.layerIsActive = isActive;
    context.disabled = shouldDisableSegmentationInteraction(
      isActive,
      dataView.data,
      context.pointCloudUtils,
    );
  };

  const key = (keyCombo: string): void => {
    context.currentState?.keydownHandler.handle({ keyCombo } as any);
  };

  // The layer starts the state machine disabled (no data loaded yet).
  context.disabled = true;

  return {
    context,
    dataView,
    mainWindow,
    sceneContext,
    selectionController,
    assistedSelectionController,
    selectionSelector,
    setPointCloudUtils,
    applyLayerGate,
    key,
  };
}
