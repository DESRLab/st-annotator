import { isPlainObject } from "lodash";

import { PaneElementFactoryBuilder } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ParamsMapper,
  LabelClassSelectionItem,
} from "sta/app/editor";

import type { UUID } from "../data";

import {
  createLabelInstanceDescriptorsPaneElementFactory,
  labelInstanceDescriptorsPaneDataProcessor,
  labelInstanceDescriptorsPaneFactoryParams,
} from "./LabelInstanceDescriptorsPane.ts";
import type { LabelInstanceDescriptorsPaneControllerParams } from "./LabelInstanceDescriptorsPane.ts";
import {
  createLabelInstanceRelationsPaneElementFactory,
  labelInstanceRelationsPaneDataProcessor,
  labelInstanceRelationsPaneFactoryParams,
} from "./LabelInstanceRelationsPane.ts";
import type { LabelInstanceRelationsPaneControllerParams } from "./LabelInstanceRelationsPane.ts";
import {
  labelInstanceSelectionPaneDataProcessor,
  labelInstanceSelectionPaneDefaultParams,
} from "./LabelInstanceSelectionPane.ts";
import type {
  LabelInstanceSelectionItem,
  LabelInstanceSelectionPaneControllerParams,
} from "./LabelInstanceSelectionPane.ts";

export interface LabelInstanceInspectorInputtedData {
  selection: LabelInstanceSelectionPaneControllerParams["inputtedData"];
  relations: LabelInstanceRelationsPaneControllerParams["inputtedData"];
  descriptors: LabelInstanceDescriptorsPaneControllerParams["inputtedData"];
}

export interface LabelInstanceInspectorComputedData {
  selection: LabelInstanceSelectionPaneControllerParams["computedData"];
  relations: LabelInstanceRelationsPaneControllerParams["computedData"];
  descriptors: LabelInstanceDescriptorsPaneControllerParams["computedData"];
}

export interface LabelInstanceInspectorPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface LabelInstanceInspectorSource {
  instances: ReadonlyMap<UUID, LabelInstanceSelectionItem>;
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

export interface LabelInstanceParams {
  instanceId: UUID | null;
  classId: number | null;
  isBlack: boolean;
}

export interface LabelInstanceInspectorPaneControllerParams {
  inputtedData: LabelInstanceInspectorInputtedData;
  computedData: LabelInstanceInspectorComputedData;
  settings: LabelInstanceInspectorPaneSettings;
  internalData: LabelInstanceInspectorSource | null;
  outputData: LabelInstanceParams;
}

type LabelInstanceInspectorPaneElementParams =
  PaneElementParams<LabelInstanceInspectorPaneControllerParams>;

export function cloneLabelInstanceInspectorInputtedData<
  TInputtedData extends Partial<LabelInstanceInspectorInputtedData>,
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

export function getLabelInstanceInspectorOutputData(
  paneParams: Readonly<LabelInstanceInspectorPaneElementParams>,
): LabelInstanceParams {
  const { instanceId } = labelInstanceSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.selection,
    computedData: paneParams.computedData.selection,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { classId } = labelInstanceRelationsPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.relations,
    computedData: paneParams.computedData.relations,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { isBlack } = labelInstanceDescriptorsPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.descriptors,
    computedData: paneParams.computedData.descriptors,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });

  return { instanceId, classId, isBlack };
}

export const labelInstanceInspectorPaneFactoryParams: PaneElementParams<LabelInstanceInspectorPaneControllerParams> =
  {
    inputtedData: {
      selection: labelInstanceSelectionPaneDefaultParams.inputtedData,
      relations: labelInstanceRelationsPaneFactoryParams.inputtedData,
      descriptors: labelInstanceDescriptorsPaneFactoryParams.inputtedData,
    },
    computedData: {
      selection: labelInstanceSelectionPaneDefaultParams.computedData,
      relations: labelInstanceRelationsPaneFactoryParams.computedData,
      descriptors: labelInstanceDescriptorsPaneFactoryParams.computedData,
    },
    settings: { disabled: false, hidden: false },
  };

export function getLabelInstanceInspectorCreateInstanceButtonSettings({
  inputtedData: {
    selection: { instanceId },
  },
  settings: { disabled, hidden },
}: Readonly<LabelInstanceInspectorPaneElementParams>): {
  title: string;
  tooltip: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    title: "+",
    tooltip: instanceId == null ? "Add Instance" : "Clone Instance",
    disabled,
    hidden,
  };
}

export function createLabelInstanceInspectorPaneElementFactory(
  selectionElement: HTMLElement,
): PaneElementFactory<
  PaneElementParams<LabelInstanceInspectorPaneControllerParams>,
  { "click-createInstance": any }
> {
  const builder = new PaneElementFactoryBuilder(
    labelInstanceInspectorPaneFactoryParams,
    ["click-createInstance"],
  );
  const relationsParamsMapper: ParamsMapper<
    PaneElementParams<LabelInstanceInspectorPaneControllerParams>,
    PaneElementParams<LabelInstanceRelationsPaneControllerParams>
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
  const descriptorsParamsMapper: ParamsMapper<
    PaneElementParams<LabelInstanceInspectorPaneControllerParams>,
    PaneElementParams<LabelInstanceDescriptorsPaneControllerParams>
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
              getLabelInstanceInspectorCreateInstanceButtonSettings(paneParams),
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

              buttonElem.title =
                getLabelInstanceInspectorCreateInstanceButtonSettings(
                  paneParams,
                ).tooltip;
            },
            eventHandlers: {
              click: (paneElem) =>
                paneElem.dispatchEvent({
                  type: "click-createInstance",
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
        createLabelInstanceRelationsPaneElementFactory(),
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
        createLabelInstanceDescriptorsPaneElementFactory(),
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

export const labelInstanceInspectorPaneDataProcessor: PaneControllerDataProcessor<LabelInstanceInspectorPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      selection: labelInstanceSelectionPaneDataProcessor.computeData(
        inputtedData.selection,
        internalData,
      ),
      relations: labelInstanceRelationsPaneDataProcessor.computeData(
        inputtedData.relations,
        internalData,
      ),
      descriptors: labelInstanceDescriptorsPaneDataProcessor.computeData(
        inputtedData.descriptors,
        internalData ?? {},
      ),
    }),
    outputData: getLabelInstanceInspectorOutputData,
  };
