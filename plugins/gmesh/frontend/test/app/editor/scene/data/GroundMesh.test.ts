import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import {
  ApplyColormap,
  Colormap,
  CoordinateFormat,
  NormalizedValueFunc,
  PointBuffer,
} from "sta/app/editor";

import { GroundMesh } from "../../../../../app/editor";

function createGroundMesh(opacity = 0.3): GroundMesh {
  const vertices = new PointBuffer(
    new Float32Array([
      -54, 17.4428, -54, -54, 17.0778369, -52, -52, 17.0691261291, -54,
    ]),
    CoordinateFormat.ZXY,
    3,
  );
  const blender = new ApplyColormap(
    new Colormap("", [new THREE.Color("magenta"), new THREE.Color("yellow")]),
    new NormalizedValueFunc(0, -100, 100),
  );

  return new GroundMesh(
    vertices,
    new Int32Array([0, 1, 2]),
    new THREE.Vector3(1, 2, 3),
    blender,
    opacity,
  );
}

describe("GroundMesh", () => {
  it("accepts both valid opacity boundaries", () => {
    const groundMesh = createGroundMesh(0);

    expect(groundMesh.opacity).to.equal(0);
    groundMesh.opacity = 1;
    expect(groundMesh.opacity).to.equal(1);
  });

  it("keeps clones independent when their rendering state changes", () => {
    const original = createGroundMesh();
    const clone = original.clone();

    clone.position = new THREE.Vector3(4, 5, 6);
    clone.opacity = 1;
    clone.showWireframe = false;

    expect(original.position).to.deep.equal(new THREE.Vector3(1, 2, 3));
    expect(original.opacity).to.equal(0.3);
    expect(original.showWireframe).to.be.true;
  });
});
