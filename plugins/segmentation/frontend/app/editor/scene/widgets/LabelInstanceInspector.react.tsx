import { default as React } from "react";

import { TweakpanePaneHost, VirtualCombobox } from "sta/app/editor";

import {
  cloneLabelInstanceInspectorInputtedData,
  createLabelInstanceInspectorPaneElementFactory,
  labelInstanceInspectorPaneDataProcessor,
} from "./LabelInstanceInspectorPane.ts";
import type { LabelInstanceInspectorPaneControllerParams } from "./LabelInstanceInspectorPane.ts";

export interface LabelInstanceInspectorPaneViewProps {
  onInputChange: (
    inputtedData: LabelInstanceInspectorPaneControllerParams["inputtedData"],
  ) => void;
  onPaneEvent: (event: { type: string }) => void;
  paneParams: Pick<
    LabelInstanceInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  >;
}

export const LabelInstanceInspectorPaneView = React.memo(
  function LabelInstanceInspectorPaneView({
    onInputChange,
    onPaneEvent,
    paneParams,
  }: LabelInstanceInspectorPaneViewProps): React.JSX.Element {
    const instances = paneParams.internalData?.instances ?? new Map();
    const selection = (
      <VirtualCombobox
        disabled={paneParams.settings.disabled}
        items={() => instances.values()}
        nullText="(New instance)"
        onChange={(instanceId) =>
          onInputChange({
            ...paneParams.inputtedData,
            selection: { instanceId },
          })
        }
        value={paneParams.inputtedData.selection.instanceId}
      />
    );
    return (
      <TweakpanePaneHost
        definition={(slots) => ({
          dataProcessor: labelInstanceInspectorPaneDataProcessor,
          factory: createLabelInstanceInspectorPaneElementFactory(
            slots.selection,
          ),
        })}
        mapOutputChange={({ inputtedData }) =>
          cloneLabelInstanceInspectorInputtedData(inputtedData)
        }
        onInputChange={onInputChange}
        onPaneEvent={onPaneEvent}
        paneEventTypes={["click-createInstance"]}
        paneParams={paneParams}
        slots={{ selection }}
      />
    );
  },
);
