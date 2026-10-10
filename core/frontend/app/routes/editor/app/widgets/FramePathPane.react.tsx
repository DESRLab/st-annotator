import { default as React } from "react";

import { TweakpanePaneHost } from "../../widgets";
import type { TweakpanePaneDefinition } from "../../widgets";

import {
  changedOutput,
  computeFramePathData,
  createFramePathPaneElementFactory,
  framePathPaneDataProcessor,
} from "./FramePathPane.ts";
import type {
  FramePathPaneData,
  FramePathPaneEventMap,
  FramePathPaneParams,
  FramePathSource,
  FramePathState,
} from "./FramePathPane.ts";

export * from "./FramePathPane.ts";

interface FramePathPaneViewProps {
  paneParams: Pick<FramePathPaneParams, "inputtedData" | "settings"> & {
    computedData?: FramePathPaneData;
    internalData?: FramePathSource | null;
  };
  children?: React.ReactNode;
  onInputChange: (change: Partial<FramePathState>) => void;
  onStepPrev?: () => void;
  onPlayPause?: () => void;
  onStepNext?: () => void;
  onPaneEvent?: (event: { type: string }) => void;
}

export function FramePathPaneView({
  children,
  paneParams,
  onInputChange,
  onStepPrev,
  onPlayPause,
  onStepNext,
  onPaneEvent,
}: FramePathPaneViewProps): React.JSX.Element {
  const internalData =
    paneParams.internalData ??
    paneParams.computedData ??
    computeFramePathData(null);
  const definition = React.useCallback(
    (
      slots: Readonly<Record<string, HTMLDivElement>>,
    ): TweakpanePaneDefinition<FramePathPaneParams, FramePathPaneEventMap> => ({
      dataProcessor: framePathPaneDataProcessor,
      factory: createFramePathPaneElementFactory(slots.path),
    }),
    [],
  );

  return (
    <>
      <TweakpanePaneHost
        definition={definition}
        mapOutputChange={({ prevOutputData, outputData }) =>
          changedOutput(prevOutputData, outputData)
        }
        onInputChange={onInputChange}
        onPaneEvent={(event) => {
          onPaneEvent?.(event);
          if (event.type === "click-stepPrev") onStepPrev?.();
          if (event.type === "click-playPause") onPlayPause?.();
          if (event.type === "click-stepNext") onStepNext?.();
        }}
        paneEventTypes={["click-stepPrev", "click-playPause", "click-stepNext"]}
        paneParams={{
          inputtedData: paneParams.inputtedData,
          internalData,
          settings: paneParams.settings,
        }}
        slots={{ path: children ?? null }}
      />
    </>
  );
}
