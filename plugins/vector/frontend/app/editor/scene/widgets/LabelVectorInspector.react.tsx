import { default as React } from "react";

import { TweakpanePaneHost, VirtualCombobox } from "sta/app/editor";

import {
  cloneLabelVectorInspectorInputtedData,
  createLabelVectorInspectorPaneElementFactory,
  labelVectorInspectorPaneDataProcessor,
} from "./LabelVectorInspectorPane.ts";
import type { LabelVectorInspectorPaneControllerParams } from "./LabelVectorInspectorPane.ts";

export interface LabelVectorInspectorPaneViewProps {
  onInputChange: (
    inputtedData: LabelVectorInspectorPaneControllerParams["inputtedData"],
  ) => void;
  onPaneEvent: (event: { type: string }) => void;
  paneParams: Pick<
    LabelVectorInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  >;
}

export const LabelVectorInspectorPaneView = React.memo(
  function LabelVectorInspectorPaneView({
    onInputChange,
    onPaneEvent,
    paneParams,
  }: LabelVectorInspectorPaneViewProps): React.JSX.Element {
    const vectors = paneParams.internalData?.vectors ?? new Map();
    const selection = (
      <VirtualCombobox
        disabled={paneParams.settings.disabled}
        items={() => vectors.values()}
        nullText="(New vector)"
        onChange={(vectorId) =>
          onInputChange({
            ...paneParams.inputtedData,
            selection: {
              ...paneParams.inputtedData.selection,
              vectorId,
            },
          })
        }
        value={paneParams.inputtedData.selection.vectorId}
      />
    );
    return (
      <TweakpanePaneHost
        definition={(slots) => ({
          dataProcessor: labelVectorInspectorPaneDataProcessor,
          factory: createLabelVectorInspectorPaneElementFactory(
            slots.selection,
          ),
        })}
        mapOutputChange={({ inputtedData }) =>
          cloneLabelVectorInspectorInputtedData(inputtedData)
        }
        onInputChange={onInputChange}
        onPaneEvent={onPaneEvent}
        paneEventTypes={["click-drawVector"]}
        paneParams={paneParams}
        slots={{ selection }}
      />
    );
  },
);
