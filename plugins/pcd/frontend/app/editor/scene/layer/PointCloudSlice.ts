import type {
  ColorBlenderPaneControllerParams,
  ViewMode,
} from "sta/app/editor";

import type {
  MainCameraSettingsPaneControllerParams,
  PointCloudSettingsInputtedData,
} from "../widgets";

/**
 * The plain editor-state slice of the point cloud plugin, merged into the
 * snapshot under `layers.pcd`.
 */
export interface PointCloudSlice {
  readonly camera: {
    /** The view mode rendered by the main window. */
    readonly viewMode: ViewMode;
    /** `true` while the camera orbits the point under the cursor. */
    readonly orbitPoint: boolean;
  };
  /** The committed state of the point cloud settings pane. */
  readonly settings: {
    /** The committed settings values edited by the pane. */
    readonly values: PointCloudSettingsInputtedData;
    /** `true` while the pane is disabled (data loading / no data). */
    readonly disabled: boolean;
    /**
     * The plain color blender target of the loaded point cloud, or
     * `null` while no data is loaded. Never the model owning the
     * `three.js` objects.
     */
    readonly target: ColorBlenderPaneControllerParams["internalData"];
  };
}

/**
 * The narrow interaction state the slice is mapped from.
 *
 * Kept structural and plain so the mapping is unit-testable without
 * constructing the layer (which needs a live scene context).
 *
 * `orbitPoint` is derived from the main window's orbit-target override:
 * the main camera settings are the only writer of that override, so
 * "an override is installed" and "orbit point is on" are equivalent.
 */
export interface PointCloudSliceInput {
  readonly viewMode: ViewMode;
  readonly orbitPoint: boolean;
  readonly settings: PointCloudSlice["settings"];
}

/**
 * Maps the point cloud camera/settings state to its plain slice, reusing
 * `previous` when nothing changed (structural sharing).
 */
export function mapPointCloudSlice(
  input: PointCloudSliceInput,
  previous: PointCloudSlice | null,
): PointCloudSlice {
  const camera = {
    viewMode: input.viewMode,
    orbitPoint: input.orbitPoint,
  };

  const previousCamera = previous?.camera;
  const nextCamera =
    previousCamera?.viewMode === camera.viewMode &&
    previousCamera?.orbitPoint === camera.orbitPoint
      ? previousCamera
      : camera;

  const settings = input.settings;
  const previousSettings = previous?.settings;
  const nextSettings =
    previousSettings?.values === settings.values &&
    previousSettings?.disabled === settings.disabled &&
    previousSettings?.target === settings.target
      ? previousSettings
      : settings;

  if (previous?.camera === nextCamera && previous?.settings === nextSettings) {
    return previous;
  }

  return { camera: nextCamera, settings: nextSettings };
}

/**
 * The editor intents of the point cloud plugin, merged into the editor
 * intents under `pcd` by the composition root.
 *
 * Every intent runs through the existing imperative APIs (layer settings
 * handler, main camera preferences menu), which mutate and notify
 * synchronously, so the slice contributor invalidates the snapshot in the
 * same dispatch.
 */
export interface PointCloudIntents {
  /** Applies new settings values to the layer. */
  setSettings(values: PointCloudSettingsInputtedData): void;
  /** Applies main camera settings (view mode / orbit point). */
  setCameraSettings(
    change: Partial<MainCameraSettingsPaneControllerParams["inputtedData"]>,
  ): void;
}

/** The plugin slice merge of the point cloud plugin into `EditorState`. */
export interface PointCloudPluginSlices {
  readonly pcd: PointCloudSlice;
}

/** The plugin intent merge of the point cloud plugin into `EditorIntents`. */
export interface PointCloudPluginIntents {
  readonly pcd: PointCloudIntents;
}
