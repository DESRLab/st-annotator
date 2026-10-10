import { isPlainObject } from "lodash";

import { PaneElementFactoryBuilder } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  ParamsMapper,
  PaneElementParams,
  LabelClassSelectionItem,
} from "sta/app/editor";
import type { Vector3XYZ } from "sta/common";

import type {
  BoxType,
  DistinctiveLevel,
  OcclusionLevel,
} from "../../../../models";
import type { UUID } from "../data";

import {
  createLabelBoxDescriptorsPaneElementFactory,
  labelBoxDescriptorsPaneDataProcessor,
  labelBoxDescriptorsPaneFactoryParams,
} from "./LabelBoxDescriptorsPane.ts";
import type { LabelBoxDescriptorsPaneControllerParams } from "./LabelBoxDescriptorsPane.ts";
import type { LabelBoxGeometryPaneControllerParams } from "./LabelBoxGeometryPane.ts";
import {
  createLabelBoxGeometryPaneElementFactory,
  labelBoxGeometryPaneDataProcessor,
  labelBoxGeometryPaneFactoryParams,
} from "./LabelBoxGeometryPane.ts";
import {
  createLabelBoxRelationsPaneElementFactory,
  labelBoxRelationsPaneDataProcessor,
  labelBoxRelationsPaneFactoryParams,
} from "./LabelBoxRelationsPane.ts";
import type { LabelBoxRelationsPaneControllerParams } from "./LabelBoxRelationsPane.ts";
import {
  labelBoxSelectionPaneDataProcessor,
  labelBoxSelectionPaneDefaultParams,
} from "./LabelBoxSelectionPane.ts";
import type {
  LabelBoxSelectionItem,
  LabelBoxSelectionPaneControllerParams,
} from "./LabelBoxSelectionPane.ts";
import type { LabelTrackSelectionItem } from "./LabelTrackSelectionPane.ts";

export interface LabelBoxInspectorInputtedData {
  hidden: boolean;
  selection: LabelBoxSelectionPaneControllerParams["inputtedData"];
  geometry: LabelBoxGeometryPaneControllerParams["inputtedData"];
  relations: LabelBoxRelationsPaneControllerParams["inputtedData"];
  descriptors: LabelBoxDescriptorsPaneControllerParams["inputtedData"];
}

export interface LabelBoxInspectorComputedData {
  selection: LabelBoxSelectionPaneControllerParams["computedData"];
  geometry: LabelBoxGeometryPaneControllerParams["computedData"];
  relations: LabelBoxRelationsPaneControllerParams["computedData"];
  descriptors: LabelBoxDescriptorsPaneControllerParams["computedData"];
}

export interface LabelBoxInspectorPaneSettings {
  disabled: boolean;
  hidden: boolean;
  drawBoxActive: boolean;
  disableTransform: boolean;
  disableTrackInput: boolean;
}

export interface LabelBoxInspectorSource {
  boxes: readonly LabelBoxSelectionItem[];
  tracks: readonly LabelTrackSelectionItem[];
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

export interface LabelBoxParams {
  boxId: UUID | null;
  boxType: BoxType;
  center: Vector3XYZ;
  size: Vector3XYZ;
  angle: number;
  trackId: UUID | null;
  classId: number | null;
  distinctiveLv: DistinctiveLevel;
  occlusionLv: OcclusionLevel;
}

export interface LabelBoxInspectorPaneControllerParams {
  inputtedData: LabelBoxInspectorInputtedData;
  computedData: LabelBoxInspectorComputedData;
  settings: LabelBoxInspectorPaneSettings;
  internalData: LabelBoxInspectorSource | null;
  outputData: LabelBoxParams;
}

export function cloneLabelBoxInspectorInputtedData<
  TInputtedData extends Partial<LabelBoxInspectorInputtedData>,
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
        Object.entries(value).map(([key, nestedValue]): [string, any] => [
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

export function getLabelBoxInspectorOutputData(
  paneParams: Readonly<
    PaneElementParams<LabelBoxInspectorPaneControllerParams>
  >,
): LabelBoxParams {
  const { boxId } = labelBoxSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.selection,
    computedData: paneParams.computedData.selection,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });
  const { boxType, center, size, angle } =
    labelBoxGeometryPaneDataProcessor.outputData({
      inputtedData: paneParams.inputtedData.geometry,
      computedData: paneParams.computedData.geometry,
      settings: {
        disabled: paneParams.settings.disabled,
        hidden: paneParams.settings.hidden,
        disableTransform: paneParams.settings.disableTransform,
      },
    });
  const { trackId, classId } = labelBoxRelationsPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.relations,
    computedData: paneParams.computedData.relations,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
      disableTrackInput: paneParams.settings.disableTrackInput,
    },
  });
  const { distinctiveLv, occlusionLv } =
    labelBoxDescriptorsPaneDataProcessor.outputData({
      inputtedData: paneParams.inputtedData.descriptors,
      computedData: paneParams.computedData.descriptors,
      settings: {
        disabled: paneParams.settings.disabled,
        hidden: paneParams.settings.hidden,
      },
    });

  return {
    boxId,
    boxType,
    center,
    size,
    angle,
    trackId,
    classId,
    distinctiveLv,
    occlusionLv,
  };
}

export const labelBoxInspectorPaneFactoryParams: PaneElementParams<LabelBoxInspectorPaneControllerParams> =
  {
    inputtedData: {
      hidden: false,
      selection: labelBoxSelectionPaneDefaultParams.inputtedData,
      geometry: labelBoxGeometryPaneFactoryParams.inputtedData,
      relations: labelBoxRelationsPaneFactoryParams.inputtedData,
      descriptors: labelBoxDescriptorsPaneFactoryParams.inputtedData,
    },
    computedData: {
      selection: labelBoxSelectionPaneDefaultParams.computedData,
      geometry: labelBoxGeometryPaneFactoryParams.computedData,
      relations: labelBoxRelationsPaneFactoryParams.computedData,
      descriptors: labelBoxDescriptorsPaneFactoryParams.computedData,
    },
    settings: {
      disabled: false,
      hidden: false,
      drawBoxActive: false,
      disableTransform: false,
      disableTrackInput: false,
    },
  };

export function getLabelBoxInspectorDrawBoxButtonSettings({
  settings: { disabled, hidden },
}: Readonly<PaneElementParams<LabelBoxInspectorPaneControllerParams>>): {
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

export function createLabelBoxInspectorPaneElementFactory(
  selectionElement: HTMLElement,
  trackSelectionElement: HTMLElement,
): PaneElementFactory<
  PaneElementParams<LabelBoxInspectorPaneControllerParams>,
  { "click-drawBox": any }
> {
  const builder = new PaneElementFactoryBuilder(
    labelBoxInspectorPaneFactoryParams,
    ["click-drawBox"],
  );
  const geometryParamsMapper: ParamsMapper<
    PaneElementParams<LabelBoxInspectorPaneControllerParams>,
    PaneElementParams<LabelBoxGeometryPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.geometry,
      computedData: outer.computedData.geometry,
      settings: {
        disabled: outer.settings.disabled,
        hidden: outer.settings.hidden,
        disableTransform: outer.settings.disableTransform,
      },
    }),
    innerToOuter: (inner) => ({
      inputtedData: { geometry: inner.inputtedData },
    }),
  };
  const relationsParamsMapper: ParamsMapper<
    PaneElementParams<LabelBoxInspectorPaneControllerParams>,
    PaneElementParams<LabelBoxRelationsPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.relations,
      computedData: outer.computedData.relations,
      settings: {
        disabled: outer.settings.disabled,
        hidden: outer.settings.hidden,
        disableTrackInput: outer.settings.disableTrackInput,
      },
    }),
    innerToOuter: (inner) => ({
      inputtedData: { relations: inner.inputtedData },
    }),
  };
  const descriptorsParamsMapper: ParamsMapper<
    PaneElementParams<LabelBoxInspectorPaneControllerParams>,
    PaneElementParams<LabelBoxDescriptorsPaneControllerParams>
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
              getLabelBoxInspectorDrawBoxButtonSettings(paneParams),
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

              const drawActive = paneParams.settings.drawBoxActive;
              buttonElem.title =
                getLabelBoxInspectorDrawBoxButtonSettings(paneParams).tooltip;
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
                  type: "click-drawBox",
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
    builder.input(["inputtedData", "hidden"], {
      options: (params) => ({
        label: "Hide in scene",
        disabled:
          params.settings.disabled ||
          params.inputtedData.selection.boxId == null,
        hidden: params.settings.hidden,
      }),
    }),
    builder.separator({
      options: ({ settings: { disabled, hidden } }) => ({
        disabled,
        hidden,
      }),
    }),
    builder.folder(
      builder.mapped(
        createLabelBoxGeometryPaneElementFactory(),
        geometryParamsMapper,
        builder.identityEventMapper(),
      ),
      {
        options: ({ settings: { disabled, hidden } }) => ({
          title: "Geometry",
          disabled,
          hidden,
        }),
      },
    ),
    builder.folder(
      builder.mapped(
        createLabelBoxRelationsPaneElementFactory(trackSelectionElement),
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
        createLabelBoxDescriptorsPaneElementFactory(),
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

export const labelBoxInspectorPaneDataProcessor: PaneControllerDataProcessor<LabelBoxInspectorPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      selection: labelBoxSelectionPaneDataProcessor.computeData(
        inputtedData.selection,
        internalData,
      ),
      geometry: labelBoxGeometryPaneDataProcessor.computeData(
        inputtedData.geometry,
        internalData ?? {},
      ),
      relations: labelBoxRelationsPaneDataProcessor.computeData(
        inputtedData.relations,
        internalData,
      ),
      descriptors: labelBoxDescriptorsPaneDataProcessor.computeData(
        inputtedData.descriptors,
        internalData ?? {},
      ),
    }),
    outputData: getLabelBoxInspectorOutputData,
  };
