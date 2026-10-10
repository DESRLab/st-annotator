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
  createLabelTrackDescriptorsPaneElementFactory,
  labelTrackDescriptorsPaneDataProcessor,
  labelTrackDescriptorsPaneFactoryParams,
} from "./LabelTrackDescriptorsPane.ts";
import type { LabelTrackDescriptorsPaneControllerParams } from "./LabelTrackDescriptorsPane.ts";
import {
  createLabelTrackRelationsPaneElementFactory,
  labelTrackRelationsPaneDataProcessor,
  labelTrackRelationsPaneFactoryParams,
} from "./LabelTrackRelationsPane.ts";
import type { LabelTrackRelationsPaneControllerParams } from "./LabelTrackRelationsPane.ts";
import {
  labelTrackSelectionPaneDataProcessor,
  labelTrackSelectionPaneDefaultParams,
} from "./LabelTrackSelectionPane.ts";
import type {
  LabelTrackSelectionItem,
  LabelTrackSelectionPaneControllerParams,
} from "./LabelTrackSelectionPane.ts";

export interface LabelTrackInspectorInputtedData {
  selection: LabelTrackSelectionPaneControllerParams["inputtedData"];
  relations: LabelTrackRelationsPaneControllerParams["inputtedData"];
  descriptors: LabelTrackDescriptorsPaneControllerParams["inputtedData"];
}

export interface LabelTrackInspectorComputedData {
  selection: LabelTrackSelectionPaneControllerParams["computedData"];
  relations: LabelTrackRelationsPaneControllerParams["computedData"];
  descriptors: LabelTrackDescriptorsPaneControllerParams["computedData"];
}

export interface LabelTrackInspectorPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface LabelTrackInspectorSource {
  tracks: readonly LabelTrackSelectionItem[];
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

export interface LabelTrackParams {
  trackId: UUID | null;
  classId: number | null;
  isBlack: boolean;
}

export interface LabelTrackInspectorPaneControllerParams {
  inputtedData: LabelTrackInspectorInputtedData;
  computedData: LabelTrackInspectorComputedData;
  settings: LabelTrackInspectorPaneSettings;
  internalData: LabelTrackInspectorSource | null;
  outputData: LabelTrackParams;
}

export function getLabelTrackInspectorOutputData(
  paneParams: Readonly<
    PaneElementParams<LabelTrackInspectorPaneControllerParams>
  >,
): LabelTrackParams {
  const { trackId } = labelTrackSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.selection,
    computedData: paneParams.computedData.selection,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { classId } = labelTrackRelationsPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.relations,
    computedData: paneParams.computedData.relations,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { isBlack } = labelTrackDescriptorsPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.descriptors,
    computedData: paneParams.computedData.descriptors,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });

  return { trackId, classId, isBlack };
}

export const labelTrackInspectorPaneFactoryParams: PaneElementParams<LabelTrackInspectorPaneControllerParams> =
  {
    inputtedData: {
      selection: labelTrackSelectionPaneDefaultParams.inputtedData,
      relations: labelTrackRelationsPaneFactoryParams.inputtedData,
      descriptors: labelTrackDescriptorsPaneFactoryParams.inputtedData,
    },
    computedData: {
      selection: labelTrackSelectionPaneDefaultParams.computedData,
      relations: labelTrackRelationsPaneFactoryParams.computedData,
      descriptors: labelTrackDescriptorsPaneFactoryParams.computedData,
    },
    settings: { disabled: false, hidden: false },
  };

export function getLabelTrackInspectorCreateTrackButtonSettings({
  inputtedData: {
    selection: { trackId },
  },
  settings: { disabled, hidden },
}: Readonly<PaneElementParams<LabelTrackInspectorPaneControllerParams>>): {
  title: string;
  tooltip: string;
  disabled: boolean;
  hidden: boolean;
} {
  return {
    title: "+",
    tooltip: trackId == null ? "Add Track" : "Clone Track",
    disabled,
    hidden,
  };
}

export function createLabelTrackInspectorPaneElementFactory(
  selectionElement: HTMLElement,
): PaneElementFactory<
  PaneElementParams<LabelTrackInspectorPaneControllerParams>,
  { "click-createTrack": any }
> {
  const builder = new PaneElementFactoryBuilder(
    labelTrackInspectorPaneFactoryParams,
    ["click-createTrack"],
  );
  const relationsParamsMapper: ParamsMapper<
    PaneElementParams<LabelTrackInspectorPaneControllerParams>,
    PaneElementParams<LabelTrackRelationsPaneControllerParams>
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
    PaneElementParams<LabelTrackInspectorPaneControllerParams>,
    PaneElementParams<LabelTrackDescriptorsPaneControllerParams>
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
              getLabelTrackInspectorCreateTrackButtonSettings(paneParams),
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
                getLabelTrackInspectorCreateTrackButtonSettings(
                  paneParams,
                ).tooltip;
            },
            eventHandlers: {
              click: (paneElem) =>
                paneElem.dispatchEvent({
                  type: "click-createTrack",
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
        createLabelTrackRelationsPaneElementFactory(),
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
        createLabelTrackDescriptorsPaneElementFactory(),
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

export const labelTrackInspectorPaneDataProcessor: PaneControllerDataProcessor<LabelTrackInspectorPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      selection: labelTrackSelectionPaneDataProcessor.computeData(
        inputtedData.selection,
        internalData,
      ),
      relations: labelTrackRelationsPaneDataProcessor.computeData(
        inputtedData.relations,
        internalData,
      ),
      descriptors: labelTrackDescriptorsPaneDataProcessor.computeData(
        inputtedData.descriptors,
        internalData ?? {},
      ),
    }),
    outputData: getLabelTrackInspectorOutputData,
  };
