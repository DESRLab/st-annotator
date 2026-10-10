import { default as React, useMemo } from "react";

import { HistoryItemStatus } from "../../labelset";
import type { HistoryItem } from "../../labelset";
import { useEditorIntents, useEditorSelector } from "../../store";
import type { FramePlayback } from "../FramePlayback";

import { FrameInspectorPaneView } from "./FrameInspectorPane.react.tsx";
import type { FrameInspectorState } from "./FrameInspectorPane.react.tsx";
import { FramePathMenuView } from "./FramePathMenu.react.tsx";
import { ProjectPaneView } from "./ProjectPane.react.tsx";
import { SceneSelectionPaneView } from "./SceneSelectionPane.react.tsx";
import type { SceneSelectionState } from "./SceneSelectionPane.react.tsx";

interface LabelsetHistoryListViewProps {
  history: readonly HistoryItem[];
  disabled: boolean;
  onSelect: (historyItem: HistoryItem) => void;
}

/** Renders the labelset history inside the Scene pane's native Tweakpane slot. */
function LabelsetHistoryListView({
  history,
  disabled,
  onSelect,
}: LabelsetHistoryListViewProps): React.JSX.Element {
  const selectedItemRef = React.useRef<HTMLDivElement | null>(null);
  const reversedHistory = useMemo(() => [...history].reverse(), [history]);

  React.useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [reversedHistory]);

  return (
    <div
      className="scrolllist labelset-history"
      style={{
        minHeight: "128px",
        height: "128px",
        overflowX: "hidden",
        overflowY: "scroll",
        resize: "vertical",
      }}
    >
      {reversedHistory.map((historyItem, index) => {
        const isDisabled =
          disabled ||
          (historyItem.status === HistoryItemStatus.SAVED &&
            !historyItem.isSavepoint);
        const className = [
          "scrolllist-item",
          historyItem.isCurrent ? "selected" : "",
          isDisabled ? "disabled" : "",
          historyItem.status === HistoryItemStatus.INACTIVE ? "inactive" : "",
          historyItem.status === HistoryItemStatus.SAVED ? "saved" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            aria-disabled={isDisabled}
            aria-selected={historyItem.isCurrent}
            className={className}
            key={`${index}:${historyItem.name}:${historyItem.details}`}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={() => {
              if (!isDisabled) onSelect(historyItem);
            }}
            ref={historyItem.isCurrent ? selectedItemRef : null}
            title={historyItem.details}
          >
            {historyItem.name}
          </div>
        );
      })}
    </div>
  );
}

export interface ProjectMenuViewProps {
  /** The frame playback driving the Scene tab (narrow imperative bridge). */
  playback: FramePlayback;
}

/**
 * The Project panel: navigation selection, labelset history and frame
 * inspection, read from the editor state snapshot and written through the
 * editor intents.
 */
export function ProjectMenuView({
  playback,
}: ProjectMenuViewProps): React.JSX.Element {
  const tasks = useEditorSelector((state) => state.navigation.task.items);
  const taskId = useEditorSelector((state) => state.navigation.task.currentId);
  const sourceGroups = useEditorSelector(
    (state) => state.navigation.sourceGroup.items,
  );
  const sourceGroupId = useEditorSelector(
    (state) => state.navigation.sourceGroup.currentId,
  );
  const labelBranches = useEditorSelector(
    (state) => state.navigation.labelBranch.items,
  );
  const labelBranchId = useEditorSelector(
    (state) => state.navigation.labelBranch.currentId,
  );
  const framesById = useEditorSelector((state) => state.navigation.frames.byId);
  const isNavigating = useEditorSelector(
    (state) => state.navigation.isNavigating,
  );
  const bounds = useEditorSelector((state) => state.navigation.bounds);
  const activeFrameId = useEditorSelector(
    (state) => state.navigation.frames.activeId,
  );
  const labelset = useEditorSelector((state) => state.labelset);
  const intents = useEditorIntents();

  const frameProgress = useMemo(() => {
    let completed = 0;
    for (const frame of framesById.values()) {
      if (frame.isComplete) completed += 1;
    }
    return { completed, total: framesById.size };
  }, [framesById]);

  const activeFrame =
    activeFrameId == null ? undefined : framesById.get(activeFrameId);
  const isNavigationDisabled = labelset.branchId == null || labelset.isSaving;

  const onSceneSelectionChange = ({
    taskId: nextTaskId,
    sourceGroupId: nextSourceGroupId,
    labelBranchId: nextLabelBranchId,
  }: SceneSelectionState): void => {
    if (nextTaskId !== taskId) intents.setTask(nextTaskId);
    else if (nextSourceGroupId !== sourceGroupId)
      intents.setSourceGroup(nextSourceGroupId);
    else if (nextLabelBranchId !== labelBranchId)
      intents.setLabelBranch(nextLabelBranchId);
  };

  return (
    <ProjectPaneView
      paneParams={{
        settings: { disabled: false, hidden: false },
      }}
      tabChildren={{
        Task: (
          <SceneSelectionPaneView
            onInputChange={onSceneSelectionChange}
            onSave={intents.saveLabelset.bind(intents)}
            paneParams={{
              inputtedData: {
                taskId,
                sourceGroupId,
                labelBranchId,
                frameProgress,
              },
              internalData: {
                tasks,
                sourceGroups,
                labelBranches,
                unsavedBranchIds: labelset.unsavedBranchIds,
                isSaving: labelset.isSaving,
              },
              settings: {
                disabled: isNavigating || isNavigationDisabled,
                hidden: false,
                disableSave:
                  labelset.branchId == null || !labelset.hasUnsavedChanges,
              },
            }}
            historyChildren={
              <LabelsetHistoryListView
                disabled={isNavigationDisabled}
                history={labelset.history}
                onSelect={(historyItem) =>
                  intents.rebaseLabelset(historyItem.id)
                }
              />
            }
          />
        ),
        Scene: <FramePathMenuView playback={playback} />,
        Frame: (
          <FrameInspectorPaneView
            onInputChange={({ status }: Partial<FrameInspectorState>): void => {
              if (status != null) intents.setFrameStatus(status === "complete");
            }}
            paneParams={{
              inputtedData: {
                xBounds: bounds?.x ?? null,
                yBounds: bounds?.y ?? null,
                zBounds: bounds?.z ?? null,
                tBounds: bounds?.t ?? null,
                status:
                  (activeFrame?.isComplete ?? true) ? "complete" : "incomplete",
              },
              settings: {
                disabled: isNavigating || activeFrameId == null,
                hidden: false,
                disableSTInput: true,
              },
            }}
          />
        ),
      }}
    />
  );
}
