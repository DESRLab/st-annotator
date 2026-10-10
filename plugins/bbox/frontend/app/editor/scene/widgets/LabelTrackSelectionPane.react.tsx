import { default as React } from "react";

import { VirtualCombobox } from "sta/app/editor";
import type { LabelTrackSelectionPaneControllerParams } from "./LabelTrackSelectionPane.ts";

interface LabelTrackSelectionPaneViewProps {
  paneParams: Pick<
    LabelTrackSelectionPaneControllerParams,
    "inputtedData" | "computedData" | "settings"
  > &
    Partial<Pick<LabelTrackSelectionPaneControllerParams, "internalData">>;
  header?: string;
  nullText?: string;
  valueWidth?: React.CSSProperties["width"];
  onInputChange: (
    change: Partial<LabelTrackSelectionPaneControllerParams["inputtedData"]>,
  ) => void;
}

export function LabelTrackSelectionPaneView({
  paneParams,
  header = "Object Track",
  nullText = "(No track selected)",
  valueWidth = "66%",
  onInputChange,
}: LabelTrackSelectionPaneViewProps): React.JSX.Element | null {
  const { inputtedData, computedData, settings } = paneParams;
  const items = computedData.tracks;

  if (settings.hidden) return null;

  return (
    <label className="tp-lblv react-label-selection-row">
      <span className="tp-lblv_l">{header}</span>
      <span className="tp-lblv_v" style={{ width: valueWidth }}>
        <VirtualCombobox
          disabled={settings.disabled}
          items={items}
          nullText={nullText}
          onChange={(trackId) => onInputChange({ trackId })}
          value={inputtedData.trackId}
        />
      </span>
    </label>
  );
}
