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

export interface LabelInstanceRelationsInputtedData {
  classSelect: LabelClassSelectionPaneControllerParams["inputtedData"];
}

export interface LabelInstanceRelationsComputedData {
  classSelect: LabelClassSelectionPaneControllerParams["computedData"];
}

interface LabelInstanceRelationsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelInstanceRelationsSource {
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

interface LabelInstanceRelations {
  classId: number | null;
}

export interface LabelInstanceRelationsPaneControllerParams {
  inputtedData: LabelInstanceRelationsInputtedData;
  computedData: LabelInstanceRelationsComputedData;
  settings: LabelInstanceRelationsPaneSettings;
  internalData: LabelInstanceRelationsSource | null;
  outputData: LabelInstanceRelations;
}

type LabelInstanceRelationsPaneElementParams =
  PaneElementParams<LabelInstanceRelationsPaneControllerParams>;

export const renderTriggers = composeRenderTriggers(classRenderTriggers);

export function getLabelInstanceRelationsOutputData(
  paneParams: Readonly<LabelInstanceRelationsPaneElementParams>,
): LabelInstanceRelations {
  const { classId } = labelClassSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.classSelect,
    computedData: paneParams.computedData.classSelect,
    settings: paneParams.settings,
  });

  return { classId };
}

export const labelInstanceRelationsPaneFactoryParams: LabelInstanceRelationsPaneElementParams =
  {
    inputtedData: {
      classSelect: labelClassSelectionPaneFactoryParams.inputtedData,
    },
    computedData: {
      classSelect: labelClassSelectionPaneFactoryParams.computedData,
    },
    settings: { disabled: false, hidden: false },
  };

export function createLabelInstanceRelationsPaneElementFactory(): PaneElementFactory<LabelInstanceRelationsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelInstanceRelationsPaneFactoryParams,
  );
  const classSelectParamsMapper: ParamsMapper<
    LabelInstanceRelationsPaneElementParams,
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

export const labelInstanceRelationsPaneDataProcessor: PaneControllerDataProcessor<LabelInstanceRelationsPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      classSelect: labelClassSelectionPaneDataProcessor.computeData(
        inputtedData.classSelect,
        internalData,
      ),
    }),
    outputData: getLabelInstanceRelationsOutputData,
  };
