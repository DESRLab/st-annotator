import { default as React } from "react";

import { VirtualCombobox } from "sta/app/editor";
import type { LabelInstanceSelectionPaneControllerParams } from "./LabelInstanceSelectionPane.ts";

interface LabelInstanceSelectionPaneViewProps {
  paneParams: Pick<
    LabelInstanceSelectionPaneControllerParams,
    "inputtedData" | "computedData" | "settings"
  > &
    Partial<Pick<LabelInstanceSelectionPaneControllerParams, "internalData">>;
  header?: string;
  nullText?: string;
  valueWidth?: React.CSSProperties["width"];
  onInputChange: (
    change: Partial<LabelInstanceSelectionPaneControllerParams["inputtedData"]>,
  ) => void;
}

export function LabelInstanceSelectionPaneView({
  paneParams,
  header = "Object Instance",
  nullText = "(No instance selected)",
  valueWidth = "66%",
  onInputChange,
}: LabelInstanceSelectionPaneViewProps): React.JSX.Element | null {
  const { inputtedData, computedData, settings } = paneParams;
  const items = computedData.instances;

  if (settings.hidden) return null;
  return (
    <label className="tp-lblv react-label-selection-row">
      <span className="tp-lblv_l">{header}</span>
      <span className="tp-lblv_v" style={{ width: valueWidth }}>
        <VirtualCombobox
          disabled={settings.disabled}
          items={() => items.values()}
          nullText={nullText}
          onChange={(instanceId) => onInputChange({ instanceId })}
          value={inputtedData.instanceId}
        />
      </span>
    </label>
  );
}
