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
  labelTrackSelectionPaneDataProcessor,
  labelTrackSelectionPaneDefaultParams,
  renderTriggers as trackRenderTriggers,
} from "./LabelTrackSelectionPane.ts";
import type {
  LabelTrackSelectionItem,
  LabelTrackSelectionPaneControllerParams,
} from "./LabelTrackSelectionPane.ts";

export interface LabelBoxRelationsInputtedData {
  trackSelect: LabelTrackSelectionPaneControllerParams["inputtedData"];
  classSelect: LabelClassSelectionPaneControllerParams["inputtedData"];
}

export interface LabelBoxRelationsComputedData {
  trackSelect: LabelTrackSelectionPaneControllerParams["computedData"];
  classSelect: LabelClassSelectionPaneControllerParams["computedData"];
}

interface LabelBoxRelationsPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disableTrackInput: boolean;
}

interface LabelBoxRelationsSource {
  tracks: readonly LabelTrackSelectionItem[];
  classes: ReadonlyMap<number, LabelClassSelectionItem>;
}

interface LabelBoxRelations {
  trackId: UUID | null;
  classId: number | null;
}

export interface LabelBoxRelationsPaneControllerParams {
  inputtedData: LabelBoxRelationsInputtedData;
  computedData: LabelBoxRelationsComputedData;
  settings: LabelBoxRelationsPaneSettings;
  internalData: LabelBoxRelationsSource | null;
  outputData: LabelBoxRelations;
}

type LabelBoxRelationsPaneElementParams =
  PaneElementParams<LabelBoxRelationsPaneControllerParams>;

export const renderTriggers = composeRenderTriggers(
  trackRenderTriggers,
  classRenderTriggers,
);

export function getLabelBoxRelationsOutputData(
  paneParams: Readonly<LabelBoxRelationsPaneElementParams>,
) {
  const { trackId } = labelTrackSelectionPaneDataProcessor.outputData({
    inputtedData: paneParams.inputtedData.trackSelect,
    computedData: paneParams.computedData.trackSelect,
    settings: {
      disabled:
        paneParams.settings.disabled || paneParams.settings.disableTrackInput,
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

  return { trackId, classId };
}

export const labelBoxRelationsPaneFactoryParams: LabelBoxRelationsPaneElementParams =
  {
    inputtedData: {
      trackSelect: labelTrackSelectionPaneDefaultParams.inputtedData,
      classSelect: labelClassSelectionPaneFactoryParams.inputtedData,
    },
    computedData: {
      trackSelect: labelTrackSelectionPaneDefaultParams.computedData,
      classSelect: labelClassSelectionPaneFactoryParams.computedData,
    },
    settings: { disabled: false, hidden: false, disableTrackInput: false },
  };

export function createLabelBoxRelationsPaneElementFactory(
  trackSelectionElement: HTMLElement,
): PaneElementFactory<LabelBoxRelationsPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelBoxRelationsPaneFactoryParams,
  );
  const classSelectParamsMapper: ParamsMapper<
    LabelBoxRelationsPaneElementParams,
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

  const trackSelectionFactory = builder.htmlContainer({
    options: { innerElem: trackSelectionElement },
  });

  return builder.sequential([
    trackSelectionFactory,
    builder.mapped(
      createLabelClassSelectionPaneElementFactory(),
      classSelectParamsMapper,
      builder.identityEventMapper(),
    ),
  ]);
}

export const labelBoxRelationsPaneDataProcessor: PaneControllerDataProcessor<LabelBoxRelationsPaneControllerParams> =
  {
    computeData: (inputtedData, internalData) => ({
      trackSelect: labelTrackSelectionPaneDataProcessor.computeData(
        inputtedData.trackSelect,
        internalData,
      ),
      classSelect: labelClassSelectionPaneDataProcessor.computeData(
        inputtedData.classSelect,
        internalData,
      ),
    }),
    outputData: getLabelBoxRelationsOutputData,
  };
