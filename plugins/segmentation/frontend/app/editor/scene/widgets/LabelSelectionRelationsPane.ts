import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  ParamsMapper,
  LabelClassSelectionItem,
  LabelClassSelectionPaneControllerParams,
} from "sta/app/editor";
import {
  PaneElementFactoryBuilder,
  composeRenderTriggers,
  createLabelClassSelectionPaneElementFactory,
  labelClassSelectionPaneDataProcessor,
  labelClassSelectionPaneFactoryParams,
  labelClassSelectionRenderTriggers as classRenderTriggers,
} from "sta/app/editor";

import type { UUID } from "../data";

import {
  labelInstanceSelectionPaneDataProcessor,
  labelInstanceSelectionPaneDefaultParams,
  renderTriggers as instanceRenderTriggers,
} from "./LabelInstanceSelectionPane.ts";
import type {
  LabelInstanceSelectionItem,
  LabelInstanceSelectionPaneControllerParams,
} from "./LabelInstanceSelectionPane.ts";

export interface LabelSelectionRelationsInputtedData {
  instanceSelect: LabelInstanceSelectionPaneControllerParams["inputtedData"];
  classSelect: LabelClassSelectionPaneControllerParams["inputtedData"];
}

export interface LabelSelectionRelationsComputedData {
  instanceSelect: LabelInstanceSelectionPaneControllerParams["computedData"];
  classSelect: LabelClassSelectionPaneControllerParams["computedData"];
}

interface LabelSelectionRelationsPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disableInstanceInput: boolean;
}

interface LabelSelectionRelationsSource {
  instances: ReadonlyMap<UUID, LabelInstanceSelectionItem>;
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

interface LabelSelectionRelations {
  instanceId: UUID | null;
  classId: number | null;
}

export interface LabelSelectionRelationsPaneControllerParams {
  inputtedData: LabelSelectionRelationsInputtedData;
  computedData: LabelSelectionRelationsComputedData;
  settings: LabelSelectionRelationsPaneSettings;
  internalData: LabelSelectionRelationsSource | null;
  outputData: LabelSelectionRelations;
}

type LabelSelectionRelationsPaneElementParams =
  PaneElementParams<LabelSelectionRelationsPaneControllerParams>;

export const renderTriggers = composeRenderTriggers(
  instanceRenderTriggers,
  classRenderTriggers,
);

export function getLabelSelectionRelationsOutputData(
  paneParams: Readonly<LabelSelectionRelationsPaneElementParams>,
): LabelSelectionRelations {
  const { instanceId } = labelInstanceSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.instanceSelect,
    computedData: paneParams.computedData.instanceSelect,
    settings: {
      disabled:
        paneParams.settings.disabled ||
        paneParams.settings.disableInstanceInput,
      hidden: paneParams.settings.hidden,
    },
  });
  const { classId } = labelClassSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.classSelect,
    computedData: paneParams.computedData.classSelect,
    settings: {
      disabled: paneParams.settings.disabled,
      hidden: paneParams.settings.hidden,
    },
  });

  return { instanceId, classId };
}

export const labelSelectionRelationsPaneFactoryParams: LabelSelectionRelationsPaneElementParams =
  {
    inputtedData: {
      instanceSelect: labelInstanceSelectionPaneDefaultParams.inputtedData,
      classSelect: labelClassSelectionPaneFactoryParams.inputtedData,
    },
    computedData: {
      instanceSelect: labelInstanceSelectionPaneDefaultParams.computedData,
      classSelect: labelClassSelectionPaneFactoryParams.computedData,
    },
    settings: {
      disabled: false,
      hidden: false,
      disableInstanceInput: false,
    },
  };

export function createLabelSelectionRelationsPaneElementFactory(
  instanceSelectionElement: HTMLElement,
): PaneElementFactory<LabelSelectionRelationsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelSelectionRelationsPaneFactoryParams,
  );
  const classSelectParamsMapper: ParamsMapper<
    LabelSelectionRelationsPaneElementParams,
    PaneElementParams<LabelClassSelectionPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.classSelect,
      computedData: outer.computedData.classSelect,
      settings: {
        disabled: outer.settings.disabled,
        hidden: outer.settings.hidden,
      },
    }),
    innerToOuter: (inner) => ({
      inputtedData: { classSelect: inner.inputtedData },
    }),
  };

  const instanceSelectionFactory = builder.htmlContainer({
    options: { innerElem: instanceSelectionElement },
  });

  return builder.sequential([
    instanceSelectionFactory,
    builder.mapped(
      createLabelClassSelectionPaneElementFactory(),
      classSelectParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const labelSelectionRelationsPaneDataProcessor: PaneControllerDataProcessor<LabelSelectionRelationsPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      instanceSelect: labelInstanceSelectionPaneDataProcessor.computeData(
        inputtedData.instanceSelect,
        internalData,
      ),
      classSelect: labelClassSelectionPaneDataProcessor.computeData(
        inputtedData.classSelect,
        internalData,
      ),
    }),
    outputData: getLabelSelectionRelationsOutputData,
  };
