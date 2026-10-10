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

export interface LabelVectorRelationsInputtedData {
  classSelect: LabelClassSelectionPaneControllerParams["inputtedData"];
}

export interface LabelVectorRelationsComputedData {
  classSelect: LabelClassSelectionPaneControllerParams["computedData"];
}

interface LabelVectorRelationsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelVectorRelationsSource {
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

interface LabelVectorRelations {
  classId: number | null;
}

export interface LabelVectorRelationsPaneControllerParams {
  inputtedData: LabelVectorRelationsInputtedData;
  computedData: LabelVectorRelationsComputedData;
  settings: LabelVectorRelationsPaneSettings;
  internalData: LabelVectorRelationsSource | null;
  outputData: LabelVectorRelations;
}

type LabelVectorRelationsPaneElementParams =
  PaneElementParams<LabelVectorRelationsPaneControllerParams>;

export const renderTriggers = composeRenderTriggers(classRenderTriggers);

export function getLabelVectorRelationsOutputData(
  paneParams: LabelVectorRelationsPaneElementParams,
) {
  const { classId } = labelClassSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.classSelect,
    computedData: paneParams.computedData.classSelect,
    settings: paneParams.settings,
  });

  return { classId };
}

export const labelVectorRelationsPaneFactoryParams: LabelVectorRelationsPaneElementParams =
  {
    inputtedData: {
      classSelect: labelClassSelectionPaneFactoryParams.inputtedData,
    },
    computedData: {
      classSelect: labelClassSelectionPaneFactoryParams.computedData,
    },
    settings: { disabled: false, hidden: false },
  };

export function createLabelVectorRelationsPaneElementFactory(): PaneElementFactory<LabelVectorRelationsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelVectorRelationsPaneFactoryParams,
  );
  const classSelectParamsMapper: ParamsMapper<
    LabelVectorRelationsPaneElementParams,
    PaneElementParams<LabelClassSelectionPaneControllerParams>
  > = {
    outerToInner: (outer) => ({
      inputtedData: outer.inputtedData.classSelect,
      computedData: outer.computedData.classSelect,
      settings: outer.settings,
    }),
    innerToOuter: (inner) => ({
      inputtedData: { classSelect: inner.inputtedData },
    }),
  };

  return builder.sequential([
    builder.mapped(
      createLabelClassSelectionPaneElementFactory(),
      classSelectParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const labelVectorRelationsPaneDataProcessor: PaneControllerDataProcessor<LabelVectorRelationsPaneControllerParams> =
  {
    computeData: (
      inputtedData: LabelVectorRelationsPaneControllerParams["inputtedData"],
      internalData: LabelVectorRelationsPaneControllerParams["internalData"],
    ) => ({
      classSelect: labelClassSelectionPaneDataProcessor.computeData(
        inputtedData.classSelect,
        internalData,
      ),
    }),
    outputData: getLabelVectorRelationsOutputData,
  };
