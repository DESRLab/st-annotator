import type { EditorLayerFactoryEnv, EditorWindowMapper } from "sta/app/editor";

import { GroundMeshLayer } from "./scene";

/** Contributes the ground mesh layer; depends on no other layers. */
export function createEditorLayer(
  env: EditorLayerFactoryEnv,
): GroundMeshLayer<EditorWindowMapper> {
  return GroundMeshLayer.create(env.context, "Ground Mesh");
}
