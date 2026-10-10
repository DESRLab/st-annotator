import type { ColorBlenderPaneControllerParams } from "sta/app/editor";

import type { GroundMeshSettingsInputtedData } from "../widgets";

/**
 * The plain editor-state slice of the ground mesh plugin, merged into the
 * snapshot under `layers.gmesh`.
 *
 * The layer tracks no interaction state (`ui` stays empty); mesh rendering
 * is asserted through pixel diffs in e2e. The committed settings-pane state
 * (wireframe / opacity / colormap) is mapped into `settings`.
 */
export interface GroundMeshSlice {
  readonly ui: Record<string, never>;
  /** The committed state of the ground mesh settings pane. */
  readonly settings: {
    /** The committed settings values edited by the pane. */
    readonly values: GroundMeshSettingsInputtedData;
    /** `true` while the pane is disabled (data loading / no data). */
    readonly disabled: boolean;
    /**
     * The plain color blender target of the loaded ground mesh, or
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
 */
export interface GroundMeshSliceInput {
  readonly settings: GroundMeshSlice["settings"];
}

/**
 * Maps the ground mesh settings state to its plain slice, reusing
 * `previous` when nothing changed (structural sharing).
 */
export function mapGroundMeshSlice(
  input: GroundMeshSliceInput,
  previous: GroundMeshSlice | null,
): GroundMeshSlice {
  const settings = input.settings;

  if (previous == null) {
    return { ui: {}, settings };
  }

  const previousSettings = previous.settings;
  const nextSettings =
    previousSettings.values === settings.values &&
    previousSettings.disabled === settings.disabled &&
    previousSettings.target === settings.target
      ? previousSettings
      : settings;

  if (previous.settings === nextSettings) {
    return previous;
  }

  return { ui: previous.ui, settings: nextSettings };
}

/**
 * The editor intents of the ground mesh plugin, merged into the editor
 * intents under `gmesh` by the composition root.
 *
 * The intent runs through the layer's existing imperative API, which
 * mutates and notifies synchronously, so the slice contributor invalidates
 * the snapshot in the same dispatch.
 */
export interface GroundMeshIntents {
  /** Applies new settings values to the layer. */
  setSettings(values: GroundMeshSettingsInputtedData): void;
}

/** The plugin slice merge of the ground mesh plugin into `EditorState`. */
export interface GroundMeshPluginSlices {
  readonly gmesh: GroundMeshSlice;
}

/** The plugin intent merge of the ground mesh plugin into `EditorIntents`. */
export interface GroundMeshPluginIntents {
  readonly gmesh: GroundMeshIntents;
}
