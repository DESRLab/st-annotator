import { default as React } from "react";

import { useEditorIntents } from "sta/app/editor";

import type { SegmentationPluginIntents } from "../layer/SegmentationSlice";
import { useSegmentationSelector } from "../layer/SegmentationSlice.react.ts";
import { EditModePaneView } from "../widgets/EditModePane.react.tsx";
import type { EditModePaneControllerParams } from "../widgets/EditModePane.react.tsx";

/**
 * Selects the edit mode from the editor state snapshot and writes it back
 * through the segmentation intents.
 *
 * While interaction is disabled (inactive layer / no data) the pane is
 * disabled as well, matching how the sibling action/draw-mode panes surface
 * the layer's disabled state (the radiogrid blade does not support the
 * `hidden` option, so the pane stays visible but inert).
 */
export function SelectionEditControlsView(): React.JSX.Element {
  const editMode = useSegmentationSelector((slice) => slice.ui.editMode);
  const disabled = useSegmentationSelector((slice) => slice.ui.disabled);
  const intents = useEditorIntents<SegmentationPluginIntents>();

  const paneParams = React.useMemo(
    (): Pick<
      EditModePaneControllerParams,
      "inputtedData" | "computedData" | "settings"
    > => ({
      inputtedData: { editMode },
      computedData: {},
      settings: { disabled, hidden: false },
    }),
    [editMode, disabled],
  );
  const applyInputChange = React.useCallback(
    (change: Partial<EditModePaneControllerParams["inputtedData"]>): void => {
      if (change.editMode != null)
        intents.segmentation.setEditMode(change.editMode);
    },
    [intents],
  );

  return (
    <EditModePaneView
      onInputChange={applyInputChange}
      paneParams={paneParams}
    />
  );
}
