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

export interface LabelTrackRelationsInputtedData {
  classSelect: LabelClassSelectionPaneControllerParams["inputtedData"];
}

export interface LabelTrackRelationsComputedData {
  classSelect: LabelClassSelectionPaneControllerParams["computedData"];
}

interface LabelTrackRelationsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelTrackRelationsSource {
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

interface LabelTrackRelations {
  classId: number | null;
}

export interface LabelTrackRelationsPaneControllerParams {
  inputtedData: LabelTrackRelationsInputtedData;
  computedData: LabelTrackRelationsComputedData;
  settings: LabelTrackRelationsPaneSettings;
  internalData: LabelTrackRelationsSource | null;
  outputData: LabelTrackRelations;
}

type LabelTrackRelationsPaneElementParams =
  PaneElementParams<LabelTrackRelationsPaneControllerParams>;

export const renderTriggers = composeRenderTriggers(classRenderTriggers);

export function getLabelTrackRelationsOutputData(
  paneParams: Readonly<LabelTrackRelationsPaneElementParams>,
) {
  const { classId } = labelClassSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.classSelect,
    computedData: paneParams.computedData.classSelect,
    settings: paneParams.settings,
  });

  return { classId };
}

export const labelTrackRelationsPaneFactoryParams: LabelTrackRelationsPaneElementParams =
  {
    inputtedData: {
      classSelect: labelClassSelectionPaneFactoryParams.inputtedData,
    },
    computedData: {
      classSelect: labelClassSelectionPaneFactoryParams.computedData,
    },
    settings: { disabled: false, hidden: false },
  };

export function createLabelTrackRelationsPaneElementFactory(): PaneElementFactory<LabelTrackRelationsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelTrackRelationsPaneFactoryParams,
  );
  const classSelectParamsMapper: ParamsMapper<
    LabelTrackRelationsPaneElementParams,
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

export const labelTrackRelationsPaneDataProcessor: PaneControllerDataProcessor<LabelTrackRelationsPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      classSelect: labelClassSelectionPaneDataProcessor.computeData(
        inputtedData.classSelect,
        internalData,
      ),
    }),
    outputData: getLabelTrackRelationsOutputData,
  };
