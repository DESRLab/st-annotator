import {
  applyRadiogridDisabledState,
  definePaneElements,
  paneControls,
} from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "sta/app/editor";

export type DrawMode = "corner2corner" | "center2front";

export interface DrawModeInputtedData {
  drawMode: DrawMode;
}

export interface DrawModePaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface DrawModeSelection {
  drawMode: DrawMode;
}

export interface DrawModePaneControllerParams {
  inputtedData: DrawModeInputtedData;
  computedData: {};
  settings: DrawModePaneSettings;
  internalData: {};
  outputData: DrawModeSelection;
}

type DrawModePaneElementParams =
  PaneElementParams<DrawModePaneControllerParams>;

/**
 * Represents a UI to select a {@link DrawMode}.
 */
export const drawModePaneFactoryParams: DrawModePaneElementParams = {
  inputtedData: { drawMode: "corner2corner" },
  computedData: {},
  settings: { disabled: false, hidden: false },
};

export const drawModePaneModes: readonly DrawMode[] = [
  "corner2corner",
  "center2front",
];
export const drawModePaneLabels: readonly string[] = ["Corner", "Center"];

export function getDrawModePaneSelectSettings({
  settings: { disabled, hidden },
}: Readonly<DrawModePaneElementParams>) {
  return {
    view: "radiogrid",
    groupName: "drawMode",
    size: [2, 1],
    label: "Draw Origin",
    cells: (x: number) => ({
      title: drawModePaneLabels[x],
      value: drawModePaneModes[x],
    }),
    disabled,
    hidden,
  };
}

/**
 * Creates a {@link PaneElementFactory} that constructs a pane element for
 * {@link DrawModePaneElementParams}.
 *
 * The resulting pane element factory.
 */
export function createDrawModePaneElementFactory(): PaneElementFactory<DrawModePaneElementParams> {
  const controls = paneControls<DrawModePaneElementParams>();
  return definePaneElements(
    drawModePaneFactoryParams,
    [],
    controls.sequential([
      controls.input(["inputtedData", "drawMode"], {
        options: (paneParams) => getDrawModePaneSelectSettings(paneParams),
        modifyHTML: (element, paneParams) =>
          applyRadiogridDisabledState(element, paneParams.settings.disabled),
      }),
    ]),
  );
}

/**
 * Data processor for this pane.
 */
export const drawModePaneDataProcessor: PaneControllerDataProcessor<DrawModePaneControllerParams> =
  {
    computeData: (
      inputtedData: DrawModePaneControllerParams["inputtedData"],
      internalData: DrawModePaneControllerParams["internalData"],
    ) => ({}),
    outputData: (paneParams: Readonly<DrawModePaneElementParams>) => {
      const {
        inputtedData: { drawMode },
      } = paneParams;

      return { drawMode };
    },
  };

/**
 * Creates a new UI to select a {@link DrawMode}.
 *
 * The initial state to set.
 */
