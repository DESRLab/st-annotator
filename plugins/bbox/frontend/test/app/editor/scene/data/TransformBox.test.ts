import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import { BaseBBoxIndex } from "../../../../../app/editor/scene/data/BBoxIndex";
import { TransformBox } from "../../../../../app/editor/scene/data/labelset/box/index.ts";
import type { BoxPose } from "../../../../../app/editor/scene/data/labelset/box/index.ts";

type Box = ReturnType<BaseBBoxIndex["addLabelBox"]>;

const INITIAL_POSE: BoxPose = {
  center: { x: 1, y: 2, z: 3 },
  angle: Math.PI / 4,
  size: { x: 4, y: 5, z: 6 },
};

const NEW_POSE: BoxPose = {
  center: { x: 10, y: 20, z: 30 },
  angle: Math.PI / 2,
  size: { x: 7, y: 8, z: 9 },
};

function makeIndex() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseBBoxIndex(config, {});

  const box = index.addLabelBox({
    id: "test-box",
    entityId: null,
    boxType: "cuboid",
    center: new THREE.Vector3(
      INITIAL_POSE.center.x,
      INITIAL_POSE.center.y,
      INITIAL_POSE.center.z,
    ),
    angle: INITIAL_POSE.angle,
    size: new THREE.Vector3(
      INITIAL_POSE.size.x,
      INITIAL_POSE.size.y,
      INITIAL_POSE.size.z,
    ),
    timestamp: null,
    qualityRank: null,
    distinctiveLv: null,
    occlusionLv: null,
    perceivedClassId: null,
  } as never);

  return { index, box };
}

function setPose(index: BaseBBoxIndex, box: Box, pose: BoxPose) {
  index.updateLabelBox(box, {
    center: new THREE.Vector3(pose.center.x, pose.center.y, pose.center.z),
    angle: pose.angle,
    size: new THREE.Vector3(pose.size.x, pose.size.y, pose.size.z),
  });
}

function expectPose(box: Box, pose: BoxPose) {
  expect({ x: box.center.x, y: box.center.y, z: box.center.z }).to.deep.equal(
    pose.center,
    "Incorrect center",
  );
  expect(box.angle).to.be.closeTo(pose.angle, 1e-9, "Incorrect angle");
  expect({ x: box.size.x, y: box.size.y, z: box.size.z }).to.deep.equal(
    pose.size,
    "Incorrect size",
  );
}

describe("TransformBox", () => {
  describe(".fromParams()", () => {
    it("should construct the operation params from the new pose only", () => {
      const { box } = makeIndex();

      const op = TransformBox.fromParams(
        box,
        "translate",
        NEW_POSE,
        INITIAL_POSE,
      );

      expect(op.opParams.box_id).to.equal(box.id, "Incorrect box_id");
      expect(op.opParams.mode).to.equal("translate", "Incorrect mode");
      expect(op.opParams.angle).to.equal(
        NEW_POSE.angle.toString(),
        "Incorrect angle",
      );

      const center = op.opParams.center.toVector3();
      expect({ x: center.x, y: center.y, z: center.z }).to.deep.equal(
        NEW_POSE.center,
        "Incorrect center",
      );

      const size = op.opParams.size.toVector3();
      expect({ x: size.x, y: size.y, z: size.z }).to.deep.equal(
        NEW_POSE.size,
        "Incorrect size",
      );
    });
  });

  describe("#applyIndex()", () => {
    it("should use the given previous pose as the undo data", () => {
      const { index, box } = makeIndex();

      // Like during a gizmo drag, the box already reflects the new pose
      // by the time the operation is applied
      setPose(index, box, NEW_POSE);

      const op = TransformBox.fromParams(
        box,
        "translate",
        NEW_POSE,
        INITIAL_POSE,
      );
      op.applyIndex(index);

      op.undoIndex(index);

      expectPose(box, INITIAL_POSE);
    });

    it("should keep the same undo data when reapplied after an undo", () => {
      const { index, box } = makeIndex();

      setPose(index, box, NEW_POSE);

      const op = TransformBox.fromParams(box, "rotate", NEW_POSE, INITIAL_POSE);

      op.applyIndex(index);
      op.undoIndex(index);
      expectPose(box, INITIAL_POSE);

      op.applyIndex(index);
      op.undoIndex(index);
      expectPose(box, INITIAL_POSE);
    });

    it("should read the current pose as the undo data when no previous pose is given", () => {
      const { index, box } = makeIndex();

      const op = TransformBox.fromParams(box, "inspector", NEW_POSE);

      op.applyIndex(index);
      expectPose(box, NEW_POSE);

      op.undoIndex(index);
      expectPose(box, INITIAL_POSE);
    });
  });
});
