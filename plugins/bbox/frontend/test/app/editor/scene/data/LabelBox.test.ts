import { expect } from "chai";
import fc from "fast-check";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";
import { ThreeUtils } from "sta/common";
import { makeEulerArbitrary, makeVector3Arbitrary } from "sta/common/testing";

import { LabelBox } from "../../../../../app/editor/scene/data/LabelBox";

const MIN_ABS = Math.sqrt(ThreeUtils.EPSILON);
const MAX_ABS = 1 / MIN_ABS;

const makeOtherComponentArbitrary = () =>
  fc.double({ min: -MAX_ABS, max: MAX_ABS, noNaN: true });

function makeBox() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );

  const box = new LabelBox({
    config: config,
    labels: null,
    id: "test-box",
    boxType: "cuboid",
    center: new THREE.Vector3(1, 2, 3),
    angle: Math.PI / 4,
    size: new THREE.Vector3(4, 5, 6),
  });

  return { config, box };
}

describe("LabelBox", () => {
  describe(".poseFromTransform()", () => {
    it("should derive the same pose as the center/angle/size getters for any transform", () => {
      fc.assert(
        fc.property(
          makeVector3Arbitrary(makeOtherComponentArbitrary),
          makeEulerArbitrary(makeOtherComponentArbitrary),
          makeVector3Arbitrary(makeOtherComponentArbitrary),
          (position, rotation, scale) => {
            const { config, box } = makeBox();

            // Mutates the Object3D directly, like the transform gizmo does
            const obj3D = box.asObject3D();
            obj3D.position.copy(position);
            obj3D.rotation.copy(rotation);
            obj3D.scale.copy(scale);

            const pose = LabelBox.poseFromTransform(config, obj3D);

            expect(pose.center).to.deep.equal(
              {
                x: box.center.x,
                y: box.center.y,
                z: box.center.z,
              },
              "Incorrect center",
            );
            expect(pose.angle).to.equal(box.angle, "Incorrect angle");
            expect(pose.size).to.deep.equal(
              { x: box.size.x, y: box.size.y, z: box.size.z },
              "Incorrect size",
            );
          },
        ),
      );
    });

    // The transform modes of the gizmo mutate the Object3D after the previous
    // transform was snapshotted; the pose derived from the snapshot must still
    // match the pose the box had when the snapshot was taken.
    it("should recover the pose snapshotted before the transformation for every transform mode", () => {
      const mutations = {
        translate: (obj3D: THREE.Object3D) => {
          obj3D.position.add(new THREE.Vector3(7, -8, 9));
        },
        rotate: (obj3D: THREE.Object3D) => {
          obj3D.rotation.y += Math.PI / 3;
        },
        scale: (obj3D: THREE.Object3D) => {
          obj3D.scale.multiply(new THREE.Vector3(2, -3, 0.5));
        },
        "rotate-heading": (obj3D: THREE.Object3D) => {
          obj3D.rotation.y += Math.PI / 2;
          [obj3D.scale.x, obj3D.scale.z] = [obj3D.scale.z, obj3D.scale.x];
        },
      } as const;

      for (const mutate of Object.values(mutations)) {
        const { config, box } = makeBox();

        const obj3D = box.asObject3D();

        // Snapshots the transform before the mutation, like the gizmo does
        const prevTransform = {
          position: obj3D.position.clone(),
          rotation: obj3D.rotation.clone(),
          scale: obj3D.scale.clone(),
        };

        mutate(obj3D);

        const prevPose = LabelBox.poseFromTransform(config, prevTransform);

        expect(prevPose.center).to.deep.equal(
          { x: 1, y: 2, z: 3 },
          "Incorrect center",
        );
        expect(prevPose.angle).to.be.closeTo(
          Math.PI / 4,
          ThreeUtils.EPSILON,
          "Incorrect angle",
        );
        expect(prevPose.size).to.deep.equal(
          { x: 4, y: 5, z: 6 },
          "Incorrect size",
        );
      }
    });
  });
});
