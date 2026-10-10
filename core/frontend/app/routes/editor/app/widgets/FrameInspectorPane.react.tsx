import { default as React } from "react";

import { TweakpanePaneHost } from "../../widgets";

import {
  frameInspectorPaneDefinition,
  sameFrameInspectorValue,
} from "./FrameInspectorPane.ts";
import type {
  FrameInspectorPaneParams,
  FrameInspectorState,
} from "./FrameInspectorPane.ts";

export * from "./FrameInspectorPane.ts";

interface FrameInspectorPaneViewProps {
  paneParams: Pick<FrameInspectorPaneParams, "inputtedData" | "settings">;
  onInputChange: (change: Partial<FrameInspectorState>) => void;
}

export function FrameInspectorPaneView({
  paneParams,
  onInputChange,
}: FrameInspectorPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={frameInspectorPaneDefinition}
      mapOutputChange={({
        outputData,
        prevOutputData,
      }): Partial<FrameInspectorState> =>
        Object.fromEntries(
          Object.entries(outputData).filter(
            ([key, value]) =>
              !sameFrameInspectorValue(
                (prevOutputData as unknown as Record<string, unknown>)[key],
                value,
              ),
          ),
        )
      }
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
