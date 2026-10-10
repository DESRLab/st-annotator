import { GroundMeshLayer } from "sta-gmesh/app";
import { PointCloudLayer } from "sta-pcd/app";

import { findEditorLayer } from "sta/app/editor";
import type { EditorLayerFactoryEnv, EditorWindowMapper } from "sta/app/editor";

import { BBoxLayer } from "./scene";

/** Contributes the bounding box layer; depends on the point cloud and ground mesh layers. */
export function createEditorLayer(
  env: EditorLayerFactoryEnv,
): BBoxLayer<EditorWindowMapper> {
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
      "The bbox layer requires the pcd and gmesh layers to be registered first.",
    );
  }

  return BBoxLayer.create(
    env.context,
    "Bounding Box",
    pointCloudLayer,
    groundMeshLayer,
  );
}
