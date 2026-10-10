import { default as React } from "react";

import { SourceDataLayer } from "sta/app/editor";
import type {
  EditorSliceContributor,
  PaneElementParams,
  SceneContext,
  WindowMapper,
} from "sta/app/editor";

import { getSettings } from "../../config";
import { GroundMeshView } from "../data";
import type { GroundMesh } from "../data";
import {
  groundMeshSettingsPaneDataProcessor,
  groundMeshSettingsPaneFactoryParams,
} from "../widgets/GroundMeshSettingsPane.react.tsx";
import type { GroundMeshSettingsPaneControllerParams } from "../widgets/GroundMeshSettingsPane.react.tsx";

import { GroundMeshPreferencesView } from "./GroundMeshLayer.react.tsx";
import { mapGroundMeshSlice } from "./GroundMeshSlice";
import type {
  GroundMeshPluginIntents,
  GroundMeshSlice,
} from "./GroundMeshSlice";

/**
 * Facilitates user interaction with the ground mesh, if any, for the current frame.
 */
export class GroundMeshLayer<WM extends WindowMapper>
  extends SourceDataLayer<WM, GroundMesh | null>
  implements EditorSliceContributor<GroundMeshSlice>
{
  /** Whether the Three.js objects or their display settings need refreshing. */
  #sceneDirty = true;

  onBeforeUpdateData() {
    // A new load invalidates the published data (the view nulls it right
    // after dispatching beforeload), so the settings target must not keep
    // exposing the previous buffer while the new load is in flight.
    this.#settingsInternalData = null;
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: true,
    };
    this.#sceneDirty = true;
    this.#notifySettingsChange();
  }

  onAfterUpdateData() {
    const { data } = this.dataView;

    this.#settingsInternalData =
      data == null
        ? null
        : {
            buffer: data.verticesBuffer,
            channelNames: data.channelNames,
          };
    this.#settingsPaneSettings = { disabled: data == null, hidden: false };
    this.#sceneDirty = true;
    this.#notifySettingsChange();
  }

  /** Specifies the settings to apply to the ground mesh. */
  #settingsInputtedData: GroundMeshSettingsPaneControllerParams["inputtedData"];

  #settingsInternalData: GroundMeshSettingsPaneControllerParams["internalData"];

  #settingsPaneSettings: GroundMeshSettingsPaneControllerParams["settings"];

  /** Cached output of {@link settingsOutput}, valid until one of its inputs is replaced. */
  #settingsOutputCache?: {
    inputtedData: GroundMeshSettingsPaneControllerParams["inputtedData"];
    internalData: GroundMeshSettingsPaneControllerParams["internalData"];
    settings: GroundMeshSettingsPaneControllerParams["settings"];
    output: GroundMeshSettingsPaneControllerParams["outputData"];
  };

  /**
   * Creates a new layer for ground meshes.
   */
  static create<WM extends WindowMapper>(
    context: SceneContext<WM>,
    name: string,
    maxCacheSize?: number,
  ): GroundMeshLayer<WM> {
    const dataView = GroundMeshView.create(context, maxCacheSize);

    return new GroundMeshLayer(context, name, dataView);
  }

  /**
   * Creates a new layer for ground meshes.
   */
  constructor(
    context: SceneContext<WM>,
    name: string,
    dataView: GroundMeshView,
  ) {
    super(context, name, dataView);

    const config = context.config;
    const settings = getSettings(config);

    this.#settingsInputtedData = settings;
    this.#settingsInternalData = null;
    this.#settingsPaneSettings = groundMeshSettingsPaneFactoryParams.settings;
  }

  dispose() {
    super.dispose();
  }

  get prefsView(): React.JSX.Element {
    return <GroundMeshPreferencesView />;
  }

  /**
   * Updates the `three.js` objects and the DOM elements of this layer.
   * It is called during each animation frame while this layer is displayed.
   */
  render() {
    if (!this.#sceneDirty) return;
    this.#sceneDirty = false;

    this.objects.clear();

    const { data } = this.dataView;
    if (data == null) {
      this.refreshObjects();
      return;
    }

    const { blender, showWireframe, opacity } = this.settingsOutput;
    if (blender != null) data.blender = blender;
    data.showWireframe = showWireframe;
    data.opacity = opacity;

    this.objects.add(data.asObject3D());
    this.refreshObjects();
  }

  /** Maps this layer's settings state into its plain editor-state slice. */
  /** Contributes the ground mesh intent group to the editor intents. */
  createEditorIntents(): GroundMeshPluginIntents {
    return {
      gmesh: {
        setSettings: (values) => {
          this.onSettingsInputChange(values);
        },
      },
    };
  }

  mapEditorSlice(previous: GroundMeshSlice | null): GroundMeshSlice {
    return mapGroundMeshSlice(
      {
        settings: {
          values: this.#settingsInputtedData,
          disabled: this.#settingsPaneSettings.disabled,
          target: this.#settingsInternalData,
        },
      },
      previous,
    );
  }

  /** Subscribes to every event that can change this layer's editor-state slice. */
  subscribeEditorSlice(listener: () => void): () => void {
    this.addEventListener("settings-change", listener);

    return (): void => {
      this.removeEventListener("settings-change", listener);
    };
  }

  get settingsOutput() {
    const cache = this.#settingsOutputCache;
    if (cache !== undefined) {
      if (
        cache.inputtedData === this.#settingsInputtedData &&
        cache.internalData === this.#settingsInternalData &&
        cache.settings === this.#settingsPaneSettings
      )
        return cache.output;
    }

    const output = groundMeshSettingsPaneDataProcessor.outputData(
      this.#getSettingsPaneElementParams(),
    );
    this.#settingsOutputCache = {
      inputtedData: this.#settingsInputtedData,
      internalData: this.#settingsInternalData,
      settings: this.#settingsPaneSettings,
      output,
    };
    return output;
  }

  onSettingsInputChange = (
    inputtedData: GroundMeshSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#settingsInputtedData = inputtedData;
    this.#settingsOutputCache = undefined;
    this.#sceneDirty = true;
    this.requestRender();
    this.#notifySettingsChange();
  };

  #getSettingsPaneElementParams(): PaneElementParams<GroundMeshSettingsPaneControllerParams> {
    return {
      inputtedData: this.#settingsInputtedData,
      computedData: groundMeshSettingsPaneDataProcessor.computeData(
        this.#settingsInputtedData,
        this.#settingsInternalData,
      ),
      settings: this.#settingsPaneSettings,
    };
  }

  #notifySettingsChange(): void {
    this.dispatchEvent({ type: "settings-change" });
  }
}
