import { expect } from "chai";
import fc from "fast-check";
import * as THREE from "three";
import { describe, it } from "vitest";

import { ThreeUtils } from "sta/common";
import {
  checkValue,
  floatApprox,
  makeColorArbitrary,
  makeEulerArbitrary,
  makeVector3Arbitrary,
  tensorApprox,
} from "sta/common/testing";

import { BoundingBoxBuilder } from "../../../../../app/editor/scene/data/views";

export class MyBoundingBoxBuilder extends BoundingBoxBuilder {
  makeFaces(
    color: THREE.Color,
    opacity: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const faces = new THREE.BufferGeometry().setFromPoints([]);
    const material = new THREE.MeshBasicMaterial({ color, opacity });
    return new THREE.Mesh(faces, material);
  }

  makeForwardIndicatorFaces(
    color: THREE.Color,
    opacity: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const faces = new THREE.BufferGeometry().setFromPoints([]);
    const material = new THREE.MeshBasicMaterial({ color, opacity });
    return new THREE.Mesh(faces, material);
  }
}

const MIN_ABS = Math.sqrt(ThreeUtils.EPSILON);
const MAX_ABS = 1 / MIN_ABS;

const makeOtherComponentArbitrary = () =>
  fc.double({ min: -MAX_ABS, max: MAX_ABS, noNaN: true });

const makeSizeComponentArbitrary = () =>
  fc.double({ min: 0, max: MAX_ABS, noNaN: true });

export const makeBoundingBoxParamsArbitrary = () =>
  fc.record({
    position: makeVector3Arbitrary(makeOtherComponentArbitrary),
    rotation: makeEulerArbitrary(makeOtherComponentArbitrary),
    scale: makeVector3Arbitrary(makeSizeComponentArbitrary),
    color: makeColorArbitrary(),
    opacity: fc.double({ min: 0, max: 1, noNaN: true }),
    showForwardIndicator: fc.boolean(),
    showFrame: fc.boolean(),
  });

/**
 * Creates a test suite for {@link BoundingBoxBuilder#createBox}.
 *
 * @param builder The builder to use for the test.
 * @returns The new test suite.
 */
export function makeConstructorTest(
  builder: BoundingBoxBuilder,
): ReturnType<typeof describe> {
  return describe("#constructor()", () => {
    it("should set properties according to passed arguments", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          fc.context(),
          (params, ctx) => {
            const box = builder.createBox(params);

            expect(
              checkValue(box.position, params.position, ctx, (a, b) =>
                tensorApprox(a, b),
              ),
              "Incorrect value of position",
            ).to.be.true;

            expect(
              checkValue(box.rotation, params.rotation, ctx, (a, b) =>
                tensorApprox(a, b),
              ),
              "Incorrect value of rotation",
            ).to.be.true;

            expect(
              checkValue(box.scale, params.scale, ctx, (a, b) =>
                tensorApprox(a, b),
              ),
              "Incorrect value of scale",
            ).to.be.true;

            expect(
              checkValue(box.color.getHex(), params.color.getHex(), ctx),
              "Incorrect value of color",
            ).to.be.true;

            expect(
              checkValue(box.opacity, params.opacity, ctx, floatApprox),
              "Incorrect value of opacity",
            ).to.be.true;

            expect(
              checkValue(box.showFrame, params.showFrame, ctx),
              "Incorrect value of showFrame",
            ).to.be.true;

            expect(
              checkValue(
                box.showForwardIndicator,
                params.showForwardIndicator,
                ctx,
              ),
              "Incorrect value of showForwardIndicator",
            ).to.be.true;
          },
        ),
      );
    });
  });
}

/**
 * Creates a test suite for {@link BoundingBoxBuilder#makeCenter}.
 *
 * @param builder The builder to test.
 * @returns The new test suite.
 */
export function makeCenterTest(
  builder: BoundingBoxBuilder,
): ReturnType<typeof describe> {
  return describe("#makeCenter()", () => {
    it("should return a material with the given color", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeColorArbitrary(),
          fc.context(),
          (params, color, ctx) => {
            const material = builder.makeCenter(color).material;

            return checkValue(material.color.getHex(), color.getHex(), ctx);
          },
        ),
      );
    });
  });
}

/**
 * Creates a test suite for {@link BoundingBoxBuilder#makeFaces}.
 *
 * @param builder The builder to test.
 * @returns The new test suite.
 */
export function makeFacesTest(
  builder: BoundingBoxBuilder,
): ReturnType<typeof describe> {
  return describe("#makeFaces()", () => {
    it("should return a material with the given color", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeColorArbitrary(),
          fc.double(),
          fc.context(),
          (params, color, opacity, ctx) => {
            const material = builder.makeFaces(color, opacity).material;

            return checkValue(material.color.getHex(), color.getHex(), ctx);
          },
        ),
      );
    });
    it("should return a material with the given opacity", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeColorArbitrary(),
          fc.double(),
          fc.context(),
          (params, color, opacity, ctx) => {
            const material = builder.makeFaces(color, opacity).material;

            return checkValue(material.opacity, opacity, ctx);
          },
        ),
      );
    });
  });
}

/**
 * Creates a test suite for {@link BoundingBoxBuilder#makeForwardIndicatorFaces}.
 *
 * @param builder The builder to test.
 * @returns The new test suite.
 */
export function makeForwardIndicatorFacesTest(
  builder: BoundingBoxBuilder,
): ReturnType<typeof describe> {
  return describe("#makeFaces()", () => {
    it("should return a material with the given color", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeColorArbitrary(),
          fc.double(),
          fc.context(),
          (params, color, opacity, ctx) => {
            const material = builder.makeForwardIndicatorFaces(
              color,
              opacity,
            ).material;

            return checkValue(material.color.getHex(), color.getHex(), ctx);
          },
        ),
      );
    });
    it("should return a material with the given opacity", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeColorArbitrary(),
          fc.double(),
          fc.context(),
          (params, color, opacity, ctx) => {
            const material = builder.makeForwardIndicatorFaces(
              color,
              opacity,
            ).material;

            return checkValue(material.opacity, opacity, ctx);
          },
        ),
      );
    });
  });
}

describe("BoundingBox", () => {
  const testBuilder = new MyBoundingBoxBuilder();

  makeConstructorTest(testBuilder);
  describe("#position", () => {
    it("should have consistent getter and setter", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeVector3Arbitrary(makeOtherComponentArbitrary),
          fc.context(),
          (params, position, ctx) => {
            const box = testBuilder.createBox(params);

            box.position = position;

            return checkValue(box.position, position, ctx, (a, b) =>
              tensorApprox(a, b),
            );
          },
        ),
      );
    });
  });
  describe("#rotation", () => {
    it("should have consistent getter and setter", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeEulerArbitrary(makeOtherComponentArbitrary),
          fc.context(),
          (params, rotation, ctx) => {
            const box = testBuilder.createBox(params);

            box.rotation = rotation;

            return checkValue(box.rotation, rotation, ctx, (a, b) =>
              tensorApprox(a, b),
            );
          },
        ),
      );
    });
  });
  describe("#scale", () => {
    it("should have consistent getter and setter", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeVector3Arbitrary(makeSizeComponentArbitrary),
          fc.context(),
          (params, scale, ctx) => {
            const box = testBuilder.createBox(params);

            box.scale = scale;

            return checkValue(box.scale, scale, ctx, (a, b) =>
              tensorApprox(a, b),
            );
          },
        ),
      );
    });
  });
  describe("#color", () => {
    it("should have consistent getter and setter", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          makeColorArbitrary(),
          fc.context(),
          (params, color, ctx) => {
            const box = testBuilder.createBox(params);

            box.color = color;

            return checkValue(box.color.getHex(), color.getHex(), ctx);
          },
        ),
      );
    });
  });
  describe("#asObject3D()", () => {
    it("should return an instance of Object3D", () => {
      fc.assert(
        fc.property(
          makeBoundingBoxParamsArbitrary(),
          fc.context(),
          (params, ctx) => {
            const box = testBuilder.createBox(params);

            expect(box.asObject3D()).to.be.an.instanceof(THREE.Object3D);
          },
        ),
      );
    });
  });
  describe("#raycast()", () => {
    const box = testBuilder.createBox({
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3().setScalar(1),
      color: new THREE.Color(),
      opacity: 0,
    });
    const raycaster = new THREE.Raycaster();

    it("should raycast against faces when showFrame=true", () => {
      box.showFrame = true;

      // faces is an empty buffer so there should be no results
      const intersects = box.raycast(raycaster);
      expect(intersects.length).to.equal(
        0,
        "incorrect number of intersections",
      );
    });
    it("should raycast against center when showFrame=false", () => {
      box.showFrame = false;

      const intersects = box.raycast(raycaster);
      expect(intersects.length).to.equal(
        1,
        "incorrect number of intersections",
      );

      const [intersect] = intersects;
      expect(intersect.object).to.be.an.instanceof(
        THREE.Points,
        "incorrect intersection object",
      );

      expect(
        checkValue(
          intersect.point,
          new THREE.Vector3(),
          undefined,
          tensorApprox,
        ),
        "incorrect intersection position",
      ).to.be.true;
    });
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
