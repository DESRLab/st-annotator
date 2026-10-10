import { default as React } from "react";

import { TweakpanePaneHost, VirtualCombobox } from "sta/app/editor";

import {
  cloneLabelSelectionInspectorInputtedData,
  createLabelSelectionInspectorPaneElementFactory,
  labelSelectionInspectorPaneDataProcessor,
} from "./LabelSelectionInspectorPane.ts";
import type { LabelSelectionInspectorPaneControllerParams } from "./LabelSelectionInspectorPane.ts";
import { LabelInstanceSelectionPaneView } from "./LabelInstanceSelectionPane.react.tsx";

export interface LabelSelectionInspectorPaneViewProps {
  onInputChange: (
    inputtedData: LabelSelectionInspectorPaneControllerParams["inputtedData"],
  ) => void;
  onPaneEvent: (event: { type: string }) => void;
  paneParams: Pick<
    LabelSelectionInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  >;
}

export const LabelSelectionInspectorPaneView = React.memo(
  function LabelSelectionInspectorPaneView({
    onInputChange,
    onPaneEvent,
    paneParams,
  }: LabelSelectionInspectorPaneViewProps): React.JSX.Element {
    const selections = paneParams.internalData?.selections ?? new Map();
    const instances = paneParams.internalData?.instances ?? new Map();
    const selection = (
      <VirtualCombobox
        disabled={paneParams.settings.disabled}
        items={() => selections.values()}
        nullText="(New selection)"
        onChange={(selectionId) =>
          onInputChange({
            ...paneParams.inputtedData,
            selection: { selectionId },
          })
        }
        value={paneParams.inputtedData.selection.selectionId}
      />
    );
    const instanceSelection = (
      <LabelInstanceSelectionPaneView
        onInputChange={({ instanceId }) =>
          onInputChange({
            ...paneParams.inputtedData,
            relations: {
              ...paneParams.inputtedData.relations,
              instanceSelect: { instanceId: instanceId ?? null },
            },
          })
        }
        paneParams={{
          inputtedData: paneParams.inputtedData.relations.instanceSelect,
          computedData: { instances },
          settings: {
            disabled:
              paneParams.settings.disabled ||
              paneParams.settings.disableInstanceInput,
            hidden: paneParams.settings.hidden,
          },
        }}
        valueWidth="var(--bld-vw)"
      />
    );
    return (
      <TweakpanePaneHost
        definition={(slots) => ({
          dataProcessor: labelSelectionInspectorPaneDataProcessor,
          factory: createLabelSelectionInspectorPaneElementFactory(
            slots.selection,
            slots.instanceSelection,
          ),
        })}
        mapOutputChange={({ inputtedData }) =>
          cloneLabelSelectionInspectorInputtedData(inputtedData)
        }
        onInputChange={onInputChange}
        onPaneEvent={onPaneEvent}
        paneEventTypes={["click-drawSelection"]}
        paneParams={paneParams}
        slots={{ selection, instanceSelection }}
      />
    );
  },
);
