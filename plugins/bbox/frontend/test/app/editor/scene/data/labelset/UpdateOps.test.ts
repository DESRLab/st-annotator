import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";
import { OptionalVector3 } from "sta/common";

import type {
  ReadonlyLabelBox,
  ReadonlyLabelTrack,
} from "../../../../../../app/editor/scene/data";
import { BaseBBoxIndex } from "../../../../../../app/editor/scene/data/BBoxIndex";
import {
  BoxOps,
  StaleTargetError,
  TrackOps,
} from "../../../../../../app/editor/scene/data/labelset";
import { DistinctiveLevel, OcclusionLevel } from "../../../../../../models";

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };

function makeIndex() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseBBoxIndex(config, {});

  for (const labelClass of [CLASS_CAR, CLASS_PEDESTRIAN]) {
    index.addLabelClass({
      id: labelClass.id,
      name: labelClass.name,
      boxColor: new THREE.Color("red"),
      defaultSizeDatabase: new OptionalVector3(1, 1, 1),
    });
  }

  const track = index.addLabelTrack({
    id: "test-track",
    gtClassId: CLASS_CAR.id,
    isBlack: false,
  }) as ReadonlyLabelTrack;
  const box = index.addLabelBox({
    id: "test-box",
    entityId: track.id,
    boxType: "cuboid",
    center: new THREE.Vector3(1, 2, 3),
    angle: 0.5,
    size: new THREE.Vector3(4, 5, 6),
    timestamp: null,
    qualityRank: null,
    distinctiveLv: DistinctiveLevel.Excellent,
    occlusionLv: OcclusionLevel.Unknown,
    perceivedClassId: CLASS_CAR.id,
  } as never);

  return { index, track, box };
}

describe("bbox box update operations", () => {
  it("Create uses a placeholder ID and undo removes the pasted-style box", () => {
    const { index } = makeIndex();
    const op = BoxOps.Create.fromParams({
      entityId: null,
      boxType: "cuboid",
      center: new THREE.Vector3(7, 8, 9),
      angle: 0.25,
      size: new THREE.Vector3(1, 2, 3),
      timestamp: null,
      qualityRank: 1,
      distinctiveLv: DistinctiveLevel.Excellent,
      occlusionLv: OcclusionLevel.Unknown,
      perceivedClassId: CLASS_CAR.id,
    } as never);
    op.applyIndex(index);
    const created = op.newBox!;
    expect(created.id).to.equal(op.opResult);
    expect(created.center.toArray()).to.deep.equal([7, 8, 9]);
    expect(created.angle).to.equal(0.25);
    expect(created.size.toArray()).to.deep.equal([1, 2, 3]);
    expect(created.timestamp).to.equal(null);
    expect(created.entityId).to.equal(null);
    expect(index.hasLabelBox(op.opResult)).to.equal(true);
    op.undoIndex(index);
    expect(index.hasLabelBox(op.opResult)).to.equal(false);
  });

  it("AssignClass applies, undoes, and names the perceived-class change", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignClass.fromParams(box, CLASS_PEDESTRIAN);

    expect(op.displayName).to.equal("Assign Perceived Class");
    expect(op.opName).to.equal("box-assign-class");

    op.applyIndex(index);
    expect(box.perceivedClassId).to.equal(CLASS_PEDESTRIAN.id);

    op.undoIndex(index);
    expect(box.perceivedClassId).to.equal(CLASS_CAR.id);
  });

  it("AssignClass clears the perceived class when given no class", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignClass.fromParams(box, null);

    op.applyIndex(index);
    expect(box.perceivedClassId).to.equal(null);

    op.undoIndex(index);
    expect(box.perceivedClassId).to.equal(CLASS_CAR.id);
  });

  it("AssignDistinctiveLv applies, undoes, and names the descriptor change", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignDistinctiveLv.fromParams(
      box,
      DistinctiveLevel.Poor,
    );

    expect(op.displayName).to.equal("Set Distinctiveness Level");
    expect(op.opName).to.equal("box-assign-distinctive-level");

    op.applyIndex(index);
    expect(box.distinctiveLv.value).to.equal(DistinctiveLevel.Poor.value);

    op.undoIndex(index);
    expect(box.distinctiveLv.value).to.equal(DistinctiveLevel.Excellent.value);
  });

  it("AssignOcclusionLv applies, undoes, and names the descriptor change", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignOcclusionLv.fromParams(
      box,
      OcclusionLevel.Satisfactory,
    );

    expect(op.displayName).to.equal("Set Occlusion Level");
    expect(op.opName).to.equal("box-assign-occlusion-level");

    op.applyIndex(index);
    expect(box.occlusionLv.value).to.equal(OcclusionLevel.Satisfactory.value);

    op.undoIndex(index);
    expect(box.occlusionLv.value).to.equal(OcclusionLevel.Unknown.value);
  });

  it("AssignEntity applies, undoes, and names the parent-track change", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignEntity.fromParams(box, null);

    expect(op.displayName).to.equal("Assign Object Track");
    expect(op.opName).to.equal("box-assign-entity");

    op.applyIndex(index);
    expect(box.entityId).to.equal(null);

    op.undoIndex(index);
    expect(box.entityId).to.equal("test-track");
  });

  it("AssignType applies, undoes, and names the geometry-type change", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignType.fromParams(box, "cylinder");

    expect(op.displayName).to.equal("Update Geometry Type");
    expect(op.opName).to.equal("box-assign-type");

    op.applyIndex(index);
    expect(box.boxType).to.equal("cylinder");

    op.undoIndex(index);
    expect(box.boxType).to.equal("cuboid");
  });

  it("TransformBox applies, undoes, and names the pose change", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.TransformBox.fromParams(box, "translate", {
      center: { x: 10, y: 20, z: 30 },
      angle: 1.25,
      size: { x: 7, y: 8, z: 9 },
    });

    expect(op.displayName).to.equal("Transform Box");
    expect(op.opName).to.equal("box-transform");

    op.applyIndex(index);
    expect({
      x: box.center.x,
      y: box.center.y,
      z: box.center.z,
    }).to.deep.equal({ x: 10, y: 20, z: 30 });
    expect(box.angle).to.equal(1.25);
    expect({ x: box.size.x, y: box.size.y, z: box.size.z }).to.deep.equal({
      x: 7,
      y: 8,
      z: 9,
    });

    op.undoIndex(index);
    expect({
      x: box.center.x,
      y: box.center.y,
      z: box.center.z,
    }).to.deep.equal({ x: 1, y: 2, z: 3 });
    expect(box.angle).to.equal(0.5);
    expect({ x: box.size.x, y: box.size.y, z: box.size.z }).to.deep.equal({
      x: 4,
      y: 5,
      z: 6,
    });
  });

  it("TransformBox honors an explicit prevPose when the box already shows the new pose", () => {
    const { index, box } = makeIndex();
    // The gizmo applies the new pose to the Object3D before the operation
    // commits; the snapshot taken before the drag must be the undo state.
    index.updateLabelBox(box, {
      center: new THREE.Vector3(10, 20, 30),
      angle: 1.25,
      size: new THREE.Vector3(7, 8, 9),
    });
    const op = BoxOps.TransformBox.fromParams(
      box,
      "translate",
      {
        center: { x: 10, y: 20, z: 30 },
        angle: 1.25,
        size: { x: 7, y: 8, z: 9 },
      },
      {
        center: { x: 1, y: 2, z: 3 },
        angle: 0.5,
        size: { x: 4, y: 5, z: 6 },
      },
    );

    op.applyIndex(index);
    op.undoIndex(index);

    expect({
      x: box.center.x,
      y: box.center.y,
      z: box.center.z,
    }).to.deep.equal({ x: 1, y: 2, z: 3 });
    expect(box.angle).to.equal(0.5);
    expect({ x: box.size.x, y: box.size.y, z: box.size.z }).to.deep.equal({
      x: 4,
      y: 5,
      z: 6,
    });
  });

  it("rejects undo before apply and double apply", () => {
    const { index, box } = makeIndex();
    const op = BoxOps.AssignClass.fromParams(box, CLASS_PEDESTRIAN);

    expect(() => op.undoIndex(index)).to.throw();
    op.applyIndex(index);
    expect(() => op.applyIndex(index)).to.throw();
  });
});

describe("bbox track update operations", () => {
  it("Create exposes a placeholder relationship id and undo removes the track", () => {
    const { index } = makeIndex();
    const op = TrackOps.Create.fromParams({
      gtClassId: CLASS_PEDESTRIAN.id,
      isBlack: true,
      minTimestamp: null,
      maxTimestamp: null,
    });

    expect(op.opName).to.equal("track-create");
    expect(op.newTrack).to.equal(undefined);
    op.applyIndex(index);

    const created = op.newTrack!;
    expect(created.id).to.equal(op.opResult);
    expect(created.gtClassId).to.equal(CLASS_PEDESTRIAN.id);
    expect(created.isBlack).to.equal(true);
    expect(index.hasLabelTrack(created.id)).to.equal(true);

    op.undoIndex(index);
    expect(index.hasLabelTrack(created.id)).to.equal(false);
  });

  it("reassigns a box between tracks, restores it on undo, and protects related tracks from deletion", () => {
    const { index, track, box } = makeIndex();
    const other = index.addLabelTrack({
      id: "other-track",
      gtClassId: CLASS_PEDESTRIAN.id,
      isBlack: false,
    });
    const reassign = BoxOps.AssignEntity.fromParams(box, other);

    reassign.applyIndex(index);
    expect(box.entityId).to.equal(other.id);
    expect(() => TrackOps.Delete.fromParams(other).applyIndex(index)).to.throw(
      /used by the box/,
    );

    reassign.undoIndex(index);
    expect(box.entityId).to.equal(track.id);

    const deletion = TrackOps.Delete.fromParams(other);
    deletion.applyIndex(index);
    expect(index.hasLabelTrack(other.id)).to.equal(false);
    deletion.undoIndex(index);
    expect(index.hasLabelTrack(other.id)).to.equal(true);
  });

  it("AssignClass applies, undoes, and names the ground-truth class change", () => {
    const { index, track } = makeIndex();
    const op = TrackOps.AssignClass.fromParams(track, CLASS_PEDESTRIAN);

    expect(op.displayName).to.equal("Assign Ground Truth Class");
    expect(op.opName).to.equal("track-assign-class");

    op.applyIndex(index);
    expect(track.gtClassId).to.equal(CLASS_PEDESTRIAN.id);

    op.undoIndex(index);
    expect(track.gtClassId).to.equal(CLASS_CAR.id);
  });

  it("AssignIsBlack applies, undoes, and names the reflectivity change", () => {
    const { index, track } = makeIndex();
    const op = TrackOps.AssignIsBlack.fromParams(track, true);

    expect(op.displayName).to.equal("Set Is Black");
    expect(op.opName).to.equal("track-assign-is-black");

    op.applyIndex(index);
    expect(track.isBlack).to.equal(true);

    op.undoIndex(index);
    expect(track.isBlack).to.equal(false);
  });
});

describe("bbox stale-target operation policy (delete versus edit)", () => {
  function deleteBox(index: BaseBBoxIndex, box: ReadonlyLabelBox): void {
    BoxOps.Delete.fromParams(box).applyIndex(index);
  }

  function deleteTrack(index: BaseBBoxIndex, track: ReadonlyLabelTrack): void {
    TrackOps.Delete.fromParams(track).applyIndex(index);
  }

  it("rejects box edits whose target was deleted before the op applied", () => {
    const { index, box } = makeIndex();
    deleteBox(index, box);

    expect(() =>
      BoxOps.AssignClass.fromParams(box, CLASS_PEDESTRIAN).applyIndex(index),
    ).to.throw(StaleTargetError);
    expect(() =>
      BoxOps.TransformBox.fromParams(box, "translate", {
        center: { x: 10, y: 20, z: 30 },
        angle: 1.25,
        size: { x: 7, y: 8, z: 9 },
      }).applyIndex(index),
    ).to.throw(StaleTargetError);
    // Deleting an already-deleted box is likewise rejected, not applied twice.
    expect(() => BoxOps.Delete.fromParams(box).applyIndex(index)).to.throw(
      StaleTargetError,
    );
  });

  it("rejects track edits whose target was deleted before the op applied", () => {
    const { index } = makeIndex();
    const unused = index.addLabelTrack({
      id: "unused-track",
      gtClassId: CLASS_CAR.id,
      isBlack: false,
    }) as ReadonlyLabelTrack;
    deleteTrack(index, unused);

    expect(() =>
      TrackOps.AssignClass.fromParams(unused, CLASS_PEDESTRIAN).applyIndex(
        index,
      ),
    ).to.throw(StaleTargetError);
    expect(() => TrackOps.Delete.fromParams(unused).applyIndex(index)).to.throw(
      StaleTargetError,
    );
  });

  it("rejects reassigning a box to a track deleted before the op applied (no dangling reference)", () => {
    const { index, box } = makeIndex();
    const other = index.addLabelTrack({
      id: "other-track",
      gtClassId: CLASS_PEDESTRIAN.id,
      isBlack: false,
    }) as ReadonlyLabelTrack;
    deleteTrack(index, other);

    expect(() =>
      BoxOps.AssignEntity.fromParams(box, other).applyIndex(index),
    ).to.throw(StaleTargetError);
    // The box keeps its original parent; no dangling reference is written.
    expect(box.entityId).to.equal("test-track");
    expect(box.entity?.id).to.equal("test-track");
  });

  it("undo of a delete restores the label under its id as a fresh instance", () => {
    const { index, box } = makeIndex();
    const deletion = BoxOps.Delete.fromParams(box);
    deletion.applyIndex(index);
    expect(index.hasLabelBox(box.id)).to.equal(false);

    deletion.undoIndex(index);
    expect(index.hasLabelBox(box.id)).to.equal(true);
    expect(index.getLabelBox(box.id)).to.not.equal(box);
    expect(index.getLabelBox(box.id).entityId).to.equal("test-track");
  });

  it("a placeholder-created box survives delete + undo and edits of stale instances are rejected", () => {
    const { index } = makeIndex();
    const create = BoxOps.Create.fromParams({
      entityId: null,
      boxType: "cuboid",
      center: new THREE.Vector3(7, 8, 9),
      angle: 0.25,
      size: new THREE.Vector3(1, 2, 3),
      timestamp: null,
      qualityRank: 1,
      distinctiveLv: DistinctiveLevel.Excellent,
      occlusionLv: OcclusionLevel.Unknown,
      perceivedClassId: CLASS_CAR.id,
    } as never);
    create.applyIndex(index);
    const created = create.newBox!;

    const deletion = BoxOps.Delete.fromParams(created);
    deletion.applyIndex(index);

    // A stale control holding the deleted instance cannot edit it.
    expect(() =>
      BoxOps.AssignClass.fromParams(created, CLASS_PEDESTRIAN).applyIndex(
        index,
      ),
    ).to.throw(StaleTargetError);

    deletion.undoIndex(index);
    expect(index.hasLabelBox(created.id)).to.equal(true);
    expect(index.getLabelBox(created.id).perceivedClassId).to.equal(
      CLASS_CAR.id,
    );
  });
});
