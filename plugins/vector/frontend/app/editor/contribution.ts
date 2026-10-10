import { GroundMeshLayer } from "sta-gmesh/app";
import { PointCloudLayer } from "sta-pcd/app";

import { findEditorLayer } from "sta/app/editor";
import type { EditorLayerFactoryEnv, EditorWindowMapper } from "sta/app/editor";

import { VectorLayer } from "./scene";

/** Contributes the vector layer; depends on the point cloud and ground mesh layers. */
export function createEditorLayer(
  env: EditorLayerFactoryEnv,
): VectorLayer<EditorWindowMapper> {
  const pointCloudLayer = findEditorLayer<PointCloudLayer<EditorWindowMapper>>(
    env.layers,
    PointCloudLayer,
  );
  const groundMeshLayer = findEditorLayer<GroundMeshLayer<EditorWindowMapper>>(
    env.layers,
    GroundMeshLayer,
  );
  if (pointCloudLayer == null || groundMeshLayer == null) {
    throw new Error(
      "The vector layer requires the pcd and gmesh layers to be registered first.",
    );
  }

  return VectorLayer.create(
    env.context,
    "Vector",
    pointCloudLayer,
    groundMeshLayer,
    env.overlayDoms.canvas as HTMLCanvasElement,
  );
}
