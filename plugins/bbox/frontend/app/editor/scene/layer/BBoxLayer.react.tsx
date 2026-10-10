import { default as React } from "react";

import {
  LayerOverlayView,
  useEditorIntents,
  useOptimisticPaneParams,
} from "sta/app/editor";
import type { LayerOverlayTooltip } from "sta/app/editor";

import {
  getDistinctiveLvByValue,
  getOcclusionLvByValue,
} from "../../../../models";
import {
  LabelBoxInspectorPaneView,
  LabelTrackInspectorPaneView,
} from "../widgets";
import { ActionPaneView } from "../widgets/ActionPane.ts";
import type { ActionPaneControllerParams } from "../widgets/ActionPane.ts";
import {
  bboxSettingsPaneMaxTimePathRange,
  BBoxSettingsPaneView,
} from "../widgets/BBoxSettingsPane.react.tsx";
import type { BBoxSettingsPaneControllerParams } from "../widgets/BBoxSettingsPane.react.tsx";
import { DrawModePaneView } from "../widgets/DrawModePane.react.tsx";
import type { DrawModePaneControllerParams } from "../widgets/DrawModePane.react.tsx";
import {
  cloneLabelBoxInspectorInputtedData,
  labelBoxInspectorPaneFactoryParams,
} from "../widgets/LabelBoxInspectorPane.ts";
import type { LabelBoxInspectorPaneControllerParams } from "../widgets/LabelBoxInspectorPane.ts";
import { labelTrackInspectorPaneFactoryParams } from "../widgets/LabelTrackInspectorPane.ts";
import type { LabelTrackInspectorPaneControllerParams } from "../widgets/LabelTrackInspectorPane.ts";

import type { BBoxPluginIntents } from "./BBoxSlice";
import { useBBoxSelector } from "./BBoxSlice.react.ts";

/**
 * Selects the interaction action from the editor state snapshot and writes
 * it back through the bbox intents.
 */
export function BBoxActionsView(): React.JSX.Element {
  const action = useBBoxSelector((slice) => slice.ui.action);
  const disabled = useBBoxSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<BBoxPluginIntents>();

  const paneParams = React.useMemo(
    (): Pick<ActionPaneControllerParams, "inputtedData" | "settings"> => ({
      inputtedData: { action },
      settings: { disabled, hidden: false },
    }),
    [action, disabled],
  );
  const applyInputChange = React.useCallback(
    ({
      action: nextAction,
    }: ActionPaneControllerParams["inputtedData"]): void =>
      intents.bbox.setAction(nextAction),
    [intents],
  );

  return (
    <ActionPaneView onInputChange={applyInputChange} paneParams={paneParams} />
  );
}

/**
 * Selects the draw origin from the editor state snapshot and writes it back
 * through the bbox intents.
 */
export function BBoxDrawModeView(): React.JSX.Element {
  const drawMode = useBBoxSelector((slice) => slice.ui.drawMode);
  const disabled = useBBoxSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<BBoxPluginIntents>();

  const paneParams = React.useMemo(
    (): Pick<DrawModePaneControllerParams, "inputtedData" | "settings"> => ({
      inputtedData: { drawMode },
      settings: { disabled, hidden: false },
    }),
    [drawMode, disabled],
  );
  const applyInputChange = React.useCallback(
    ({
      drawMode: nextDrawMode,
    }: DrawModePaneControllerParams["inputtedData"]): void =>
      intents.bbox.setDrawMode(nextDrawMode),
    [intents],
  );

  return (
    <DrawModePaneView
      onInputChange={applyInputChange}
      paneParams={paneParams}
    />
  );
}

/**
 * The members of the bbox layer used by {@link BBoxLayerOverlayView}.
 *
 * Kept structural so React never depends on the `BBoxLayer` class, which
 * owns the three.js box objects and the interaction context. The inspector
 * panes are pure selector/intent containers, so the overlay only needs the
 * render-time snapshot (active flag + tooltips).
 */
export interface BBoxOverlaySource {
  readonly overlaySnapshot: {
    readonly isActive: boolean;
    readonly tooltips: readonly LayerOverlayTooltip[];
  };
}

export function BBoxLayerOverlayView({
  source,
}: {
  source: BBoxOverlaySource;
}): React.JSX.Element {
  const { isActive, tooltips } = source.overlaySnapshot;

  return (
    <LayerOverlayView
      panels={[
        {
          content: (
            <div style={{ width: "384px", maxHeight: "256px" }}>
              <BBoxTrackInspectorView />
            </div>
          ),
          hidden: !isActive,
          key: "track-inspector",
          title: "Object Track",
          verticalOffset: -192,
        },
        {
          content: (
            <div style={{ width: "384px", maxHeight: "256px" }}>
              <BBoxInspectorView />
            </div>
          ),
          hidden: !isActive,
          key: "box-inspector",
          title: "Bounding Box",
          verticalOffset: -16,
        },
      ]}
      tooltips={tooltips}
    />
  );
}

/**
 * Selects the committed track inspector state from the editor state
 * snapshot and writes new input back through the bbox intents, keeping an
 * optimistic local draft over the committed params.
 */
export function BBoxTrackInspectorView(): React.JSX.Element {
  const selectedTrackId = useBBoxSelector((slice) => slice.ui.selectedTrackId);
  const disabled = useBBoxSelector((slice) => slice.ui.trackInspectorDisabled);
  const tracks = useBBoxSelector((slice) => slice.tracks);
  const classes = useBBoxSelector((slice) => slice.classes);
  const intents = useEditorIntents<BBoxPluginIntents>();

  const selectedTrack =
    selectedTrackId == null
      ? null
      : (tracks.find((track) => track.id === selectedTrackId) ?? null);

  const committedParams = React.useMemo((): Pick<
    LabelTrackInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > => {
    const inputtedData =
      selectedTrack == null
        ? {
            ...structuredClone(
              labelTrackInspectorPaneFactoryParams.inputtedData,
            ),
            selection: { trackId: null },
          }
        : {
            selection: { trackId: selectedTrack.id },
            relations: {
              classSelect: { classId: selectedTrack.gtClassId },
            },
            descriptors: { isBlack: selectedTrack.isBlack },
          };

    return {
      inputtedData: inputtedData,
      internalData: {
        tracks: tracks.map((track) => ({
          id: track.id,
          text: track.text,
        })),
        classes: new Map(
          classes.map((labelClass) => [
            labelClass.id,
            { id: labelClass.id, name: labelClass.name },
          ]),
        ),
      },
      settings: { disabled, hidden: false },
    };
  }, [selectedTrack, tracks, classes, disabled]);
  const applyInputChange = React.useCallback(
    (values: LabelTrackInspectorPaneControllerParams["inputtedData"]): void =>
      intents.bbox.applyTrackInspectorInput(values),
    [intents],
  );
  const applyPaneEvent = React.useCallback(
    (event: { type: string }): void =>
      intents.bbox.trackInspectorPaneEvent(event),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <LabelTrackInspectorPaneView
      onInputChange={(values) => paneState.onInputChange(values)}
      onPaneEvent={applyPaneEvent}
      paneParams={paneState.paneParams}
    />
  );
}

/**
 * Selects the committed box inspector state from the editor state snapshot
 * and writes new input back through the bbox intents, keeping an optimistic
 * local draft over the committed params.
 *
 * The scalar quality levels are readapted to the pane's `QualityLevel`
 * object contract; the pane view keeps its existing clone boundary on the
 * way to the intents.
 */
export function BBoxInspectorView(): React.JSX.Element {
  const ui = useBBoxSelector((slice) => slice.ui);
  const boxes = useBBoxSelector((slice) => slice.boxes);
  const tracks = useBBoxSelector((slice) => slice.tracks);
  const classes = useBBoxSelector((slice) => slice.classes);
  const intents = useEditorIntents<BBoxPluginIntents>();

  const selectedBox =
    ui.selectedBoxId == null
      ? null
      : (boxes.find((box) => box.id === ui.selectedBoxId) ?? null);

  const committedParams = React.useMemo((): Pick<
    LabelBoxInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > => {
    const inputtedData =
      selectedBox == null
        ? {
            ...cloneLabelBoxInspectorInputtedData(
              labelBoxInspectorPaneFactoryParams.inputtedData,
            ),
            selection: { boxId: null },
          }
        : {
            selection: { boxId: selectedBox.id },
            geometry: {
              boxType: selectedBox.boxType,
              center: selectedBox.center,
              size: selectedBox.size,
              angle: selectedBox.angle,
            },
            relations: {
              trackSelect: { trackId: selectedBox.entityId },
              classSelect: {
                classId: selectedBox.perceivedClassId,
              },
            },
            descriptors: {
              distinctiveLv: getDistinctiveLvByValue(selectedBox.distinctiveLv),
              occlusionLv: getOcclusionLvByValue(selectedBox.occlusionLv),
            },
          };

    return {
      inputtedData: inputtedData,
      internalData: {
        boxes: boxes.map((box) => ({ id: box.id, text: box.text })),
        tracks: tracks.map((track) => ({
          id: track.id,
          text: track.text,
        })),
        classes: new Map(
          classes.map((labelClass) => [
            labelClass.id,
            { id: labelClass.id, name: labelClass.name },
          ]),
        ),
      },
      settings: {
        disabled: ui.boxInspectorDisabled,
        hidden: false,
        drawBoxActive: ui.drawBoxActive,
        disableTransform: false,
        disableTrackInput: ui.autoTracks,
      },
    };
  }, [
    selectedBox,
    boxes,
    tracks,
    classes,
    ui.boxInspectorDisabled,
    ui.drawBoxActive,
    ui.autoTracks,
  ]);
  const applyInputChange = React.useCallback(
    (values: LabelBoxInspectorPaneControllerParams["inputtedData"]): void =>
      intents.bbox.applyBoxInspectorInput(values),
    [intents],
  );
  const applyPaneEvent = React.useCallback(
    (event: { type: string }): void =>
      intents.bbox.boxInspectorPaneEvent(event),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <LabelBoxInspectorPaneView
      onInputChange={(values) => paneState.onInputChange(values)}
      onPaneEvent={applyPaneEvent}
      paneParams={paneState.paneParams}
    />
  );
}

/**
 * Selects the committed layer settings from the editor state snapshot and
 * writes new values back through the bbox intents, keeping an optimistic
 * local draft over the committed params.
 */
export function BBoxPreferencesView(): React.JSX.Element {
  const settings = useBBoxSelector((slice) => slice.settings);
  const intents = useEditorIntents<BBoxPluginIntents>();

  const committedParams = React.useMemo(
    (): Pick<
      BBoxSettingsPaneControllerParams,
      "inputtedData" | "internalData" | "settings"
    > => ({
      inputtedData: settings.values,
      internalData: {},
      settings: {
        disabled: settings.disabled,
        hidden: false,
        disallowRelativeElevation: settings.disallowRelativeElevation,
        maxTimePathRange: bboxSettingsPaneMaxTimePathRange,
      },
    }),
    [settings],
  );
  const applyInputChange = React.useCallback(
    (values: BBoxSettingsPaneControllerParams["inputtedData"]): void =>
      intents.bbox.setSettings(values),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <BBoxSettingsPaneView
      onInputChange={(values) => paneState.onInputChange(values)}
      paneParams={paneState.paneParams}
    />
  );
}
