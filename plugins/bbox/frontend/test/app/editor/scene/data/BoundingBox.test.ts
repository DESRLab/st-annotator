import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { BoundingCuboidBuilder } from "../../../../../app/editor/scene/data/views/BoundingCuboid";
import { BoundingCylinderBuilder } from "../../../../../app/editor/scene/data/views/BoundingCylinder";

// Keep the shared contract here: importing a *.test module from another spec
// registers all of its tests again, including unrelated regression scenarios.
describe.each([
  ["cuboid", new BoundingCuboidBuilder()],
  ["cylinder", new BoundingCylinderBuilder()],
] as const)("BoundingBox (%s)", (_name, builder) => {
  it("constructs and updates the rendered pose and materials", () => {
    const params = {
      position: new THREE.Vector3(1, -2, 3),
      rotation: new THREE.Euler(0.1, -0.2, 0.3),
      scale: new THREE.Vector3(2, 3, 4),
      color: new THREE.Color("red"),
      opacity: 0.4,
      showFrame: true,
      showForwardIndicator: true,
    };
    const box = builder.createBox(params);
    try {
      const group = box.asObject3D();
      expect(group).to.be.instanceOf(THREE.Group);
      expect(box.position.equals(params.position)).to.equal(true);
      expect(box.rotation.equals(params.rotation)).to.equal(true);
      expect(box.scale.equals(params.scale)).to.equal(true);
      expect(group.position.equals(params.position)).to.equal(true);
      expect(group.rotation.equals(params.rotation)).to.equal(true);
      expect(group.scale.equals(params.scale)).to.equal(true);
      expect(box.showFrame).to.equal(true);
      expect(box.showForwardIndicator).to.equal(true);
      expect(box.opacity).to.equal(0.4);
      expect(box.color.equals(params.color)).to.equal(true);
      expect(group.children).to.have.length(5);
      for (const child of group.children) {
        expect(child.visible).to.equal(true);
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.Points ||
          child instanceof THREE.LineSegments
        ) {
          expect(child.material.color.equals(params.color)).to.equal(true);
          expect(
            child.geometry.getAttribute("position").count,
          ).to.be.greaterThan(0);
          if (child instanceof THREE.Mesh) {
            expect(child.material.opacity).to.equal(0.4);
          }
        }
      }
      box.position = new THREE.Vector3(-4, 5, 6);
      box.rotation = new THREE.Euler(-0.3, 0.2, -0.1);
      box.scale = new THREE.Vector3(5, 6, 7);
      box.color = new THREE.Color("blue");
      box.opacity = 0.7;
      expect(group.position.toArray()).to.deep.equal([-4, 5, 6]);
      expect(group.rotation.equals(new THREE.Euler(-0.3, 0.2, -0.1))).to.equal(
        true,
      );
      expect(group.scale.toArray()).to.deep.equal([5, 6, 7]);
      for (const child of group.children) {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.Points ||
          child instanceof THREE.LineSegments
        ) {
          expect(child.material.color.equals(new THREE.Color("blue"))).to.equal(
            true,
          );
          if (child instanceof THREE.Mesh)
            expect(child.material.opacity).to.equal(0.7);
        }
      }
    } finally {
      box.dispose();
    }
  });

  it("toggles frame and forward-indicator visibility independently", () => {
    const box = builder.createBox({
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1),
      color: new THREE.Color("red"),
      opacity: 0.4,
    });
    try {
      for (const showFrame of [false, true]) {
        for (const showForwardIndicator of [false, true]) {
          box.showFrame = showFrame;
          box.showForwardIndicator = showForwardIndicator;
          expect(
            box.asObject3D().children.map((child) => child.visible),
          ).to.deep.equal([
            true,
            showFrame,
            showFrame,
            showFrame && showForwardIndicator,
            showFrame && showForwardIndicator,
          ]);
        }
      }
    } finally {
      box.dispose();
    }
  });

  it("raycasts production faces when framed and the center otherwise", () => {
    const box = builder.createBox({
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1),
      color: new THREE.Color(),
      opacity: 0,
    });
    try {
      const group = box.asObject3D();
      group.updateMatrixWorld(true);
      const caster = new THREE.Raycaster(
        new THREE.Vector3(0.1, 0.2, 5),
        new THREE.Vector3(0, 0, -1),
      );
      caster.params.Points.threshold = 0.00001;
      box.showFrame = true;
      const hits = box.raycast(caster);
      expect(hits.length).to.be.greaterThan(0);
      expect(hits.every((hit) => hit.object === group.children[1])).to.equal(
        true,
      );
      box.showFrame = false;
      expect(box.raycast(caster)).to.have.length(0);
      caster.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
      const centerHits = box.raycast(caster);
      expect(centerHits).to.have.length(1);
      expect(centerHits[0].object).to.equal(group.children[0]);
      expect(centerHits[0].point.equals(new THREE.Vector3())).to.equal(true);
    } finally {
      box.dispose();
    }
  });
});

describe("hidden bounding boxes", () => {
  it("makes both shapes transparent and dashed, selects the center and visible edges, and restores display", async () => {
    const { BoundingCuboidBuilder, BoundingCylinderBuilder } =
      await import("../../../../../app/editor/scene/data/views");
    for (const builder of [
      new BoundingCuboidBuilder(),
      new BoundingCylinderBuilder(),
    ]) {
      const box = builder.createBox({
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: new THREE.Vector3(1, 1, 1),
        color: new THREE.Color("red"),
        opacity: 0.4,
      });
      box.hidden = true;
      box.opacity = 0.6;
      const group = box.asObject3D();
      for (const child of group.children) {
        if (child instanceof THREE.Mesh)
          expect(child.material.opacity).to.equal(0);
        if (child instanceof THREE.LineSegments) {
          expect(child.material).to.be.instanceOf(THREE.LineDashedMaterial);
          expect(child.geometry.getAttribute("lineDistance")).not.to.equal(
            undefined,
          );
        }
      }
      const caster = new THREE.Raycaster();
      const { vi } = await import("vitest");
      const intersect = vi
        .spyOn(caster, "intersectObjects")
        .mockReturnValue([]);
      box.raycast(caster);
      expect(intersect.mock.calls[0][0]).to.deep.equal([
        group.children[0],
        group.children[2],
        group.children[4],
      ]);
      intersect.mockRestore();
      group.updateMatrixWorld(true);
      // Exercise the default line tolerance used by an unconfigured raycaster.
      expect(caster.params.Line.threshold).to.equal(1);
      caster.params.Points.threshold = 0.00001;
      const edges = group
        .children[2] as THREE.LineSegments<THREE.BufferGeometry>;
      const positions = edges.geometry.getAttribute("position");
      const midpoint = new THREE.Vector3()
        .fromBufferAttribute(positions, 0)
        .add(new THREE.Vector3().fromBufferAttribute(positions, 1))
        .multiplyScalar(0.5);
      caster.set(
        midpoint.clone().add(new THREE.Vector3(0, 0, 5)),
        new THREE.Vector3(0, 0, -1),
      );
      expect(box.raycast(caster).some((hit) => hit.object === edges)).to.equal(
        true,
      );
      caster.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
      expect(
        box.raycast(caster).some((hit) => hit.object === group.children[0]),
      ).to.equal(true);
      caster.set(new THREE.Vector3(0.1, 0.2, 5), new THREE.Vector3(0, 0, -1));
      expect(box.raycast(caster)).to.have.length(0);
      expect(caster.params.Line.threshold).to.equal(1);
      box.showFrame = false;
      caster.set(
        midpoint.clone().add(new THREE.Vector3(0, 0, 5)),
        new THREE.Vector3(0, 0, -1),
      );
      expect(box.raycast(caster)).to.have.length(0);
      box.hidden = false;
      for (const child of group.children) {
        if (child instanceof THREE.Mesh)
          expect(child.material.opacity).to.equal(0.6);
        if (child instanceof THREE.LineSegments)
          expect(child.material).not.to.be.instanceOf(THREE.LineDashedMaterial);
      }
      box.dispose();
    }
  });
});
