import * as THREE from "three";
import { vi } from "vitest";

import {
  EditorConfig,
  VanillaEventDispatcher,
  ProjectConfig,
} from "sta/app/editor";
import { Timestamp } from "sta/common";

import { LabelVector } from "../../../../../app/editor/scene/data/LabelVector";
import { InteractContext } from "../../../../../app/editor/scene/layer/InteractContext";
import { shouldDisableVectorInteraction } from "../../../../../app/editor/scene/layer/InteractionGate";
import { VectorType } from "../../../../../models";

export const EDITOR_CONFIG = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 4 }),
);
export const FRAME_TIMESTAMP = new Timestamp("2026-08-15T12:00:00Z");

/** A loaded labels index; its events drive the inspector render signaller. */
export function createLoadedIndex(): unknown {
  return new THREE.EventDispatcher();
}

export function createVectorFixture(
  overrides: {
    id?: string;
    timestamp?: Timestamp | null;
    vectorType?: string;
  } = {},
): any {
  return {
    id: overrides.id ?? "vector-1",
    vectorType: overrides.vectorType ?? "polyline",
    timestamp:
      overrides.timestamp === undefined ? FRAME_TIMESTAMP : overrides.timestamp,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ],
    gtClassId: null,
    gtClass: null,
  };
}

/**
 * A real `LabelVector`, for flows that run the label model's own logic
 * (the transform checkpoint projects `vertices` through the coordinate
 * format of the label's config).
 */
export function createLabelVectorFixture(
  overrides: {
    id?: string;
    timestamp?: Timestamp | null;
  } = {},
): LabelVector {
  return new LabelVector({
    config: EDITOR_CONFIG,
    labels: null,
    id: overrides.id ?? "vector-1",
    vectorType: VectorType.POLYLINE,
    vertices: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)],
    timestamp:
      overrides.timestamp === undefined ? FRAME_TIMESTAMP : overrides.timestamp,
  });
}

/**
 * A fake labels view satisfying the surfaces consumed by the interaction
 * context and its inspector, plus the creation APIs of the draw state.
 */
export class FakeVectorLabelsView extends VanillaEventDispatcher {
  data: unknown = null;
  classes = new Map<number, { id: number; name: string }>();
  vectors = new Map<string, any>();
  localVectors = new Set<any>();
  #nextId = 0;

  /** The load events of the real view are driven by the base data view. */
  readonly context = new THREE.EventDispatcher();

  iterLabelClasses() {
    return this.classes.values();
  }
  iterLabelVectors() {
    return this.vectors.values();
  }
  hasLabelVector(id: string) {
    return this.vectors.has(id);
  }
  getLabelVector(id: string) {
    return this.vectors.get(id);
  }
  getLabelClass(id: number) {
    return this.classes.get(id);
  }

  addLabelVectorLocalOnly = vi.fn((params: any) => {
    const vector = { ...params };
    this.localVectors.add(vector);
    return vector;
  });

  deleteLabelVectorLocalOnly = vi.fn((vector: any) => {
    this.localVectors.delete(vector);
  });

  addLabelVector = vi.fn(async (vector: any) => {
    const registered = createVectorFixture({
      id: `registered-vector-${(this.#nextId += 1)}`,
      timestamp: vector.timestamp,
      vectorType: vector.vectorType,
    });
    this.vectors.set(registered.id, registered);
    return registered;
  });

  deleteLabelVector = vi.fn();

  updateLabelVectorGtClass = vi.fn(async () => {});
  updateLabelVectorGeometry = vi.fn(async () => {});
}

/** Mirrors `VectorCreator`: disabling aborts an in-progress creation. */
export function createFakeVectorCreator(vectorType: string) {
  let enabled = false;
  const pcdObj: unknown = null;
  const creator = Object.assign(new THREE.EventDispatcher<any>(), {
    vectorType,
    isCreating: false,
    vertices: [] as THREE.Vector3[],
    pcdObj,
    /** Simulates a pointer-down that adds a vertex while enabled. */
    addVertex: vi.fn((vertex: THREE.Vector3) => {
      if (!enabled) return false;
      const stage = creator.isCreating ? "resume" : "begin";
      creator.isCreating = true;
      creator.vertices = [...creator.vertices, vertex];
      creator.dispatchEvent({ type: stage, vertices: creator.vertices });
      return true;
    }),
    finish: vi.fn(() => {
      if (!enabled || !creator.isCreating) return false;
      const vertices = creator.vertices;
      creator.isCreating = false;
      creator.vertices = [];
      creator.dispatchEvent({ type: "end", vertices });
      return true;
    }),
    abort: vi.fn(() => {
      if (!creator.isCreating) return false;
      creator.isCreating = false;
      creator.vertices = [];
      creator.dispatchEvent({ type: "abort", vertices: [] });
      return true;
    }),
  });
  // `Object.assign` would copy accessors by value, so define the flag with
  // `defineProperty` to keep the getter/setter (and abort-on-disable) live.
  Object.defineProperty(creator, "enabled", {
    configurable: true,
    enumerable: true,
    get: () => enabled,
    set: (value: boolean) => {
      if (enabled === value) return;
      enabled = value;
      if (!enabled) creator.abort();
    },
  });
  return creator as typeof creator & { enabled: boolean };
}

export type FakeVectorCreator = ReturnType<typeof createFakeVectorCreator>;

/**
 * Mirrors `VectorTransformer`: the gizmo keeps a selection, a gizmo drag
 * is a begin/checkpoint pair, and disabling or deselecting while a drag is
 * in progress aborts it (rolling the vertices back without a history
 * operation).
 */
export function createFakeVectorTransformer() {
  let disabled = true;

  /** The vertices captured at (re)selection, replayed as `prevTransform`
   * on checkpoints, like the real gizmo's `#startTransform`. */
  const startTransformOf = (vector: any) => ({
    vectorCoords: [...vector.vectorCoords],
  });

  const transformer = Object.assign(new THREE.EventDispatcher<any>(), {
    hasSelection: false,
    selectedObj: null as any,
    isTransforming: false,
    disableMoveXZ: false,
    disableMoveY: false,
    select: vi.fn((vector: any) => {
      if (transformer.hasSelection) transformer.deselect();
      transformer.hasSelection = true;
      transformer.selectedObj = vector;
    }),
    deselect: vi.fn(() => {
      if (!transformer.hasSelection) return;
      transformer.abort();
      transformer.hasSelection = false;
      transformer.selectedObj = null;
    }),
    abort: vi.fn(() => {
      if (!transformer.isTransforming) return;
      transformer.isTransforming = false;
      transformer.dispatchEvent({
        type: "abort",
        obj: transformer.selectedObj,
      });
    }),
    /** Simulates the gizmo pointer-down that starts a drag. */
    beginTransform: vi.fn(() => {
      if (disabled || !transformer.hasSelection || transformer.isTransforming)
        return false;
      transformer.isTransforming = true;
      transformer.dispatchEvent({
        type: "begin",
        obj: transformer.selectedObj,
      });
      return true;
    }),
    /** Simulates the gizmo pointer-up that checkpoints a drag. */
    endTransform: vi.fn(() => {
      if (disabled || !transformer.isTransforming) return false;
      transformer.isTransforming = false;
      transformer.dispatchEvent({
        type: "checkpoint",
        mode: "vertex",
        obj: transformer.selectedObj,
        prevTransform: startTransformOf(transformer.selectedObj),
      });
      return true;
    }),
  });
  // `Object.assign` would copy accessors by value, so define the flag with
  // `defineProperty` to keep the getter/setter (and abort-on-disable) live.
  Object.defineProperty(transformer, "disabled", {
    configurable: true,
    enumerable: true,
    get: () => disabled,
    set: (value: boolean) => {
      if (disabled === value) return;
      disabled = value;
      if (disabled) transformer.abort();
    },
  });
  return transformer as typeof transformer & { disabled: boolean };
}

export interface InteractContextFixture {
  context: InteractContext<any>;
  dataView: FakeVectorLabelsView;
  mainWindow: any;
  sceneContext: any;
  vectorCreators: Record<"polygon" | "polyline" | "point", FakeVectorCreator>;
  vectorSelector: any;
  vectorTransformer: ReturnType<typeof createFakeVectorTransformer>;
  /** Models the layer's source (point cloud) data readiness. */
  setSourceData(data: unknown): void;
  /** The gate `VectorLayer` applies on load/activation events: the layer
   * is interactive only when it is active and both its label data and its
   * source data are ready. */
  applyLayerGate(isActive: boolean): void;
  key(keyCombo: string): void;
}

/**
 * Builds a real `InteractContext` over fakes, mirroring how `VectorLayer`
 * constructs and gates it: the state machine starts disabled, and the
 * layer's load/activation handlers are modeled by {@link applyLayerGate}.
 */
export function createInteractContextFixture(): InteractContextFixture {
  const dataView = new FakeVectorLabelsView();
  const mainWindow = Object.assign(new THREE.EventDispatcher(), {
    dom: document.createElement("div"),
    viewMode: "3D" as const,
    enableCameraControls: true,
  });
  const sceneContext = {
    display: { windows: { main: mainWindow } },
    config: EDITOR_CONFIG,
    currentFrame: {
      getTimestampCenter: () => FRAME_TIMESTAMP,
      containsTimestamp: () => true,
    },
    displayFrameFromCurrent: vi.fn().mockResolvedValue(undefined),
  };
  const vectorCreators = {
    polygon: createFakeVectorCreator("polygon"),
    polyline: createFakeVectorCreator("polyline"),
    point: createFakeVectorCreator("point"),
  };
  const vectorSelector = Object.assign(new THREE.EventDispatcher(), {
    hoverEnabled: false,
    selectEnabled: false,
    selectedObj: null,
  });
  const vectorTransformer = createFakeVectorTransformer();
  const context = new InteractContext({
    sceneContext: sceneContext as any,
    dataView: dataView as any,
    canvas: document.createElement("canvas"),
    vectorCreators: vectorCreators as any,
    vectorSelector: vectorSelector as any,
    vectorTransformer: vectorTransformer as any,
    vectorMonitor: { vector: null } as any,
    vectorClipboard: Object.assign(new THREE.EventDispatcher(), {
      disabled: true,
      select: vi.fn(),
      deselect: vi.fn(),
    }) as any,
  });

  let sourceData: unknown = null;
  const setSourceData = (data: unknown): void => {
    sourceData = data;
  };

  const applyLayerGate = (isActive: boolean): void => {
    context.layerIsActive = isActive;
    context.disabled = shouldDisableVectorInteraction(
      isActive,
      dataView.data,
      sourceData,
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
    vectorCreators,
    vectorSelector,
    vectorTransformer,
    setSourceData,
    applyLayerGate,
    key,
  };
}
