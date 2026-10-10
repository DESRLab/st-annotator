import { PointCloudLayer } from "sta-pcd/app";

import { findEditorLayer } from "sta/app/editor";
import type { EditorLayerFactoryEnv, EditorWindowMapper } from "sta/app/editor";

import { SegmentationLayer } from "./scene";

/** Contributes the segmentation layer; depends on the point cloud layer. */
export function createEditorLayer(
  env: EditorLayerFactoryEnv,
): SegmentationLayer<EditorWindowMapper> {
  const pointCloudLayer = findEditorLayer<PointCloudLayer<EditorWindowMapper>>(
    env.layers,
    PointCloudLayer,
  );
  if (pointCloudLayer == null) {
    throw new Error(
      "The segmentation layer requires the pcd layer to be registered first.",
    );
  }

  return SegmentationLayer.create(
    env.context,
    "Segmentation",
    pointCloudLayer,
    env.overlayDoms.canvas as HTMLCanvasElement,
    env.overlayDoms.brushCursor as HTMLDivElement,
  );
}
