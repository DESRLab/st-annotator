import { FrameSortFunction } from "../../nav";
import { PaneElementFactoryBuilder } from "../../widgets";
import type { PaneElementFactory, PaneElementParams } from "../../widgets";

interface FramePathInputtedData {
  sortFunc: FrameSortFunction;
  stride: number;
  showAllFrames: boolean;
  currentId: number;
  currentIdx: number;
  fps: number;
}

interface FramePathComputedData {
  minIdx: number;
  maxIdx: number;
  playPauseText: string;
  statusText: string;
  bufferText: string;
}

export interface FramePathPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disablePlayPause: boolean;
  disableNav: boolean;
  disableStepPrev: boolean;
  disableStepNext: boolean;
}

export interface FramePathSource {
  minIdx: number;
  maxIdx: number;
  playPauseText: string;
  statusText: string;
  bufferText: string;
}

export type FramePathPaneData = FramePathSource;

export interface FramePathState {
  sortFunc: FrameSortFunction;
  stride: number;
  showAllFrames: boolean;
  currentId: number;
  currentIdx: number;
  fps: number;
}

export interface FramePathPaneParams {
  inputtedData: FramePathInputtedData;
  computedData: FramePathComputedData;
  settings: FramePathPaneSettings;
  internalData: FramePathSource | null;
  outputData: FramePathState;
}

type FramePathPaneElementParams = PaneElementParams<FramePathPaneParams>;

export interface FramePathPaneEventMap {
  "click-stepPrev": {};
  "click-playPause": {};
  "click-stepNext": {};
}

/**
 * Represents a UI to traverse a sequence of frames.
 *
 */
/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
const framePathPaneFactoryParams = {
  inputtedData: {
    sortFunc: FrameSortFunction.TXY,
    stride: 5,
    showAllFrames: true,
    currentId: -1,
    currentIdx: 0,
    fps: 3,
  },
  computedData: {
    minIdx: 0,
    maxIdx: 0,
    playPauseText: "",
    statusText: "",
    bufferText: "",
  },
  settings: {
    disabled: false,
    hidden: false,
    disablePlayPause: false,
    disableNav: false,
    disableStepPrev: false,
    disableStepNext: false,
  },
};

function getStepPrevButtonSettings({
  settings: { disabled, hidden, disableNav, disableStepPrev },
}: Pick<FramePathPaneParams, "settings">): {
  title: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    title: "< Step",
    disabled: disabled || disableNav || disableStepPrev,
    hidden,
  };
}

function getPlayPauseButtonSettings({
  computedData: { playPauseText },
  settings: { disabled, hidden, disablePlayPause },
}: Pick<FramePathPaneParams, "computedData" | "settings">): {
  title: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    title: playPauseText,
    disabled: disabled || disablePlayPause,
    hidden,
  };
}

function getStepNextButtonSettings({
  settings: { disabled, hidden, disableNav, disableStepNext },
}: Pick<FramePathPaneParams, "settings">): {
  title: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    title: "Step >",
    disabled: disabled || disableNav || disableStepNext,
    hidden,
  };
}

export function createFramePathPaneElementFactory(
  pathElem: HTMLElement,
): PaneElementFactory<FramePathPaneElementParams, FramePathPaneEventMap> {
  pathElem.classList.add("frame-path");
  pathElem.style.height = "128px";
  pathElem.style.minHeight = "128px";

  const builder = new PaneElementFactoryBuilder(framePathPaneFactoryParams, [
    "click-stepPrev",
    "click-playPause",
    "click-stepNext",
  ]);

  const statusElem = document.createElement("div");

  return builder.sequential([
    builder.folder(
      builder.sequential([
        builder.list(["inputtedData", "sortFunc"], {
          options: ({ settings: { disabled, hidden } }) => ({
            label: "Sort by axes:",
            options: Object.values(FrameSortFunction).map((sortFunc) => ({
              text: sortFunc.toString(),
              value: sortFunc,
            })),
            disabled: disabled,
            hidden: hidden,
          }),
        }),
        builder.input(["inputtedData", "stride"], {
          options: ({ settings: { disabled, hidden } }) => ({
            label: "Stride",
            min: -50,
            max: 50,
            step: 1,
            disabled: disabled,
            hidden: hidden,
          }),
        }),
      ]),
      {
        options: ({ settings: { disabled, hidden } }) => ({
          title: "Path Setup",
          disabled: disabled,
          hidden: hidden,
        }),
      },
    ),
    builder.folder(
      builder.sequential([
        builder.htmlContainer({
          options: () => ({ innerElem: pathElem }),
        }),
        builder.separator({
          options: ({ settings: { disabled, hidden } }) => ({
            disabled,
            hidden,
          }),
        }),
        builder.input(["inputtedData", "showAllFrames"], {
          options: ({ settings: { disabled, hidden } }) => ({
            label: "Show all frames",
            disabled: disabled,
            hidden: hidden,
          }),
        }),
        builder.input(["inputtedData", "currentId"], {
          options: ({ settings: { disabled, hidden, disableNav } }) => ({
            label: "Current Frame ID",
            step: 1,
            disabled: disabled || disableNav,
            hidden: hidden,
          }),
        }),
      ]),
      {
        options: ({ settings: { disabled, hidden } }) => ({
          title: "Frames",
          disabled: disabled,
          hidden: hidden,
        }),
      },
    ),
    builder.folder(
      builder.sequential([
        builder.input(["inputtedData", "currentIdx"], {
          options: ({
            computedData: { minIdx, maxIdx },
            settings: { disabled, hidden, disableNav },
          }) => ({
            label: "Current index along path:",
            min: minIdx,
            max: maxIdx,
            step: 1,
            disabled: disabled || disableNav,
            hidden: hidden,
          }),
        }),
        builder.input(["inputtedData", "fps"], {
          options: ({ settings: { disabled, hidden } }) => ({
            label: "FPS",
            min: 1,
            max: 10,
            step: 1,
            disabled: disabled,
            hidden: hidden,
          }),
        }),
        builder.separator({
          options: ({ settings: { disabled, hidden } }) => ({
            disabled,
            hidden,
          }),
        }),
        builder.htmlContainer({
          options: { innerElem: statusElem },
          modifyHTML: (
            element,
            { computedData: { statusText, bufferText } },
          ) => {
            element.style.paddingLeft = "var(--cnt-hp)";

            statusElem.textContent = `Status: ${statusText} | Buffer: ${bufferText}`;
            statusElem.style.paddingLeft = "4px";
          },
        }),
        builder.tableRow(
          [
            {
              factory: builder.button({
                options: getStepPrevButtonSettings,
                eventHandlers: {
                  click: (paneElem) =>
                    paneElem.dispatchEvent({
                      type: "click-stepPrev",
                    }),
                },
              }),
              // The default width would otherwise be the full width of the row
              options: { minWidth: "96px", width: "33%" },
            },
            {
              factory: builder.button({
                options: getPlayPauseButtonSettings,
                eventHandlers: {
                  click: (paneElem) =>
                    paneElem.dispatchEvent({
                      type: "click-playPause",
                    }),
                },
              }),
              // The default width would otherwise be the full width of the row
              options: { minWidth: "96px", width: "33%" },
            },
            {
              factory: builder.button({
                options: getStepNextButtonSettings,
                eventHandlers: {
                  click: (paneElem) =>
                    paneElem.dispatchEvent({
                      type: "click-stepNext",
                    }),
                },
              }),
              // The default width would otherwise be the full width of the row
              options: { minWidth: "96px", width: "33%" },
            },
          ],
          {
            options: ({ settings: { disabled, hidden } }) => ({
              label: "Actions:",
              disabled: disabled,
              hidden: hidden,
            }),
            modifyHTML: (element) => {
              const labelContainer = element.querySelector(".tp-lblv_l");
              if (labelContainer instanceof HTMLDivElement) {
                labelContainer.style.display = "none";
              } else {
                console.warn("Cannot find label container");
              }

              const buttonsContainer = element.querySelector(".tp-lblv_v");
              if (buttonsContainer instanceof HTMLDivElement) {
                buttonsContainer.style.width = "100%";
              } else {
                console.warn("Cannot find buttons container");
              }
            },
          },
        ),
      ]),
      {
        options: ({ settings: { disabled, hidden } }) => ({
          title: "Playback",
          disabled: disabled,
          hidden: hidden,
        }),
      },
    ),
  ]);
}

export const framePathPaneDataProcessor = {
  computeData: (
    inputtedData: Readonly<FramePathInputtedData>,
    internalData: Readonly<FramePathSource | null>,
  ) => ({
    minIdx: internalData?.minIdx ?? 0,
    maxIdx: internalData?.maxIdx ?? 0,
    playPauseText: internalData?.playPauseText ?? "",
    statusText: internalData?.statusText ?? "",
    bufferText: internalData?.bufferText ?? "",
  }),
  outputData: (
    paneParams: Readonly<PaneElementParams<FramePathPaneParams>>,
  ) => ({
    sortFunc: paneParams.inputtedData.sortFunc,
    stride: paneParams.inputtedData.stride,
    showAllFrames: paneParams.inputtedData.showAllFrames,
    currentId: paneParams.inputtedData.currentId,
    currentIdx: paneParams.inputtedData.currentIdx,
    fps: paneParams.inputtedData.fps,
  }),
};

export function computeFramePathData(internalData: FramePathSource | null) {
  return {
    minIdx: internalData?.minIdx ?? 0,
    maxIdx: internalData?.maxIdx ?? 0,
    playPauseText: internalData?.playPauseText ?? "",
    statusText: internalData?.statusText ?? "",
    bufferText: internalData?.bufferText ?? "",
  };
}

export function changedOutput(
  prevOutputData: FramePathState,
  outputData: FramePathState,
): Partial<FramePathState> {
  return Object.fromEntries(
    Object.entries(outputData).filter(
      ([key, value]) =>
        !sameFramePathValue(
          (prevOutputData as unknown as Record<string, unknown>)[key],
          value,
        ),
    ),
  );
}

function sameFramePathValue(left: unknown, right: unknown): boolean {
  if (
    typeof left === "object" &&
    left != null &&
    typeof right === "object" &&
    right != null &&
    "toString" in left &&
    typeof left.toString === "function" &&
    "toString" in right &&
    typeof right.toString === "function"
  ) {
    return (
      (left as { toString(): string }).toString() ===
      (right as { toString(): string }).toString()
    );
  }

  return Object.is(left, right);
}
