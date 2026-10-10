import { PaneElementFactoryBuilder } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";
import type { Vector3XYZ } from "sta/common";

import type { BoxType } from "../../../../models";
import type { BBoxIndexEventMap } from "../data";

export interface LabelBoxGeometryInputtedData {
  boxType: BoxType;
  center: Vector3XYZ;
  size: Vector3XYZ;
  angle: number;
}

interface LabelBoxGeometryPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disableTransform: boolean;
}

interface LabelBoxGeometry {
  boxType: BoxType;
  center: Vector3XYZ;
  size: Vector3XYZ;
  angle: number;
}

export interface LabelBoxGeometryPaneControllerParams {
  inputtedData: LabelBoxGeometryInputtedData;
  computedData: {};
  settings: LabelBoxGeometryPaneSettings;
  internalData: {};
  outputData: LabelBoxGeometry;
}

type LabelBoxGeometryPaneElementParams =
  PaneElementParams<LabelBoxGeometryPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<BBoxIndexEventMap> = {
  // Display text is changed
  "box-update": (e) =>
    e.propertyKey === "boxType" ||
    e.propertyKey === "center" ||
    e.propertyKey === "size" ||
    e.propertyKey === "angle",
};

export function getLabelBoxGeometryOutputData(
  paneParams: Readonly<LabelBoxGeometryPaneElementParams>,
) {
  const {
    inputtedData: { boxType, center, size, angle },
  } = paneParams;

  return { boxType, center, size, angle };
}

export const labelBoxGeometryPaneFactoryParams: LabelBoxGeometryPaneElementParams =
  {
    inputtedData: {
      boxType: "cuboid",
      center: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
      angle: 0,
    },
    computedData: {},
    settings: {
      disabled: false,
      hidden: false,
      disableTransform: false,
    },
  };

export function createLabelBoxGeometryPaneElementFactory(): PaneElementFactory<LabelBoxGeometryPaneElementParams> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelBoxGeometryPaneFactoryParams,
  );

  return builder.sequential([
    builder.input(["inputtedData", "boxType"], {
      options: ({ settings: { disabled, hidden } }) => ({
        label: "Type",
        options: {
          Cuboid: "cuboid",
          Cylinder: "cylinder",
        },
        disabled,
        hidden,
      }),
    }),
    builder.input(["inputtedData", "center"], {
      options: ({ settings: { disabled, hidden, disableTransform } }) => ({
        label: "Center",
        x: { step: 0.001 },
        y: { step: 0.001 },
        z: { step: 0.001 },
        disabled: disabled || disableTransform,
        hidden,
      }),
    }),
    builder.input(["inputtedData", "size"], {
      options: ({ settings: { disabled, hidden, disableTransform } }) => ({
        label: "Size",
        x: { min: 0.001, step: 0.001 },
        y: { min: 0.001, step: 0.001 },
        z: { min: 0.001, step: 0.001 },
        disabled: disabled || disableTransform,
        hidden,
      }),
    }),
    builder.input(["inputtedData", "angle"], {
      options: ({ settings: { disabled, hidden, disableTransform } }) => ({
        label: "Angle",
        min: -Math.PI,
        max: Math.PI,
        step: 0.001,
        disabled: disabled || disableTransform,
        hidden,
      }),
    }),
  ]);
}

export const labelBoxGeometryPaneDataProcessor: PaneControllerDataProcessor<LabelBoxGeometryPaneControllerParams> =
  {
    computeData: (
      _inputtedData: LabelBoxGeometryPaneControllerParams["inputtedData"],
      _internalData: LabelBoxGeometryPaneControllerParams["internalData"],
    ) => ({}),
    outputData: getLabelBoxGeometryOutputData,
  };
