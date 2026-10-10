import { default as React } from "react";

import { TweakpanePaneHost, VirtualCombobox } from "sta/app/editor";

import {
  cloneLabelBoxInspectorInputtedData,
  createLabelBoxInspectorPaneElementFactory,
  labelBoxInspectorPaneDataProcessor,
} from "./LabelBoxInspectorPane.ts";
import type { LabelBoxInspectorPaneControllerParams } from "./LabelBoxInspectorPane.ts";
import { LabelTrackSelectionPaneView } from "./LabelTrackSelectionPane.react.tsx";

export interface LabelBoxInspectorPaneViewProps {
  onInputChange: (
    inputtedData: LabelBoxInspectorPaneControllerParams["inputtedData"],
  ) => void;
  onPaneEvent: (event: { type: string }) => void;
  paneParams: Pick<
    LabelBoxInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  >;
}

export const LabelBoxInspectorPaneView = React.memo(
  function LabelBoxInspectorPaneView({
    onInputChange,
    onPaneEvent,
    paneParams,
  }: LabelBoxInspectorPaneViewProps): React.JSX.Element {
    const boxes = paneParams.internalData?.boxes ?? [];
    const selection = (
      <VirtualCombobox
        disabled={paneParams.settings.disabled}
        items={boxes}
        nullText="(New box)"
        onChange={(boxId) =>
          onInputChange({
            ...paneParams.inputtedData,
            selection: {
              ...paneParams.inputtedData.selection,
              boxId,
            },
          })
        }
        value={paneParams.inputtedData.selection.boxId}
      />
    );
    const tracks = paneParams.internalData?.tracks ?? [];
    const trackSelection = (
      <LabelTrackSelectionPaneView
        onInputChange={({ trackId }) =>
          onInputChange({
            ...paneParams.inputtedData,
            relations: {
              ...paneParams.inputtedData.relations,
              trackSelect: { trackId: trackId ?? null },
            },
          })
        }
        paneParams={{
          inputtedData: paneParams.inputtedData.relations.trackSelect,
          computedData: { tracks },
          settings: {
            disabled:
              paneParams.settings.disabled ||
              paneParams.settings.disableTrackInput,
            hidden: paneParams.settings.hidden,
          },
        }}
        valueWidth="var(--bld-vw)"
      />
    );
    return (
      <TweakpanePaneHost
        definition={(slots) => ({
          dataProcessor: labelBoxInspectorPaneDataProcessor,
          factory: createLabelBoxInspectorPaneElementFactory(
            slots.selection,
            slots.trackSelection,
          ),
        })}
        mapOutputChange={({ inputtedData }) =>
          cloneLabelBoxInspectorInputtedData(inputtedData)
        }
        onInputChange={onInputChange}
        onPaneEvent={onPaneEvent}
        paneEventTypes={["click-drawBox"]}
        paneParams={paneParams}
        slots={{ selection, trackSelection }}
      />
    );
  },
);
