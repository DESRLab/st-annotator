import { default as React } from "react";

import {
  LayerOverlayView,
  useEditorIntents,
  useOptimisticPaneParams,
} from "sta/app/editor";
import type { LayerOverlayTooltip } from "sta/app/editor";

import { LabelVectorInspectorPaneView } from "../widgets";
import { ActionPaneView } from "../widgets/ActionPane.ts";
import type { ActionPaneControllerParams } from "../widgets/ActionPane.ts";
import { DrawModePaneView } from "../widgets/DrawModePane.react.tsx";
import type { DrawModePaneControllerParams } from "../widgets/DrawModePane.react.tsx";
import {
  cloneLabelVectorInspectorInputtedData,
  labelVectorInspectorPaneFactoryParams,
} from "../widgets/LabelVectorInspectorPane.ts";
import type { LabelVectorInspectorPaneControllerParams } from "../widgets/LabelVectorInspectorPane.ts";
import { VectorSettingsPaneView } from "../widgets/VectorSettingsPane.react.tsx";
import type { VectorSettingsPaneControllerParams } from "../widgets/VectorSettingsPane.react.tsx";

import type { VectorPluginIntents } from "./VectorSlice";
import { useVectorSelector } from "./VectorSlice.react.ts";

/**
 * Selects the interaction action from the editor state snapshot and writes
 * it back through the vector intents.
 */
export function VectorActionsView(): React.JSX.Element {
  const action = useVectorSelector((slice) => slice.ui.action);
  const disabled = useVectorSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<VectorPluginIntents>();

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
      intents.vector.setAction(nextAction),
    [intents],
  );

  return (
    <ActionPaneView onInputChange={applyInputChange} paneParams={paneParams} />
  );
}

/**
 * Selects the type of vector drawn while drawing from the editor state
 * snapshot and writes it back through the vector intents.
 */
export function VectorDrawModeView(): React.JSX.Element {
  const drawMode = useVectorSelector((slice) => slice.ui.drawMode);
  const disabled = useVectorSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<VectorPluginIntents>();

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
      intents.vector.setDrawMode(nextDrawMode),
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
 * The members of the vector layer used by {@link VectorLayerOverlayView}.
 *
 * Kept structural so React never depends on the `VectorLayer` class, which
 * owns the three.js vector objects and the interaction context. The inspector
 * pane is a pure selector/intent container, so the overlay only needs the
 * render-time snapshot (active flag + tooltips).
 */
export interface VectorOverlaySource {
  readonly overlaySnapshot: {
    readonly isActive: boolean;
    readonly tooltips: readonly LayerOverlayTooltip[];
  };
}

export function VectorLayerOverlayView({
  source,
}: {
  source: VectorOverlaySource;
}): React.JSX.Element {
  const { isActive, tooltips } = source.overlaySnapshot;

  return (
    <LayerOverlayView
      panels={[
        {
          content: (
            <div style={{ width: "384px", maxHeight: "256px" }}>
              <VectorInspectorView />
            </div>
          ),
          hidden: !isActive,
          key: "inspector",
          title: "Vector Objects",
        },
      ]}
      tooltips={tooltips}
    />
  );
}

/**
 * Selects the committed vector inspector state from the editor state
 * snapshot and writes new input back through the vector intents, keeping an
 * optimistic local draft over the committed params.
 */
export function VectorInspectorView(): React.JSX.Element {
  const ui = useVectorSelector((slice) => slice.ui);
  const vectors = useVectorSelector((slice) => slice.vectors);
  const classes = useVectorSelector((slice) => slice.classes);
  const intents = useEditorIntents<VectorPluginIntents>();

  const selectedVector =
    ui.selectedVectorId == null
      ? null
      : (vectors.find((vector) => vector.id === ui.selectedVectorId) ?? null);

  const committedParams = React.useMemo((): Pick<
    LabelVectorInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > => {
    const inputtedData =
      selectedVector == null
        ? {
            ...cloneLabelVectorInspectorInputtedData(
              labelVectorInspectorPaneFactoryParams.inputtedData,
            ),
            selection: { vectorId: null },
          }
        : {
            selection: { vectorId: selectedVector.id },
            relations: {
              classSelect: { classId: selectedVector.gtClassId },
            },
          };

    return {
      inputtedData: inputtedData,
      internalData: {
        vectors: new Map(
          vectors.map((vector) => [
            vector.id,
            { id: vector.id, text: vector.text },
          ]),
        ),
        classes: new Map(
          classes.map((labelClass) => [
            labelClass.id,
            { id: labelClass.id, name: labelClass.name },
          ]),
        ),
      },
      settings: {
        disabled: ui.vectorInspectorDisabled,
        hidden: false,
        drawVectorActive: ui.drawVectorActive,
        disableTransform: false,
      },
    };
  }, [
    selectedVector,
    vectors,
    classes,
    ui.vectorInspectorDisabled,
    ui.drawVectorActive,
  ]);
  const applyInputChange = React.useCallback(
    (values: LabelVectorInspectorPaneControllerParams["inputtedData"]): void =>
      intents.vector.applyVectorInspectorInput(values),
    [intents],
  );
  const applyPaneEvent = React.useCallback(
    (event: { type: string }): void =>
      intents.vector.vectorInspectorPaneEvent(event),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  const paneStateRef = React.useRef(paneState);
  paneStateRef.current = paneState;
  const handleInputChange = React.useCallback(
    (
      inputtedData: LabelVectorInspectorPaneControllerParams["inputtedData"],
    ): void => paneStateRef.current.onInputChange(inputtedData),
    [],
  );
  return (
    <LabelVectorInspectorPaneView
      onInputChange={handleInputChange}
      onPaneEvent={applyPaneEvent}
      paneParams={paneState.paneParams}
    />
  );
}

/**
 * Selects the committed layer settings from the editor state snapshot and
 * writes new values back through the vector intents, keeping an optimistic
 * local draft over the committed params.
 */
export function VectorPreferencesView(): React.JSX.Element {
  const settings = useVectorSelector((slice) => slice.settings);
  const intents = useEditorIntents<VectorPluginIntents>();

  const committedParams = React.useMemo(
    (): Pick<
      VectorSettingsPaneControllerParams,
      "inputtedData" | "internalData" | "settings"
    > => ({
      inputtedData: settings.values,
      internalData: {},
      settings: {
        disabled: settings.disabled,
        hidden: false,
      },
    }),
    [settings],
  );
  const applyInputChange = React.useCallback(
    (values: VectorSettingsPaneControllerParams["inputtedData"]): void =>
      intents.vector.setSettings(values),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <VectorSettingsPaneView
      onInputChange={(inputtedData) => paneState.onInputChange(inputtedData)}
      paneParams={paneState.paneParams}
    />
  );
}
