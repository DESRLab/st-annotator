import { default as React } from "react";

import { TweakpanePaneHost } from "../../widgets";

import { createSceneSelectionPaneDefinition } from "./SceneSelectionPane.ts";
import type {
  SceneSelectionPaneParams,
  SceneSelectionState,
} from "./SceneSelectionPane.ts";

export * from "./SceneSelectionPane.ts";

interface SceneSelectionPaneViewProps {
  historyChildren?: React.ReactNode;
  paneParams: Pick<SceneSelectionPaneParams, "inputtedData" | "settings"> &
    Partial<Pick<SceneSelectionPaneParams, "internalData">>;
  onInputChange: (change: SceneSelectionState) => void;
  onSave?: () => void;
}

const SCENE_SELECTION_PANE_EVENT_TYPES = ["click-save"] as const;

export function SceneSelectionPaneView({
  historyChildren,
  paneParams,
  onInputChange,
  onSave,
}: SceneSelectionPaneViewProps): React.JSX.Element {
  const definition = React.useMemo(
    () => (slots: Readonly<Record<string, HTMLDivElement>>) =>
      createSceneSelectionPaneDefinition(slots.history),
    [],
  );
  const normalizedPaneParams = {
    ...paneParams,
    inputtedData: {
      ...paneParams.inputtedData,
      taskId: paneParams.inputtedData.taskId ?? null,
      sourceGroupId: paneParams.inputtedData.sourceGroupId ?? null,
      labelBranchId: paneParams.inputtedData.labelBranchId ?? null,
    },
  };

  return (
    <>
      <TweakpanePaneHost
        definition={definition}
        onInputChange={onInputChange}
        onPaneEvent={onSave == null ? undefined : () => onSave()}
        paneEventTypes={SCENE_SELECTION_PANE_EVENT_TYPES}
        paneParams={normalizedPaneParams}
        slots={{ history: historyChildren ?? null }}
      />
    </>
  );
}
