import { isPlainObject } from "lodash";

import { PaneElementFactoryBuilder } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ParamsMapper,
  LabelClassSelectionItem,
} from "sta/app/editor";

import type { QualityLevel } from "../../../../models";
import type { UUID } from "../data";

import type { LabelInstanceSelectionItem } from "./LabelInstanceSelectionPane.ts";
import {
  createLabelSelectionDescriptorsPaneElementFactory,
  labelSelectionDescriptorsPaneDataProcessor,
  labelSelectionDescriptorsPaneFactoryParams,
} from "./LabelSelectionDescriptorsPane.ts";
import type { LabelSelectionDescriptorsPaneControllerParams } from "./LabelSelectionDescriptorsPane.ts";
import {
  createLabelSelectionRelationsPaneElementFactory,
  labelSelectionRelationsPaneDataProcessor,
  labelSelectionRelationsPaneFactoryParams,
} from "./LabelSelectionRelationsPane.ts";
import type { LabelSelectionRelationsPaneControllerParams } from "./LabelSelectionRelationsPane.ts";
import {
  labelSelectionSelectionPaneDataProcessor,
  labelSelectionSelectionPaneDefaultParams,
} from "./LabelSelectionSelectionPane.ts";
import type {
  LabelSelectionSelectionItem,
  LabelSelectionSelectionPaneControllerParams,
} from "./LabelSelectionSelectionPane.ts";

export interface LabelSelectionInspectorInputtedData {
  selection: LabelSelectionSelectionPaneControllerParams["inputtedData"];
  relations: LabelSelectionRelationsPaneControllerParams["inputtedData"];
  descriptors: LabelSelectionDescriptorsPaneControllerParams["inputtedData"];
}

export interface LabelSelectionInspectorComputedData {
  selection: LabelSelectionSelectionPaneControllerParams["computedData"];
  relations: LabelSelectionRelationsPaneControllerParams["computedData"];
  descriptors: LabelSelectionDescriptorsPaneControllerParams["computedData"];
}

export interface LabelSelectionInspectorPaneSettings {
  disabled: boolean;
  hidden: boolean;
  drawSelectionActive: boolean;
  disableInstanceInput: boolean;
}

export interface LabelSelectionInspectorSource {
  selections: ReadonlyMap<UUID, LabelSelectionSelectionItem>;
  instances: ReadonlyMap<UUID, LabelInstanceSelectionItem>;
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

export interface LabelSelectionParams {
  selectionId: UUID | null;
  instanceId: UUID | null;
  classId: number | null;
  distinctiveLv: QualityLevel;
  occlusionLv: QualityLevel;
}

export interface LabelSelectionInspectorPaneControllerParams {
  inputtedData: LabelSelectionInspectorInputtedData;
  computedData: LabelSelectionInspectorComputedData;
  settings: LabelSelectionInspectorPaneSettings;
  internalData: LabelSelectionInspectorSource | null;
  outputData: LabelSelectionParams;
}

type LabelSelectionInspectorPaneElementParams =
  PaneElementParams<LabelSelectionInspectorPaneControllerParams>;

export function cloneLabelSelectionInspectorInputtedData<
  TInputtedData extends Partial<LabelSelectionInspectorInputtedData>,
>(inputtedData: TInputtedData): TInputtedData {
  const cloneValue = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value != null && typeof value === "object") {
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

  return cloneValue(inputtedData) as TInputtedData;
}

// Same highlight as the selected Actions-menu cells (SelectGrid), which use
// the editor's "selection = royalblue + white" convention.
export const DRAW_ACTIVE_BUTTON_STYLE = {
  backgroundColor: "var(--selectgrid-selected-bg, royalblue)",
  color: "var(--selectgrid-selected-fg, #fff)",
} as const;

export function getLabelSelectionInspectorOutputData(
  paneParams: Readonly<LabelSelectionInspectorPaneElementParams>,
): LabelSelectionParams {
  const { selectionId } = labelSelectionSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.selection,
    computedData: paneParams.computedData.selection,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { instanceId, classId } =
    labelSelectionRelationsPaneDataProcessor.outputData({
      inputtedData: paneParams.inputtedData.relations,
      computedData: paneParams.computedData.relations,
      settings: {
        disabled: paneParams.settings.disabled,
        hidden: paneParams.settings.hidden,
        disableInstanceInput: paneParams.settings.disableInstanceInput,
      },
    });
  const { distinctiveLv, occlusionLv } =
    labelSelectionDescriptorsPaneDataProcessor.outputData({
      inputtedData: paneParams.inputtedData.descriptors,
      computedData: paneParams.computedData.descriptors,
      settings: {
        disabled: paneParams.settings.disabled,
        hidden: paneParams.settings.hidden,
      },
    });

  return { selectionId, instanceId, classId, distinctiveLv, occlusionLv };
}

export const labelSelectionInspectorPaneFactoryParams: PaneElementParams<LabelSelectionInspectorPaneControllerParams> =
  {
    inputtedData: {
      selection: labelSelectionSelectionPaneDefaultParams.inputtedData,
      relations: labelSelectionRelationsPaneFactoryParams.inputtedData,
      descriptors: labelSelectionDescriptorsPaneFactoryParams.inputtedData,
    },
    computedData: {
      selection: labelSelectionSelectionPaneDefaultParams.computedData,
      relations: labelSelectionRelationsPaneFactoryParams.computedData,
      descriptors: labelSelectionDescriptorsPaneFactoryParams.computedData,
    },
    settings: {
      disabled: false,
      hidden: false,
      drawSelectionActive: false,
      disableInstanceInput: false,
    },
  };

export function getLabelSelectionInspectorDrawSelectionButtonSettings({
  settings: { disabled, hidden },
}: Readonly<LabelSelectionInspectorPaneElementParams>): {
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

export function createLabelSelectionInspectorPaneElementFactory(
  selectionElement: HTMLElement,
  instanceSelectionElement: HTMLElement,
): PaneElementFactory<
  PaneElementParams<LabelSelectionInspectorPaneControllerParams>,
  { "click-drawSelection": any }
> {
  const builder = new PaneElementFactoryBuilder(
    labelSelectionInspectorPaneFactoryParams,
    ["click-drawSelection"],
  );
  const relationsParamsMapper: ParamsMapper<
    PaneElementParams<LabelSelectionInspectorPaneControllerParams>,
    PaneElementParams<LabelSelectionRelationsPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.relations,
      computedData: outer.computedData.relations,
      settings: {
        disabled: outer.settings.disabled,
        hidden: outer.settings.hidden,
        disableInstanceInput: outer.settings.disableInstanceInput,
      },
    }),
    innerToOuter: (inner) => ({
      inputtedData: { relations: inner.inputtedData },
    }),
  };
  const descriptorsParamsMapper: ParamsMapper<
    PaneElementParams<LabelSelectionInspectorPaneControllerParams>,
    PaneElementParams<LabelSelectionDescriptorsPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.descriptors,
      computedData: outer.computedData.descriptors,
      settings: {
        disabled: outer.settings.disabled,
        hidden: outer.settings.hidden,
      },
    }),
    innerToOuter: (inner) => ({
      inputtedData: { descriptors: inner.inputtedData },
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
              getLabelSelectionInspectorDrawSelectionButtonSettings(paneParams),
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

              const drawActive = paneParams.settings.drawSelectionActive;
              buttonElem.title =
                getLabelSelectionInspectorDrawSelectionButtonSettings(
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
                  type: "click-drawSelection",
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
        createLabelSelectionRelationsPaneElementFactory(
          instanceSelectionElement,
        ),
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
    builder.folder(
      builder.mapped(
        createLabelSelectionDescriptorsPaneElementFactory(),
        descriptorsParamsMapper,
        builder.identityEventMapper(),
      ),
      {
        options: ({ settings: { disabled, hidden } }) => ({
          title: "Descriptors",
          disabled,
          hidden,
        }),
      },
    ),
  ]);
}

export const labelSelectionInspectorPaneDataProcessor: PaneControllerDataProcessor<LabelSelectionInspectorPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      selection: labelSelectionSelectionPaneDataProcessor.computeData(
        inputtedData.selection,
        internalData,
      ),
      relations: labelSelectionRelationsPaneDataProcessor.computeData(
        inputtedData.relations,
        internalData,
      ),
      descriptors: labelSelectionDescriptorsPaneDataProcessor.computeData(
        inputtedData.descriptors,
        internalData ?? {},
      ),
    }),
    outputData: getLabelSelectionInspectorOutputData,
  };
