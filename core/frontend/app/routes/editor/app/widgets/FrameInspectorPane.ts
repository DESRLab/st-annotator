import { CoordBounds, Timestamp } from "sta/common";

import {
  applyRadiogridDisabledState,
  PaneElementFactoryBuilder,
} from "../../widgets";
import type { PaneElementParams, TweakpanePaneDefinition } from "../../widgets";

type FrameStatus = "incomplete" | "complete";

interface FrameInspectorInputtedData {
  xBounds: CoordBounds | null;
  yBounds: CoordBounds | null;
  zBounds: CoordBounds | null;
  tBounds: CoordBounds | null;
  status: FrameStatus;
}

interface FrameInspectorPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disableSTInput: boolean;
}

export interface FrameInspectorState {
  xBounds: CoordBounds | null;
  yBounds: CoordBounds | null;
  zBounds: CoordBounds | null;
  tBounds: CoordBounds | null;
  status: FrameStatus;
}

export interface FrameInspectorPaneParams {
  inputtedData: FrameInspectorInputtedData;
  computedData: {};
  settings: FrameInspectorPaneSettings;
  internalData: {};
  outputData: FrameInspectorState;
}

type FrameInspectorPaneElementParams =
  PaneElementParams<FrameInspectorPaneParams>;

const frameInspectorFactoryParams: FrameInspectorPaneElementParams = {
  inputtedData: {
    xBounds: null,
    yBounds: null,
    zBounds: null,
    tBounds: null,
    status: "incomplete",
  },
  computedData: {},
  settings: { disabled: false, hidden: false, disableSTInput: false },
};
const currentStatusGridValues: readonly FrameStatus[] = [
  "incomplete",
  "complete",
];
const currentStatusGridLabels = ["Incomplete", "Complete"] as const;

function getCurrentStatusSelectSettings({
  settings: { disabled, hidden },
}: Pick<FrameInspectorPaneParams, "settings">) {
  return {
    view: "radiogrid",
    groupName: "status",
    size: [2, 1],
    label: "Frame Status",
    cells: (x: number) => ({
      title: currentStatusGridLabels[x],
      value: currentStatusGridValues[x],
    }),
    disabled,
    hidden,
  };
}

/** Native Tweakpane definition hosted by FrameInspectorPaneView. */
export const frameInspectorPaneDefinition: TweakpanePaneDefinition<FrameInspectorPaneParams> & {
  FACTORY_PARAMS: FrameInspectorPaneElementParams;
  currentStatusGridValues: readonly FrameStatus[];
  currentStatusGridLabels: readonly string[];
  getCurrentStatusSelectSettings(
    params: Pick<FrameInspectorPaneParams, "settings">,
  ): any;
} = {
  /**
   * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
   */
  FACTORY_PARAMS: frameInspectorFactoryParams,

  currentStatusGridValues,

  currentStatusGridLabels,

  /**
   * Obtains the settings for the status selector.
   *
   * The parameters of the pane.
   *
   */
  getCurrentStatusSelectSettings,

  /**
   * Creates a {@link PaneElementFactory} that constructs a pane element for
   * {@link FrameInspectorPaneElementParams}.
   *
   * The resulting pane element factory.
   */
  factory: (() => {
    const builder = PaneElementFactoryBuilder.withoutEvents(
      frameInspectorFactoryParams,
    );

    const coordBoundsParser = (value: string) => {
      const parsedValue = JSON.parse(value);
      if (parsedValue == null || !Array.isArray(parsedValue)) return null;

      const [min, max] = parsedValue.map((x) => (x == null ? null : Number(x)));
      return CoordBounds.create({ min, max });
    };

    const coordBoundsFormatter = (value: CoordBounds | null) =>
      `[${value?.min ?? null}, ${value?.max ?? null}]`;

    const timestampBoundsParser = (value: string) => {
      const parsedValue = JSON.parse(value);
      if (parsedValue == null || !Array.isArray(parsedValue)) return null;

      const [min, max] = parsedValue.map((x) => (x == null ? null : Number(x)));
      return CoordBounds.create({ min, max });
    };

    const boundFormatter = (value: number | null) =>
      value == null ? "null" : new Timestamp(value).toISOString();

    const timestampBoundsFormatter = (value: CoordBounds | null) =>
      `[${boundFormatter(value?.min ?? null)}, ${boundFormatter(value?.max ?? null)}]`;

    return builder.sequential([
      builder.text({
        options: ({
          inputtedData: { xBounds },
          settings: { disabled, disableSTInput, hidden },
        }) => ({
          view: "text",
          label: "X Bounds",
          value: xBounds,
          parse: coordBoundsParser,
          format: coordBoundsFormatter,
          disabled: disabled || disableSTInput,
          hidden: hidden,
        }),
        modifyHTML: (element) => {
          const textContainer = element.querySelector(".tp-lblv_v");
          if (textContainer instanceof HTMLDivElement) {
            textContainer.style.width = "66%";
          } else {
            console.warn("Cannot find text container");
          }
        },
      }),
      builder.text({
        options: ({
          inputtedData: { yBounds },
          settings: { disabled, disableSTInput, hidden },
        }) => ({
          view: "text",
          label: "Y Bounds",
          value: yBounds,
          parse: coordBoundsParser,
          format: coordBoundsFormatter,
          disabled: disabled || disableSTInput,
          hidden: hidden,
        }),
        modifyHTML: (element) => {
          const textContainer = element.querySelector(".tp-lblv_v");
          if (textContainer instanceof HTMLDivElement) {
            textContainer.style.width = "66%";
          } else {
            console.warn("Cannot find text container");
          }
        },
      }),
      builder.text({
        options: ({
          inputtedData: { zBounds },
          settings: { disabled, disableSTInput, hidden },
        }) => ({
          view: "text",
          label: "Z Bounds",
          value: zBounds,
          parse: coordBoundsParser,
          format: coordBoundsFormatter,
          disabled: disabled || disableSTInput,
          hidden: hidden,
        }),
        modifyHTML: (element) => {
          const textContainer = element.querySelector(".tp-lblv_v");
          if (textContainer instanceof HTMLDivElement) {
            textContainer.style.width = "66%";
          } else {
            console.warn("Cannot find text container");
          }
        },
      }),
      builder.text({
        options: ({
          inputtedData: { tBounds },
          settings: { disabled, disableSTInput, hidden },
        }) => ({
          view: "text",
          label: "T Bounds",
          value: tBounds,
          parse: timestampBoundsParser,
          format: timestampBoundsFormatter,
          disabled: disabled || disableSTInput,
          hidden: hidden,
        }),
        modifyHTML: (element) => {
          const textContainer = element.querySelector(".tp-lblv_v");
          if (textContainer instanceof HTMLDivElement) {
            textContainer.style.width = "66%";
          } else {
            console.warn("Cannot find text container");
          }
        },
      }),
      builder.separator({
        options: ({ settings: { disabled, hidden } }) => ({
          disabled,
          hidden,
        }),
      }),
      builder.input(["inputtedData", "status"], {
        options: getCurrentStatusSelectSettings,
        modifyHTML: (element, paneParams) => {
          const buttonsContainer = element.querySelector(".tp-lblv_v");
          if (buttonsContainer instanceof HTMLDivElement) {
            buttonsContainer.style.width = "66%";
          } else {
            console.warn("Cannot find buttons container");
          }

          applyRadiogridDisabledState(element, paneParams.settings.disabled);
        },
      }),
    ]);
  })(),

  /**
   * Data processor for this pane.
   */
  dataProcessor: {
    computeData: (
      inputtedData: Readonly<FrameInspectorInputtedData>,
      internalData: Readonly<{}>,
    ) => ({}),
    outputData: (
      paneParams: Readonly<PaneElementParams<FrameInspectorPaneParams>>,
    ) => ({
      xBounds: paneParams.inputtedData.xBounds,
      yBounds: paneParams.inputtedData.yBounds,
      zBounds: paneParams.inputtedData.zBounds,
      tBounds: paneParams.inputtedData.tBounds,
      status: paneParams.inputtedData.status,
    }),
  },
};

export function formatCoordBounds(value: CoordBounds | null) {
  return (
    "[" + String(value?.min ?? null) + ", " + String(value?.max ?? null) + "]"
  );
}

function formatTimestampBound(value: number | null) {
  return value == null ? "null" : new Timestamp(value).toISOString();
}

export function formatTimestampBounds(value: CoordBounds | null) {
  return (
    "[" +
    formatTimestampBound(value?.min ?? null) +
    ", " +
    formatTimestampBound(value?.max ?? null) +
    "]"
  );
}

export function parseCoordBounds(value: string) {
  const parsedValue = JSON.parse(value);
  if (parsedValue == null || !Array.isArray(parsedValue)) return null;
  const [min, max] = parsedValue.map((x) => (x == null ? null : Number(x)));
  return CoordBounds.create({ min, max });
}

export function sameFrameInspectorValue(
  left: unknown,
  right: unknown,
): boolean {
  if (
    typeof left === "object" &&
    left != null &&
    typeof right === "object" &&
    right != null &&
    "min" in left &&
    "max" in left &&
    "min" in right &&
    "max" in right
  ) {
    return left.min === right.min && left.max === right.max;
  }

  return Object.is(left, right);
}
