import {
  default as React,
  useCallback,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import { FrameSortFunction, NavigatorAxis } from "../../nav";
import type { EditableFrame } from "../../nav";
import { useSourceEventVersion } from "../../widgets/useSourceEvent.react.ts";
import type { FramePlayback } from "../FramePlayback";

import { FramePathPaneView } from "./FramePathPane.react.tsx";
import type {
  FramePathPaneData,
  FramePathPaneSettings,
  FramePathState,
} from "./FramePathPane.react.tsx";

type NavigatorAxisType = (typeof NavigatorAxis)[keyof typeof NavigatorAxis];

interface FramePathListItem {
  frame: EditableFrame;
  id: number;
  text: string;
  description: string;
  disabled: boolean;
  isComplete: boolean;
}

interface FramePathListViewProps {
  items: readonly FramePathListItem[];
  selectedFrame: EditableFrame | null;
  disabled: boolean;
  onSelect: (frame: EditableFrame, button: 0 | 2) => void;
}

interface FramePathListRowProps {
  item: FramePathListItem;
  disabled: boolean;
  selected: boolean;
  onSelect: (frame: EditableFrame, button: 0 | 2) => void;
}

function FramePathListRow({
  item,
  disabled,
  selected,
  onSelect,
}: FramePathListRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect((): (() => void) | undefined => {
    if (!selected) return undefined;

    const scrollToRow = (): void =>
      rowRef.current?.scrollIntoView({ block: "nearest" });
    scrollToRow();

    // Tweakpane initially renders this React portal into a detached, hidden
    // tab. Retry after attachment, and when selecting the Scene tab gives
    // the row a layout box, so the browser can actually perform the scroll.
    const animationFrame = requestAnimationFrame(scrollToRow);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries): void => {
            if (
              entries.some(
                ({ contentRect }) =>
                  contentRect.width > 0 || contentRect.height > 0,
              )
            ) {
              scrollToRow();
            }
          });
    if (rowRef.current != null) resizeObserver?.observe(rowRef.current);

    return (): void => {
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [selected]);

  const isDisabled = disabled || item.disabled;

  return (
    <div
      aria-disabled={isDisabled}
      aria-selected={selected}
      className={`scrolllist-item frame-path-item${item.isComplete ? " complete" : ""}${selected ? " selected" : ""}${isDisabled ? " disabled" : ""}`}
      data-frame-id={String(item.id)}
      data-frame-status={item.isComplete ? "complete" : "incomplete"}
      data-test="editor-frame-row"
      onClick={(): void => {
        if (!isDisabled) onSelect(item.frame, 0);
      }}
      onContextMenu={(event): void => event.preventDefault()}
      onMouseDown={(event): void => {
        if (event.button !== 2 || isDisabled) return;
        event.preventDefault();
        onSelect(item.frame, 2);
      }}
      ref={rowRef}
      role="option"
      tabIndex={isDisabled ? -1 : 0}
      title={item.description}
    >
      {item.text}
    </div>
  );
}

export function FramePathListView({
  items,
  selectedFrame,
  disabled,
  onSelect,
}: FramePathListViewProps): React.JSX.Element {
  return (
    <div
      aria-label="Frame path"
      className={`scrolllist frame-path react-frame-path-list${disabled ? " disabled" : ""}`}
      role="listbox"
      style={{
        height: "128px",
        minHeight: "128px",
        overflowX: "hidden",
        overflowY: "scroll",
        resize: "vertical",
      }}
    >
      {items.map((item) => (
        <FramePathListRow
          disabled={disabled}
          item={item}
          key={item.id}
          onSelect={onSelect}
          selected={item.frame === selectedFrame}
        />
      ))}
    </div>
  );
}

function getDisplayAxis(sortFunc: FrameSortFunction): NavigatorAxisType {
  switch (sortFunc) {
    case FrameSortFunction.XYT:
    case FrameSortFunction.XTY:
      return NavigatorAxis.X_BOUNDS;
    case FrameSortFunction.YXT:
    case FrameSortFunction.YTX:
      return NavigatorAxis.Y_BOUNDS;
    case FrameSortFunction.TXY:
    case FrameSortFunction.TYX:
      return NavigatorAxis.T_BOUNDS;
    default:
      throw new Error(`Invalid sortFunc: ${sortFunc}`);
  }
}

function formatFrameAttribute(
  displayAxis: NavigatorAxisType,
  frame: EditableFrame,
): string {
  const { x: xCenter, y: yCenter, z: zCenter } = frame.getSpatialCenter();
  const tCenter = frame.getTimestampCenter();

  switch (displayAxis) {
    case NavigatorAxis.X_BOUNDS:
      return `(x = ${xCenter}, ...)`;
    case NavigatorAxis.Y_BOUNDS:
      return `(y = ${yCenter}, ...)`;
    case NavigatorAxis.Z_BOUNDS:
      return `(z = ${zCenter}, ...)`;
    case NavigatorAxis.T_BOUNDS:
      return `(t = ${tCenter}, ...)`;
    default:
      throw new Error(`Invalid displayAxis: ${displayAxis}`);
  }
}

export function createFramePathListItems(
  playback: FramePlayback,
  showAllFrames: boolean,
): readonly FramePathListItem[] {
  const { context, path, sortFunc } = playback;
  const displayAxis = getDisplayAxis(sortFunc);

  return sortFunc
    .sortedFrames(context.frames)
    .filter((frame: EditableFrame) => showAllFrames || path.has(frame))
    .map((frame: EditableFrame) => {
      const { id, is_complete: isComplete } = frame;
      const idx = path.getIdxOf(frame);
      const idText = idx == null ? `[F{${id}}]` : `[F{${id}}|#${idx}]`;
      const { x: xCenter, y: yCenter, z: zCenter } = frame.getSpatialCenter();
      const tCenter = frame.getTimestampCenter();

      return {
        frame,
        id,
        text: `${idText} ${formatFrameAttribute(displayAxis, frame)}`,
        description:
          `x: ${xCenter}\n` +
          `y: ${yCenter}\n` +
          `z: ${zCenter}\n` +
          `t: ${tCenter}\n` +
          `Status: ${isComplete ? "Complete" : "Incomplete"} [Right-click to cycle]`,
        disabled: !path.has(frame),
        isComplete,
      };
    });
}

function getStatusText(playback: FramePlayback): string {
  if (playback.context.isNavigating) return "Navigating";
  if (playback.isPlaying) return playback.isBuffering ? "Buffering" : "Playing";
  return "Paused";
}

function useFramePathUpdates(playback: FramePlayback): () => void {
  const [, refresh] = useReducer((version: number): number => version + 1, 0);

  const context = playback.context;
  useSourceEventVersion(playback, "change");
  useSourceEventVersion(context, "isNavigating-changed");
  useSourceEventVersion(context, "edit-frame");
  useSourceEventVersion(context, "nav-frame");
  useSourceEventVersion(context, "nav-source-group");

  return refresh;
}

interface FramePathMenuViewProps {
  playback: FramePlayback;
}

export function FramePathMenuView({
  playback,
}: FramePathMenuViewProps): React.JSX.Element {
  const [showAllFrames, setShowAllFrames] = useState(true);

  const refresh = useFramePathUpdates(playback);
  const { context, path } = playback;
  const currentIdx = playback.currentIdx;
  const minIdx = 0;
  const maxIdx = path.length - 1;
  const disableNav = playback.isPlaying || context.isNavigating;
  const items = createFramePathListItems(playback, showAllFrames);

  const onInputChange = useCallback(
    (change: Partial<FramePathState>): void => {
      const nextSortFunc = change.sortFunc ?? playback.sortFunc;
      const nextStride = change.stride ?? playback.stride;

      if (
        playback.sortFunc !== nextSortFunc ||
        playback.stride !== nextStride
      ) {
        playback.sortFunc = nextSortFunc;
        playback.stride = nextStride;
      } else if (
        change.currentId !== undefined &&
        playback.currentId !== change.currentId
      ) {
        const frame = context.frames.elements.find(
          (candidate: EditableFrame) => candidate.id === change.currentId,
        );
        if (frame != null) playback.currentId = change.currentId;
      } else if (
        change.currentIdx !== undefined &&
        playback.currentIdx !== change.currentIdx
      ) {
        playback.currentIdx = change.currentIdx;
      }

      if (change.fps !== undefined) playback.fps = change.fps;
      if (change.showAllFrames !== undefined)
        setShowAllFrames(change.showAllFrames);
      refresh();
    },
    [context.frames.elements, playback, refresh],
  );

  const onStepPrev = useCallback((): void => {
    if (disableNav || currentIdx == null || currentIdx <= minIdx) return;
    playback.currentIdx = Math.max(minIdx, currentIdx - 1);
    refresh();
  }, [currentIdx, disableNav, playback, refresh]);

  const onStepNext = useCallback((): void => {
    if (disableNav || currentIdx == null || currentIdx >= maxIdx) return;
    playback.currentIdx = Math.min(maxIdx, currentIdx + 1);
    refresh();
  }, [currentIdx, disableNav, maxIdx, playback, refresh]);

  const onPlayPause = useCallback((): void => {
    if (path.length <= 1) return;
    playback.isPlaying = !playback.isPlaying;
    refresh();
  }, [path.length, playback, refresh]);

  const onSelect = useCallback(
    (frame: EditableFrame, button: 0 | 2): void => {
      if (button === 0) {
        void context.displayFrame(frame);
      } else {
        // A failed update keeps the frame's local state (and the retry
        // path); report it instead of letting the update escape unhandled.
        frame
          .updateIsComplete(!frame.is_complete)
          .catch((error) =>
            console.error("Failed to update frame status:", error),
          );
      }
    },
    [context],
  );

  const computedData: FramePathPaneData = {
    minIdx,
    maxIdx,
    playPauseText: playback.isPlaying ? "Pause Video" : "Play Video",
    statusText: getStatusText(playback),
    bufferText: `[${playback.getBufferText()}]`,
  };
  const settings: FramePathPaneSettings = {
    disabled: false,
    hidden: false,
    disablePlayPause: minIdx === maxIdx,
    disableNav,
    disableStepPrev: (currentIdx ?? minIdx) === minIdx,
    disableStepNext: (currentIdx ?? maxIdx) === maxIdx,
  };

  return (
    <FramePathPaneView
      onInputChange={onInputChange}
      onPlayPause={onPlayPause}
      onStepNext={onStepNext}
      onStepPrev={onStepPrev}
      paneParams={{
        inputtedData: {
          sortFunc: playback.sortFunc,
          stride: playback.stride,
          showAllFrames,
          currentId: playback.currentId ?? -1,
          currentIdx: currentIdx ?? minIdx,
          fps: playback.fps,
        },
        computedData,
        settings,
      }}
    >
      <FramePathListView
        disabled={disableNav}
        items={items}
        onSelect={onSelect}
        selectedFrame={context.currentFrame ?? null}
      />
    </FramePathPaneView>
  );
}
