import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  ApplyColormap,
  Colormap,
  CoordinateFormat,
  EditorConfig,
  NormalizedValueFunc,
  PointBuffer,
  VanillaEventDispatcher,
  ProjectConfig,
} from "sta/app/editor";

import { DEFAULT_SETTINGS } from "../../../../../app/editor/config";
import { GroundMesh } from "../../../../../app/editor/scene/data/GroundMesh.tsx";
import { GroundMeshLayer } from "../../../../../app/editor/scene/layer/GroundMeshLayer.tsx";

class FakeGroundMeshView extends VanillaEventDispatcher<{
  beforeload: {};
  afterload: {};
}> {
  data: GroundMesh | null;

  constructor(data: GroundMesh | null) {
    super();
    this.data = data;
  }

  beforeLoad(): void {
    this.data = null;
    this.dispatchEvent({ type: "beforeload" });
  }

  afterLoad(data: GroundMesh): void {
    this.data = data;
    this.dispatchEvent({ type: "afterload" });
  }
}

function createGroundMesh(): GroundMesh {
  const vertices = new PointBuffer(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    CoordinateFormat.XYZ,
    3,
  );
  const blender = new ApplyColormap(
    new Colormap("", [new THREE.Color("black"), new THREE.Color("white")]),
    new NormalizedValueFunc(2, 0, 1),
  );
  return new GroundMesh(
    vertices,
    new Int32Array([0, 1, 2]),
    new THREE.Vector3(),
    blender,
    0.3,
  );
}

const config = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 2 }),
);
const context = {
  config,
  display: { windows: {} },
  isLayerActive: () => false,
} as any;

describe("GroundMeshLayer rendering", () => {
  it("refreshes after data and settings changes but skips unchanged frames", () => {
    const firstMesh = createGroundMesh();
    const dataView = new FakeGroundMeshView(firstMesh);
    const layer = new GroundMeshLayer(context, "Ground Mesh", dataView as any);
    const clearObjects = vi.spyOn(layer.objects, "clear");
    const addObject = vi.spyOn(layer.objects, "add");

    try {
      dataView.afterLoad(firstMesh);
      layer.render();
      expect(layer.objects.children).toEqual([firstMesh.asObject3D()]);
      expect(clearObjects).toHaveBeenCalledTimes(1);
      expect(addObject).toHaveBeenCalledTimes(1);

      layer.render();
      expect(layer.objects.children).toEqual([firstMesh.asObject3D()]);
      expect(clearObjects).toHaveBeenCalledTimes(1);
      expect(addObject).toHaveBeenCalledTimes(1);

      layer.onSettingsInputChange({ ...DEFAULT_SETTINGS, opacity: 0.8 });
      layer.render();
      expect(firstMesh.opacity).toBe(0.8);
      expect(layer.objects.children).toEqual([firstMesh.asObject3D()]);

      dataView.beforeLoad();
      layer.render();
      expect(layer.objects.children).toHaveLength(0);

      const secondMesh = createGroundMesh();
      dataView.afterLoad(secondMesh);
      layer.render();
      expect(layer.objects.children).toEqual([secondMesh.asObject3D()]);
    } finally {
      layer.dispose();
    }
  });
});
