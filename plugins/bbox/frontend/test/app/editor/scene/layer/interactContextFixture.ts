import * as THREE from "three";
import { vi } from "vitest";

import {
  EditorConfig,
  VanillaEventDispatcher,
  ProjectConfig,
} from "sta/app/editor";
import { Timestamp } from "sta/common";

import type { ReadonlyLabelBox } from "../../../../../app/editor/scene/data";
import { LabelBox } from "../../../../../app/editor/scene/data/LabelBox";
import { InteractContext } from "../../../../../app/editor/scene/layer/InteractContext";
import { shouldDisableBBoxInteraction } from "../../../../../app/editor/scene/layer/InteractionGate";

export const EDITOR_CONFIG = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 4 }),
);
export const FRAME_TIMESTAMP = new Timestamp("2026-08-15T12:00:00Z");

/** A loaded labels index; its events drive the inspector render signaller. */
export function createLoadedIndex(): unknown {
  return new THREE.EventDispatcher();
}

export function createLabelBoxFixture(
  overrides: {
    id?: string;
    timestamp?: Timestamp | null;
    entityId?: string | null;
  } = {},
): ReadonlyLabelBox {
  return new LabelBox({
    config: EDITOR_CONFIG,
    labels: null,
    id: overrides.id ?? "box-1",
    boxType: "cuboid",
    center: new THREE.Vector3(1, 2, 3),
    angle: 0.25,
    size: new THREE.Vector3(4, 5, 6),
    timestamp:
      overrides.timestamp === undefined ? FRAME_TIMESTAMP : overrides.timestamp,
    entityId: overrides.entityId ?? null,
  });
}

/**
 * A fake labels view satisfying the surfaces consumed by the interaction
 * context and its inspectors, plus the creation APIs of the draw state.
 */
export class FakeBBoxLabelsView extends VanillaEventDispatcher {
  data: unknown = null;
  classes = new Map<number, { id: number; name: string }>();
  tracks = new Map<string, any>();
  boxes = new Map<string, any>();
  localTracks = new Map<string, any>();
  #nextId = 0;

  /** The load events of the real view are driven by the base data view. */
  readonly context = new THREE.EventDispatcher();

  iterLabelClasses() {
    return this.classes.values();
  }
  iterLabelTracks() {
    return this.tracks.values();
  }
  iterLabelBoxes() {
    return this.boxes.values();
  }
  hasLabelClass(id: number) {
    return this.classes.has(id);
  }
  getLabelClass(id: number) {
    return this.classes.get(id);
  }
  hasLabelTrack(id: string) {
    return this.tracks.has(id);
  }
  getLabelTrack(id: string) {
    return this.tracks.get(id);
  }
  hasLabelBox(id: string) {
    return this.boxes.has(id);
  }
  getLabelBox(id: string) {
    return this.boxes.get(id);
  }

  addLabelTrackLocalOnly = vi.fn((params: any) => {
    const track = {
      id: params.id,
      gtClassId: params.gtClassId ?? null,
      isBlack: params.isBlack ?? false,
    };
    this.localTracks.set(track.id, track);
    return track;
  });

  hasLabelTrackLocalOnly = (id: string) => this.localTracks.has(id);
  getLabelTrackLocalOnly = (id: string) => this.localTracks.get(id);

  deleteLabelTrackLocalOnly = vi.fn((track: any) => {
    this.localTracks.delete(track.id);
  });

  addLabelBoxLocalOnly = vi.fn((params: any): ReadonlyLabelBox => {
    return new LabelBox({ config: EDITOR_CONFIG, labels: null, ...params });
  });

  deleteLabelBoxLocalOnly = vi.fn();

  addLabelTrack = vi.fn(async (params: any) => {
    const track = {
      id: `registered-track-${(this.#nextId += 1)}`,
      gtClassId: params.gtClassId ?? null,
      isBlack: params.isBlack ?? false,
    };
    this.tracks.set(track.id, track);
    return track;
  });

  addLabelBox = vi.fn(async (box: any) => {
    const id = `registered-box-${(this.#nextId += 1)}`;
    const registered = new LabelBox({
      config: EDITOR_CONFIG,
      labels: null,
      id,
      boxType: box.boxType,
      center: box.center,
      angle: box.angle,
      size: box.size,
      timestamp: box.timestamp,
      entityId: box.entityId,
    });
    this.boxes.set(id, registered);
    return registered;
  });

  deleteLabelBox = vi.fn();

  updateLabelBoxTransform = vi.fn(async () => {});
  updateLabelBoxType = vi.fn(async () => {});
  updateLabelBoxParentTrack = vi.fn(async () => {});
  updateLabelBoxPerceivedClass = vi.fn(async () => {});
  updateLabelBoxDistinctiveLv = vi.fn(async () => {});
  updateLabelBoxOcclusionLv = vi.fn(async () => {});
  updateLabelTrackGtClass = vi.fn(async () => {});
  updateLabelTrackIsBlack = vi.fn(async () => {});
}

/** Mirrors `LabelBoxCreator`: disabling aborts an in-progress creation. */
export function createFakeBoxCreator() {
  let disabled = false;
  const creator = Object.assign(new THREE.EventDispatcher<any>(), {
    isCreating: false,
    isSizeFixed: false,
    raycaster: new THREE.Raycaster(),
    groundMesh: null as {
      raycast: () => { point: THREE.Vector3 }[];
    } | null,
    pcd: null as any,
    currentBox: null as any,
    begin: vi.fn((mode: string, box: unknown) => {
      // Mirrors `LabelBoxCreator.begin`: a no-op while a box is
      // already being created, so a duplicate pointer-down cannot
      // replace the draft under creation.
      if (disabled || creator.isCreating) return false;
      creator.isCreating = true;
      creator.currentBox = box;
      creator.dispatchEvent({ type: "begin", box });
      return true;
    }),
    end: vi.fn((applyDefaultSize: boolean) => {
      if (disabled || !creator.isCreating) return false;
      creator.isCreating = false;
      creator.dispatchEvent({
        type: "end",
        box: creator.currentBox,
        applyDefaultSize,
      });
      return true;
    }),
    abort: vi.fn(() => {
      if (!creator.isCreating) return false;
      creator.isCreating = false;
      creator.dispatchEvent({ type: "abort", box: creator.currentBox });
      return true;
    }),
    getPointerWorldPos: vi.fn(() => new THREE.Vector3()),
  });
  // `Object.assign` would copy accessors by value, so define the flag with
  // `defineProperty` to keep the getter/setter (and abort-on-disable) live.
  Object.defineProperty(creator, "disabled", {
    configurable: true,
    enumerable: true,
    get: () => disabled,
    set: (value: boolean) => {
      if (disabled === value) return;
      disabled = value;
      if (disabled && creator.isCreating) creator.abort();
    },
  });
  return creator as typeof creator & { disabled: boolean };
}

export type FakeBoxCreator = ReturnType<typeof createFakeBoxCreator>;

/**
 * Mirrors the gmesh `Transformer` used by `BBoxLayer`: the gizmo keeps a
 * selection, a gizmo drag is a begin/checkpoint pair, and disabling or
 * deselecting while a drag is in progress aborts it (restoring the object
 * without a history operation).
 */
export function createFakeBoxTransformer() {
  let disabled = true;

  /** The transform captured at (re)selection, replayed as `prevTransform`
   * on checkpoints, like the real gizmo's `#startTransform`. */
  const startTransformOf = (box: any) => ({
    position: box.center.clone(),
    rotation: new THREE.Euler(0, box.angle, 0),
    scale: box.size.clone(),
  });

  const transformer = Object.assign(new THREE.EventDispatcher<any>(), {
    hasSelection: false,
    selectedObj: null as any,
    isTransforming: false,
    disableMoveXZ: false,
    disableMoveResizeY: false,
    disablePlaneResize: false,
    select: vi.fn((box: any) => {
      if (transformer.hasSelection) transformer.deselect();
      transformer.hasSelection = true;
      transformer.selectedObj = box;
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
    rotateHeading: vi.fn(() => {
      // Mirrors `Transformer.rotateHeading`: a no-op while a drag is
      // in progress; otherwise checkpoints like a transform.
      if (!transformer.hasSelection || transformer.isTransforming) return;
      transformer.dispatchEvent({
        type: "checkpoint",
        mode: "rotate-heading",
        obj: transformer.selectedObj,
        prevTransform: startTransformOf(transformer.selectedObj),
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
        mode: "translate",
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
  dataView: FakeBBoxLabelsView;
  mainWindow: any;
  sceneContext: any;
  boxCreator: FakeBoxCreator;
  boxSelector: any;
  boxTransformer: ReturnType<typeof createFakeBoxTransformer>;
  /** Models the layer's source (point cloud) data readiness. */
  setSourceData(data: unknown): void;
  /** The gate `BBoxLayer` applies on load/activation events: the layer is
   * interactive only when it is active and both its label data and its
   * source data are ready. */
  applyLayerGate(isActive: boolean): void;
  pointerdown(button?: number): void;
  pointerup(button?: number): void;
  key(keyCombo: string): void;
}

/**
 * Builds a real `InteractContext` over fakes, mirroring how `BBoxLayer`
 * constructs and gates it: the state machine starts disabled, and the
 * layer's load/activation handlers are modeled by {@link applyLayerGate}.
 */
export function createInteractContextFixture(): InteractContextFixture {
  const dataView = new FakeBBoxLabelsView();
  const mainWindow = Object.assign(new THREE.EventDispatcher(), {
    dom: document.createElement("div"),
    pointerEvents: new THREE.EventDispatcher<any>(),
    viewMode: "3D" as const,
    enableCameraControls: true,
    getCamera: () => new THREE.PerspectiveCamera(),
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
  const boxCreator = createFakeBoxCreator();
  const boxSelector = Object.assign(new THREE.EventDispatcher(), {
    hoverEnabled: false,
    selectEnabled: false,
    isHoveringObj: false,
    hoveredObj: null as any,
    selectedObj: null as any,
  });
  const boxTransformer = createFakeBoxTransformer();
  const context = new InteractContext({
    sceneContext: sceneContext as any,
    dataView: dataView as any,
    boxCreator: boxCreator as any,
    boxSelector: boxSelector as any,
    boxTransformer: boxTransformer as any,
    boxMonitor: { box: null } as any,
    boxClipboard: Object.assign(new THREE.EventDispatcher(), {
      disabled: true,
      select: vi.fn(),
      deselect: vi.fn(),
    }) as any,
    autoTracks: false,
  });

  let sourceData: unknown = null;
  const setSourceData = (data: unknown): void => {
    sourceData = data;
  };

  const applyLayerGate = (isActive: boolean): void => {
    context.disabled = shouldDisableBBoxInteraction(
      isActive,
      dataView.data,
      sourceData,
    );
  };

  const pointerdown = (button = 0): void => {
    mainWindow.pointerEvents.dispatchEvent({
      type: "pointerdown",
      button,
    } as any);
  };
  const pointerup = (button = 0): void => {
    mainWindow.pointerEvents.dispatchEvent({
      type: "pointerup",
      button,
    } as any);
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
    boxCreator,
    boxSelector,
    boxTransformer,
    setSourceData,
    applyLayerGate,
    pointerdown,
    pointerup,
    key,
  };
}
