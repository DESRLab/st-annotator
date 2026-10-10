import { isPlainObject } from "lodash";

import { PaneElementFactoryBuilder } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  ParamsMapper,
  PaneElementParams,
  LabelClassSelectionItem,
} from "sta/app/editor";

import type { UUID } from "../data";

import {
  createLabelVectorRelationsPaneElementFactory,
  labelVectorRelationsPaneDataProcessor,
  labelVectorRelationsPaneFactoryParams,
} from "./LabelVectorRelationsPane.ts";
import type { LabelVectorRelationsPaneControllerParams } from "./LabelVectorRelationsPane.ts";
import {
  labelVectorSelectionPaneDataProcessor,
  labelVectorSelectionPaneDefaultParams,
} from "./LabelVectorSelectionPane.ts";
import type {
  LabelVectorSelectionItem,
  LabelVectorSelectionPaneControllerParams,
} from "./LabelVectorSelectionPane.ts";

export interface LabelVectorInspectorInputtedData {
  selection: LabelVectorSelectionPaneControllerParams["inputtedData"];
  relations: LabelVectorRelationsPaneControllerParams["inputtedData"];
}

export interface LabelVectorInspectorComputedData {
  selection: LabelVectorSelectionPaneControllerParams["computedData"];
  relations: LabelVectorRelationsPaneControllerParams["computedData"];
}

export interface LabelVectorInspectorPaneSettings {
  disabled: boolean;
  hidden: boolean;
  drawVectorActive: boolean;
  disableTransform: boolean;
}

export interface LabelVectorInspectorSource {
  vectors: ReadonlyMap<UUID, LabelVectorSelectionItem>;
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

export interface LabelVectorParams {
  vectorId: UUID | null;
  classId: number | null;
}

export interface LabelVectorInspectorPaneControllerParams {
  inputtedData: LabelVectorInspectorInputtedData;
  computedData: LabelVectorInspectorComputedData;
  settings: LabelVectorInspectorPaneSettings;
  internalData: LabelVectorInspectorSource | null;
  outputData: LabelVectorParams;
}

type LabelVectorInspectorPaneElementParams =
  PaneElementParams<LabelVectorInspectorPaneControllerParams>;

export function cloneLabelVectorInspectorInputtedData<T>(inputtedData: T): T {
  const cloneValue = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value != null && typeof value === "object") {
      // IDs for locally-created vectors are unresolved Placeholder
      // instances. Preserve domain objects: converting a Placeholder to
      // a plain object makes selection validation treat it as unknown.
      if (
        !isPlainObject(value) ||
        Object.values(value).some((entry) => typeof entry === "function")
      )
        return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          cloneValue(nestedValue),
        ]),
      );
    }
    return value;
  };

  return cloneValue(inputtedData);
}

// Same highlight as the selected Actions-menu cells (SelectGrid), which use
// the editor's "selection = royalblue + white" convention.
export const DRAW_ACTIVE_BUTTON_STYLE = {
  backgroundColor: "var(--selectgrid-selected-bg, royalblue)",
  color: "var(--selectgrid-selected-fg, #fff)",
} as const;

export function getLabelVectorInspectorOutputData(
  paneParams: LabelVectorInspectorPaneElementParams,
) {
  const { vectorId } = labelVectorSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.selection,
    computedData: paneParams.computedData.selection,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { classId } = labelVectorRelationsPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.relations,
    computedData: paneParams.computedData.relations,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });

  return { vectorId, classId };
}

export const labelVectorInspectorPaneFactoryParams: LabelVectorInspectorPaneElementParams =
  {
    inputtedData: {
      selection: labelVectorSelectionPaneDefaultParams.inputtedData,
      relations: labelVectorRelationsPaneFactoryParams.inputtedData,
    },
    computedData: {
      selection: labelVectorSelectionPaneDefaultParams.computedData,
      relations: labelVectorRelationsPaneFactoryParams.computedData,
    },
    settings: {
      disabled: false,
      hidden: false,
      drawVectorActive: false,
      disableTransform: false,
    },
  };

export function getLabelVectorInspectorDrawVectorButtonSettings({
  settings: { disabled, hidden },
}: LabelVectorInspectorPaneElementParams): {
  title: string;
  tooltip: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    title: "D",
    tooltip: "Toggle Draw Mode",
    disabled,
    hidden,
  };
}

export function createLabelVectorInspectorPaneElementFactory(
  selectionElement: HTMLElement,
): PaneElementFactory<
  LabelVectorInspectorPaneElementParams,
  { "click-drawVector": any }
> {
  const builder = new PaneElementFactoryBuilder(
    labelVectorInspectorPaneFactoryParams,
    ["click-drawVector"],
  );
  const relationsParamsMapper: ParamsMapper<
    LabelVectorInspectorPaneElementParams,
    PaneElementParams<LabelVectorRelationsPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.relations,
      computedData: outer.computedData.relations,
      settings: {
        disabled: outer.settings.disabled,
        hidden: outer.settings.hidden,
      },
    }),
    innerToOuter: (inner) => ({
      inputtedData: { relations: inner.inputtedData },
    }),
  };

  const selectionFactory = builder.htmlContainer({
    options: { innerElem: selectionElement },
  });

  return builder.sequential([
    builder.tableRow(
      [
        {
          factory: selectionFactory,
          options: { minWidth: "128px" },
        },
        {
          factory: builder.button({
            options: (paneParams) =>
              getLabelVectorInspectorDrawVectorButtonSettings(paneParams),
            modifyHTML: (element, paneParams) => {
              if (element instanceof HTMLDivElement) {
                element.style.marginTop = "0";
              } else {
                console.warn("Unexpected type of cell container");
              }

              const [buttonElem] = element.getElementsByTagName("button");
              if (buttonElem === undefined) {
                throw new Error("Cannot find button");
              }

              const drawActive = paneParams.settings.drawVectorActive;
              buttonElem.title =
                getLabelVectorInspectorDrawVectorButtonSettings(
                  paneParams,
                ).tooltip;
              buttonElem.style.backgroundColor = drawActive
                ? DRAW_ACTIVE_BUTTON_STYLE.backgroundColor
                : "";
              buttonElem.style.color = drawActive
                ? DRAW_ACTIVE_BUTTON_STYLE.color
                : "";
            },
            eventHandlers: {
              click: (paneElem) =>
                paneElem.dispatchEvent({
                  type: "click-drawVector",
                }),
            },
          }),
          options: { width: "24px" },
        },
      ],
      {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "Select item to inspect:",
          disabled,
          hidden,
        }),
      },
    ),
    builder.separator({
      options: ({ settings: { disabled, hidden } }) => ({
        disabled,
        hidden,
      }),
    }),
    builder.folder(
      builder.mapped(
        createLabelVectorRelationsPaneElementFactory(),
        relationsParamsMapper,
        builder.identityEventMapper(),
      ),
      {
        options: ({ settings: { disabled, hidden } }) => ({
          title: "Relationships",
          disabled,
          hidden,
        }),
      },
    ),
  ]);
}

export const labelVectorInspectorPaneDataProcessor: PaneControllerDataProcessor<LabelVectorInspectorPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      selection: labelVectorSelectionPaneDataProcessor.computeData(
        inputtedData.selection,
        internalData,
      ),
      relations: labelVectorRelationsPaneDataProcessor.computeData(
        inputtedData.relations,
        internalData,
      ),
    }),
    outputData: getLabelVectorInspectorOutputData,
  };
