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
  LabelInstanceInspectorPaneView,
  LabelSelectionInspectorPaneView,
} from "../widgets";
import { ActionPaneView } from "../widgets/ActionPane.ts";
import type { ActionPaneControllerParams } from "../widgets/ActionPane.ts";
import { DrawModePaneView } from "../widgets/DrawModePane.react.tsx";
import type { DrawModePaneControllerParams } from "../widgets/DrawModePane.react.tsx";
import {
  cloneLabelInstanceInspectorInputtedData,
  labelInstanceInspectorPaneFactoryParams,
} from "../widgets/LabelInstanceInspectorPane.ts";
import type { LabelInstanceInspectorPaneControllerParams } from "../widgets/LabelInstanceInspectorPane.ts";
import {
  cloneLabelSelectionInspectorInputtedData,
  labelSelectionInspectorPaneFactoryParams,
} from "../widgets/LabelSelectionInspectorPane.ts";
import type { LabelSelectionInspectorPaneControllerParams } from "../widgets/LabelSelectionInspectorPane.ts";
import {
  segmentationSettingsPaneMaxBrushDiameter,
  segmentationSettingsPaneMaxBrushHueStyle,
  segmentationSettingsPaneMaxTimePathRange,
  SegmentationSettingsPaneView,
} from "../widgets/SegmentationSettingsPane.react.tsx";
import type { SegmentationSettingsPaneControllerParams } from "../widgets/SegmentationSettingsPane.react.tsx";

import type {
  SegmentationInstanceEntity,
  SegmentationPluginIntents,
} from "./SegmentationSlice";
import { useSegmentationSelector } from "./SegmentationSlice.react.ts";

const instanceOptionsByEntityList = new WeakMap<
  readonly SegmentationInstanceEntity[],
  ReadonlyMap<
    SegmentationInstanceEntity["id"],
    { id: SegmentationInstanceEntity["id"]; text: string }
  >
>();

class InstanceOptionMap implements ReadonlyMap<
  SegmentationInstanceEntity["id"],
  { id: SegmentationInstanceEntity["id"]; text: string }
> {
  constructor(readonly entities: readonly SegmentationInstanceEntity[]) {}
  get size() {
    return this.entities.length;
  }
  get(id: SegmentationInstanceEntity["id"]) {
    const entity = this.entities.find((candidate) => candidate.id === id);
    return entity == null ? undefined : { id: entity.id, text: entity.text };
  }
  has(id: SegmentationInstanceEntity["id"]) {
    return this.entities.some((candidate) => candidate.id === id);
  }
  *entries(): MapIterator<
    [
      SegmentationInstanceEntity["id"],
      { id: SegmentationInstanceEntity["id"]; text: string },
    ]
  > {
    for (const value of this.values()) yield [value.id, value];
  }
  keys(): MapIterator<SegmentationInstanceEntity["id"]> {
    return this.entities.map((entity) => entity.id).values();
  }
  *values(): MapIterator<{
    id: SegmentationInstanceEntity["id"];
    text: string;
  }> {
    for (const entity of this.entities)
      yield { id: entity.id, text: entity.text };
  }
  forEach(
    callback: (
      value: { id: SegmentationInstanceEntity["id"]; text: string },
      key: SegmentationInstanceEntity["id"],
      map: ReadonlyMap<
        SegmentationInstanceEntity["id"],
        { id: SegmentationInstanceEntity["id"]; text: string }
      >,
    ) => void,
  ): void {
    for (const value of this.values()) callback(value, value.id, this);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

function getInstanceOptions(instances: readonly SegmentationInstanceEntity[]) {
  const cached = instanceOptionsByEntityList.get(instances);
  if (cached != null) return cached;
  const options = new InstanceOptionMap(instances);
  instanceOptionsByEntityList.set(instances, options);
  return options;
}

/**
 * Selects the interaction action from the editor state snapshot and writes
 * it back through the segmentation intents.
 */
export function SegmentationActionsView(): React.JSX.Element {
  const action = useSegmentationSelector((slice) => slice.ui.action);
  const disabled = useSegmentationSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<SegmentationPluginIntents>();

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
      intents.segmentation.setAction(nextAction),
    [intents],
  );

  return (
    <ActionPaneView onInputChange={applyInputChange} paneParams={paneParams} />
  );
}

/**
 * Selects the query/prompt tool from the editor state snapshot and writes
 * it back through the segmentation intents.
 */
export function SegmentationDrawModeView(): React.JSX.Element {
  const drawMode = useSegmentationSelector((slice) => slice.ui.drawMode);
  const disabled = useSegmentationSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<SegmentationPluginIntents>();

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
      intents.segmentation.setDrawMode(nextDrawMode),
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
 * The members of the segmentation layer used by {@link SegmentationLayerOverlayView}.
 *
 * Kept structural so React never depends on the `SegmentationLayer` class,
 * which owns the three.js selection objects and the interaction context.
 * The inspector panes are pure selector/intent containers, so the overlay
 * only needs the render-time snapshot (active flag + tooltips).
 */
export interface SegmentationLayerOverlaySource {
  readonly overlaySnapshot: {
    readonly isActive: boolean;
    readonly tooltips: readonly LayerOverlayTooltip[];
  };
}

export function SegmentationLayerOverlayView({
  source,
}: {
  source: SegmentationLayerOverlaySource;
}): React.JSX.Element {
  const { isActive, tooltips } = source.overlaySnapshot;

  return (
    <LayerOverlayView
      panels={[
        {
          content: (
            <div style={{ width: "384px", maxHeight: "256px" }}>
              <SegmentationInstanceInspectorView />
            </div>
          ),
          hidden: !isActive,
          key: "instance-inspector",
          title: "Object Instance",
          verticalOffset: -192,
        },
        {
          content: (
            <div style={{ width: "384px", maxHeight: "256px" }}>
              <SegmentationSelectionInspectorView />
            </div>
          ),
          hidden: !isActive,
          key: "selection-inspector",
          title: "Selection Points",
          verticalOffset: -16,
        },
      ]}
      tooltips={tooltips}
    />
  );
}

/**
 * Selects the committed instance inspector state from the editor state
 * snapshot and writes new input back through the segmentation intents,
 * keeping an optimistic local draft over the committed params.
 */
export function SegmentationInstanceInspectorView(): React.JSX.Element {
  const selectedInstanceId = useSegmentationSelector(
    (slice) => slice.ui.selectedInstanceId,
  );
  const disabled = useSegmentationSelector(
    (slice) => slice.ui.instanceInspectorDisabled,
  );
  const instances = useSegmentationSelector((slice) => slice.instances);
  const classes = useSegmentationSelector((slice) => slice.classes);
  const intents = useEditorIntents<SegmentationPluginIntents>();

  const selectedInstance =
    selectedInstanceId == null
      ? null
      : (instances.find((instance) => instance.id === selectedInstanceId) ??
        null);

  const committedParams = React.useMemo((): Pick<
    LabelInstanceInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > => {
    const inputtedData =
      selectedInstance == null
        ? {
            ...cloneLabelInstanceInspectorInputtedData(
              labelInstanceInspectorPaneFactoryParams.inputtedData,
            ),
            selection: { instanceId: null },
          }
        : {
            selection: { instanceId: selectedInstance.id },
            relations: {
              classSelect: { classId: selectedInstance.gtClassId },
            },
            descriptors: { isBlack: selectedInstance.isBlack },
          };

    return {
      inputtedData: inputtedData,
      internalData: {
        instances: getInstanceOptions(instances),
        classes: new Map(
          classes.map((labelClass) => [
            labelClass.id,
            { id: labelClass.id, name: labelClass.name },
          ]),
        ),
      },
      settings: { disabled, hidden: false },
    };
  }, [selectedInstance, instances, classes, disabled]);
  const applyInputChange = React.useCallback(
    (
      values: LabelInstanceInspectorPaneControllerParams["inputtedData"],
    ): void => intents.segmentation.applyInstanceInspectorInput(values),
    [intents],
  );
  const applyPaneEvent = React.useCallback(
    (event: { type: string }): void =>
      intents.segmentation.instanceInspectorPaneEvent(event),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <LabelInstanceInspectorPaneView
      onInputChange={(values) => paneState.onInputChange(values)}
      onPaneEvent={applyPaneEvent}
      paneParams={paneState.paneParams}
    />
  );
}

/**
 * Selects the committed selection inspector state from the editor state
 * snapshot and writes new input back through the segmentation intents,
 * keeping an optimistic local draft over the committed params.
 *
 * The scalar quality levels are readapted to the pane's `QualityLevel`
 * object contract; the pane view keeps its existing clone boundary on the
 * way to the intents.
 */
export function SegmentationSelectionInspectorView(): React.JSX.Element {
  const ui = useSegmentationSelector((slice) => slice.ui);
  const selections = useSegmentationSelector((slice) => slice.selections);
  const instances = useSegmentationSelector((slice) => slice.instances);
  const classes = useSegmentationSelector((slice) => slice.classes);
  const intents = useEditorIntents<SegmentationPluginIntents>();

  const selectedSelection =
    ui.selectedSelectionId == null
      ? null
      : (selections.find(
          (selection) => selection.id === ui.selectedSelectionId,
        ) ?? null);

  const committedParams = React.useMemo((): Pick<
    LabelSelectionInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > => {
    const inputtedData =
      selectedSelection == null
        ? {
            ...cloneLabelSelectionInspectorInputtedData(
              labelSelectionInspectorPaneFactoryParams.inputtedData,
            ),
            selection: { selectionId: null },
          }
        : {
            selection: { selectionId: selectedSelection.id },
            relations: {
              instanceSelect: {
                instanceId: selectedSelection.entityId,
              },
              classSelect: {
                classId: selectedSelection.perceivedClassId,
              },
            },
            descriptors: {
              distinctiveLv: getDistinctiveLvByValue(
                selectedSelection.distinctiveLv,
              ),
              occlusionLv: getOcclusionLvByValue(selectedSelection.occlusionLv),
            },
          };

    return {
      inputtedData: inputtedData,
      internalData: {
        selections: new Map(
          selections.map((selection) => [
            selection.id,
            { id: selection.id, text: selection.text },
          ]),
        ),
        instances: getInstanceOptions(instances),
        classes: new Map(
          classes.map((labelClass) => [
            labelClass.id,
            { id: labelClass.id, name: labelClass.name },
          ]),
        ),
      },
      settings: {
        disabled: ui.selectionInspectorDisabled,
        hidden: false,
        drawSelectionActive: ui.drawSelectionActive,
        disableInstanceInput: !ui.autoInstances,
      },
    };
  }, [
    selectedSelection,
    selections,
    instances,
    classes,
    ui.selectionInspectorDisabled,
    ui.drawSelectionActive,
    ui.autoInstances,
  ]);
  const applyInputChange = React.useCallback(
    (
      values: LabelSelectionInspectorPaneControllerParams["inputtedData"],
    ): void => intents.segmentation.applySelectionInspectorInput(values),
    [intents],
  );
  const applyPaneEvent = React.useCallback(
    (event: { type: string }): void =>
      intents.segmentation.selectionInspectorPaneEvent(event),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <LabelSelectionInspectorPaneView
      onInputChange={(values) => paneState.onInputChange(values)}
      onPaneEvent={applyPaneEvent}
      paneParams={paneState.paneParams}
    />
  );
}

/**
 * Selects the committed layer settings from the editor state snapshot and
 * writes new values back through the segmentation intents, keeping an
 * optimistic local draft over the committed params.
 */
export function SegmentationPreferencesView(): React.JSX.Element {
  const settings = useSegmentationSelector((slice) => slice.settings);
  const intents = useEditorIntents<SegmentationPluginIntents>();

  const committedParams = React.useMemo(
    (): Pick<
      SegmentationSettingsPaneControllerParams,
      "inputtedData" | "internalData" | "settings"
    > => ({
      inputtedData: settings.values,
      internalData: {},
      settings: {
        disabled: settings.disabled,
        hidden: false,
        isAssistantAvailable: settings.isAssistantAvailable,
        maxTimePathRange: segmentationSettingsPaneMaxTimePathRange,
        maxBrushDiameter: segmentationSettingsPaneMaxBrushDiameter,
        maxBrushHueStyle: segmentationSettingsPaneMaxBrushHueStyle,
      },
    }),
    [settings],
  );
  const applyInputChange = React.useCallback(
    (values: SegmentationSettingsPaneControllerParams["inputtedData"]): void =>
      intents.segmentation.setSettings(values),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <SegmentationSettingsPaneView
      onInputChange={(values) => paneState.onInputChange(values)}
      paneParams={paneState.paneParams}
    />
  );
}
