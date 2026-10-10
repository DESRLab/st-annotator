/**
 * The read-only projection probe exposed to fixture-backed Playwright e2e
 * tests.
 *
 * The probe projects stable scene targets (contributed points, interaction objects,
 * known world points) into page (CSS-pixel) coordinates so Playwright can
 * send real mouse gestures at them. It only reads Object3D transforms and
 * the active camera; it never mutates editor state.
 *
 * The probe exists ONLY when `VITE_STA_E2E_PROBE` is set, which only
 * happens for the fixture-backed with-data Playwright environment
 * (`tests/playwright.with-data.config.ts`). With the flag absent there is
 * zero exposure and no behavior change.
 */
import * as THREE from "three";

import { ThreeUtils } from "sta/common";

import { isEditorE2EProbeTargetsContributor } from "./e2eProbeContributors";
import type { EditorE2EProbeTargetsContributor } from "./e2eProbeContributors";
import type { SceneContext } from "./scene/SceneContext";
import type { MainWindow } from "./scene/display/MainWindow.tsx";
import { isE2EProbeEnabled } from "./e2eProbeEnabled";

/** A point in viewport coordinates (CSS pixels relative to the viewport origin), as consumed by Playwright's `page.mouse`. */
export interface E2EProbeViewportPoint {
  x: number;
  y: number;
}

/** A database-space point, as stored by the backend. */
export interface E2EProbeDbPoint {
  x: number;
  y: number;
  z: number;
}

/** A target supplied by an editor-layer contributor. */
export interface E2EProbeLabelTarget {
  layer: string;
  id: string;
  /** Optional contributor-defined point index within the target. */
  index?: number;
}

/**
 * An interaction target the probe can project for a layer's active selection.
 */
export interface E2EProbeTransformTarget {
  layer: string;
  mode: string;
  /** Optional contributor-defined handle index. */
  index?: number;
}

/** A scene layer whose interaction state the probe can inspect. */
export interface E2EProbeLayerTarget {
  layer: string;
}

/**
 * The read-only projection probe API exposed on `window.__STA_E2E_PROBE__`.
 *
 * All returned coordinates are viewport-space (the main window rect origin,
 * no scroll offset), ready for `page.mouse`. Methods return `null`
 * when the requested target does not exist in the live scene (no active
 * selection, unknown target id, or index out of range).
 */
export interface StaE2EProbe {
  /** Reports demand-render scheduler state for deterministic visual tests. */
  getRenderState(): { generation: number; pending: boolean };
  /** Projects a contributed target into viewport coordinates, or `null` if absent. */
  projectLabelPoint(target: E2EProbeLabelTarget): E2EProbeViewportPoint | null;
  /** Projects an active interaction target into viewport coordinates, or `null` if absent. */
  projectTransformHandle(
    target: E2EProbeTransformTarget,
  ): E2EProbeViewportPoint | null;
  /** Converts a database-space point to world coordinates and projects it into viewport coordinates. */
  projectWorldPoint(dbPoint: E2EProbeDbPoint): E2EProbeViewportPoint;
  /**
   * Gets the id of the target the layer's selector currently reports as
   * hovered, or `null` when nothing is hovered. Read-only; proves that a
   * real pointer gesture was routed to a particular rendered target.
   */
  getHoveredLabel(target: E2EProbeLayerTarget): string | null;
  /**
   * Diagnostic: raycasts the layer's selector groups with the ray a real
   * pointer at `viewportPoint` would produce (same camera/rect math as
   * `ThreeUtils.updateRaycaster`). Returns the candidate object count and
   * the closest hit id, distinguishing "ray misses / empty group" from
   * "pointer events never reached the selector".
   */
  raycastSelector(
    target: E2EProbeLayerTarget,
    viewportPoint: E2EProbeViewportPoint,
  ): E2EProbeRaycastResult | null;
  /**
   * Diagnostic: reports whether hover is enabled on the layer's selector
   * and the ray its raycaster currently carries (every pointer event that
   * reaches the selector refreshes it). A stale ray proves the pointer
   * events never arrived; `hoverEnabled: false` proves they were ignored.
   */
  getSelectorState(target: E2EProbeLayerTarget): E2EProbeSelectorState | null;
}

/** Candidate count and closest hit id of a selector raycast. */
export interface E2EProbeRaycastResult {
  count: number;
  hitId: string | null;
}

/** The layer's live selector hover state (plain data for `page.evaluate`). */
export interface E2EProbeSelectorState {
  hoverEnabled: boolean;
  ray: {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  };
}

declare global {
  interface Window {
    /**
     * The live editor e2e probe. Only defined when the editor runs
     * with `VITE_STA_E2E_PROBE` set (the with-data Playwright
     * environment); see `e2eProbe.ts`.
     */
    __STA_E2E_PROBE__?: StaE2EProbe;
  }
}

/** The window mapper surface the probe projects against. */
// A type alias, not an interface: the alias's implicit string index
// signature is what lets `WM extends ProbeWindowMapper` satisfy the
// WindowMapper (Record<string, SceneWindow>) constraint of SceneContext.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ProbeWindowMapper = { main: MainWindow };

/**
 * Projects a world-space point into viewport coordinates of the main window,
 * mirroring the tooltip projection path: project into NDC with the active
 * camera, convert to relative window coordinates, then scale by the main
 * window rect. No scroll offset is applied: Playwright's `page.mouse`
 * coordinates and `getBoundingClientRect` are both viewport-relative.
 */
function projectToViewportPoint(
  worldPoint: Readonly<THREE.Vector3>,
  mainWindow: MainWindow,
): E2EProbeViewportPoint {
  const ndc = worldPoint.clone().project(mainWindow.getCamera());
  const relPos = ThreeUtils.getNDCRelPos(ndc);

  const rect = mainWindow.dom.getBoundingClientRect();
  return {
    x: rect.left + relPos.x * rect.width,
    y: rect.top + relPos.y * rect.height,
  };
}

/**
 * The probe implementation. Discovers the layers contributing probe
 * targets structurally ({@link isEditorE2EProbeTargetsContributor}), so
 * the composition root stays plugin-agnostic.
 */
class EditorE2EProbe<WM extends ProbeWindowMapper> implements StaE2EProbe {
  readonly #context: SceneContext<WM>;

  readonly #contributors: Readonly<
    Record<string, EditorE2EProbeTargetsContributor>
  >;

  readonly #renderSource: {
    readonly renderGeneration: number;
    readonly isRenderPending: boolean;
  };

  constructor(
    context: SceneContext<WM>,
    layersByKey: Readonly<Record<string, unknown>>,
    renderSource: {
      readonly renderGeneration: number;
      readonly isRenderPending: boolean;
    },
  ) {
    this.#context = context;
    this.#renderSource = renderSource;

    const contributors: Record<string, EditorE2EProbeTargetsContributor> = {};
    for (const [key, layer] of Object.entries(layersByKey)) {
      if (isEditorE2EProbeTargetsContributor(layer)) contributors[key] = layer;
    }
    this.#contributors = contributors;
  }

  get #mainWindow(): MainWindow {
    return this.#context.display.windows.main;
  }

  getRenderState(): { generation: number; pending: boolean } {
    return {
      generation: this.#renderSource.renderGeneration,
      pending: this.#renderSource.isRenderPending,
    };
  }

  projectLabelPoint(target: E2EProbeLabelTarget): E2EProbeViewportPoint | null {
    const contributor = this.#contributors[target.layer];
    if (contributor == null) return null;

    const worldPoint = contributor.getE2EProbeLabelPoint(
      target.id,
      target.index ?? null,
    );
    if (worldPoint == null) return null;

    return projectToViewportPoint(worldPoint, this.#mainWindow);
  }

  projectTransformHandle(
    target: E2EProbeTransformTarget,
  ): E2EProbeViewportPoint | null {
    const contributor = this.#contributors[target.layer];
    if (contributor == null) return null;

    const handle = contributor.getE2EProbeTransformHandle(
      target.mode,
      target.index ?? null,
    );
    if (handle == null) return null;

    return projectToViewportPoint(
      handle.getWorldPosition(new THREE.Vector3()),
      this.#mainWindow,
    );
  }

  projectWorldPoint(dbPoint: E2EProbeDbPoint): E2EProbeViewportPoint {
    const worldPoint = this.#context.config.coordinateFormat.toThreeJSCoords(
      new THREE.Vector3(dbPoint.x, dbPoint.y, dbPoint.z),
    );
    return projectToViewportPoint(worldPoint, this.#mainWindow);
  }

  getHoveredLabel(target: E2EProbeLayerTarget): string | null {
    const contributor = this.#contributors[target.layer];
    if (contributor == null) return null;

    return contributor.getE2EProbeHoveredLabel();
  }

  raycastSelector(
    target: E2EProbeLayerTarget,
    viewportPoint: E2EProbeViewportPoint,
  ): E2EProbeRaycastResult | null {
    const contributor = this.#contributors[target.layer];
    if (contributor == null) return null;

    return contributor.getE2EProbeSelectorRaycast(
      this.#viewportPointToRaycaster(viewportPoint),
    );
  }

  getSelectorState(target: E2EProbeLayerTarget): E2EProbeSelectorState | null {
    const contributor = this.#contributors[target.layer];
    if (contributor == null) return null;

    const state = contributor.getE2EProbeSelectorState();
    if (state == null) return null;

    return {
      hoverEnabled: state.hoverEnabled,
      ray: {
        origin: {
          x: state.ray.origin.x,
          y: state.ray.origin.y,
          z: state.ray.origin.z,
        },
        direction: {
          x: state.ray.direction.x,
          y: state.ray.direction.y,
          z: state.ray.direction.z,
        },
      },
    };
  }

  /**
   * Builds the raycaster a real pointer at `viewportPoint` would produce,
   * mirroring `ThreeUtils.getPointerNDC`/`updateRaycaster` exactly (the
   * inverse of {@link projectToViewportPoint}). No scroll offset: both
   * `page.mouse` coordinates and `getBoundingClientRect` are
   * viewport-relative.
   */
  #viewportPointToRaycaster(
    viewportPoint: E2EProbeViewportPoint,
  ): THREE.Raycaster {
    const rect = this.#mainWindow.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((viewportPoint.x - rect.left) / rect.width) * 2 - 1,
      -(((viewportPoint.y - rect.top) / rect.height) * 2 - 1),
    );

    const raycaster = new THREE.Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(raycaster, 0.25);
    ThreeUtils.setRaycasterLineThreshold(raycaster, 0.25);
    raycaster.setFromCamera(ndc, this.#mainWindow.getCamera());
    return raycaster;
  }
}

/**
 * Creates the e2e probe for a runtime, or `null` when the probe is not
 * enabled through the environment (its only call site passes the result
 * to the runtime, which attaches it on `window` once ready).
 */
export function createE2EProbe<WM extends ProbeWindowMapper>(
  context: SceneContext<WM>,
  layersByKey: Readonly<Record<string, unknown>>,
  renderSource: {
    readonly renderGeneration: number;
    readonly isRenderPending: boolean;
  },
): StaE2EProbe | null {
  if (!isE2EProbeEnabled()) return null;

  return new EditorE2EProbe(context, layersByKey, renderSource);
}

/** Exposes the probe to Playwright on `window.__STA_E2E_PROBE__`. */
export function attachE2EProbe(probe: StaE2EProbe): void {
  window.__STA_E2E_PROBE__ = probe;
}

/** Removes the probe from `window`, unless another probe replaced it. */
export function detachE2EProbe(probe: StaE2EProbe): void {
  if (window.__STA_E2E_PROBE__ === probe) delete window.__STA_E2E_PROBE__;
}
