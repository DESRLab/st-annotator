import { default as React } from "react";

import { TweakpanePaneHost, VirtualCombobox } from "sta/app/editor";

import {
  labelTrackInspectorPaneDataProcessor,
  createLabelTrackInspectorPaneElementFactory,
} from "./LabelTrackInspectorPane.ts";
import type { LabelTrackInspectorPaneControllerParams } from "./LabelTrackInspectorPane.ts";

export interface LabelTrackInspectorPaneViewProps {
  onInputChange: (
    inputtedData: LabelTrackInspectorPaneControllerParams["inputtedData"],
  ) => void;
  onPaneEvent: (event: { type: string }) => void;
  paneParams: Pick<
    LabelTrackInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  >;
}

export const LabelTrackInspectorPaneView = React.memo(
  function LabelTrackInspectorPaneView({
    onInputChange,
    onPaneEvent,
    paneParams,
  }: LabelTrackInspectorPaneViewProps): React.JSX.Element {
    const selection = (
      <VirtualCombobox
        disabled={paneParams.settings.disabled}
        items={paneParams.internalData?.tracks ?? []}
        nullText="(New track)"
        onChange={(trackId) =>
          onInputChange({
            ...paneParams.inputtedData,
            selection: { trackId },
          })
        }
        value={paneParams.inputtedData.selection.trackId}
      />
    );
    return (
      <TweakpanePaneHost
        definition={(slots) => ({
          dataProcessor: labelTrackInspectorPaneDataProcessor,
          factory: createLabelTrackInspectorPaneElementFactory(slots.selection),
        })}
        mapOutputChange={({ inputtedData }) => inputtedData}
        onInputChange={onInputChange}
        onPaneEvent={onPaneEvent}
        paneEventTypes={["click-createTrack"]}
        paneParams={paneParams}
        slots={{ selection }}
      />
    );
  },
);
