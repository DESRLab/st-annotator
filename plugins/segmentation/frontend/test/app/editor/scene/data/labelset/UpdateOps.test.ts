import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import type { ReadonlyLabelInstance } from "../../../../../../app/editor/scene/data";
import { BaseSegmentationIndex } from "../../../../../../app/editor/scene/data/SegmentationIndex";
import {
  InstanceOps,
  SelectionOps,
  StaleTargetError,
} from "../../../../../../app/editor/scene/data/labelset";
import { DistinctiveLevel, OcclusionLevel } from "../../../../../../models";

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };

function makeIndex() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseSegmentationIndex(config, {});

  for (const labelClass of [CLASS_CAR, CLASS_PEDESTRIAN]) {
    index.addLabelClass({
      id: labelClass.id,
      name: labelClass.name,
      selectionColor: new THREE.Color("red"),
    });
  }

  const instance = index.addLabelInstance({
    id: "test-instance",
    gtClassId: CLASS_CAR.id,
    isBlack: false,
  }) as ReadonlyLabelInstance;
  const selection = index.addLabelSelection({
    id: "test-selection",
    points: [new THREE.Vector3(0, 0, 0)],
    timestamp: null,
    entityId: instance.id,
    perceivedClassId: CLASS_CAR.id,
    distinctiveLv: DistinctiveLevel.Excellent,
    occlusionLv: OcclusionLevel.Unknown,
  });

  return { index, instance, selection };
}

describe("segmentation instance operations", () => {
  it("AssignClass applies, undoes, and names the ground-truth class change", () => {
    const { index, instance } = makeIndex();
    const op = InstanceOps.AssignClass.fromParams(instance, {
      id: CLASS_PEDESTRIAN.id,
    } as never);

    expect(op.displayName).to.equal("Assign Instance Ground Truth Class");
    expect(op.opName).to.equal("instance-assign-class");

    op.applyIndex(index);
    expect(instance.gtClassId).to.equal(CLASS_PEDESTRIAN.id);

    op.undoIndex(index);
    expect(instance.gtClassId).to.equal(CLASS_CAR.id);
  });

  it("AssignIsBlack applies, undoes, and names the reflectivity change", () => {
    const { index, instance } = makeIndex();
    const op = InstanceOps.AssignIsBlack.fromParams(instance, true);

    expect(op.displayName).to.equal("Set Is Black");
    expect(op.opName).to.equal("instance-assign-is-black");

    op.applyIndex(index);
    expect(instance.isBlack).to.equal(true);

    op.undoIndex(index);
    expect(instance.isBlack).to.equal(false);
  });

  it("Create clones the given attributes, selects nothing, and undoes by deletion", () => {
    const { index } = makeIndex();
    const op = InstanceOps.Create.fromParams({
      gtClassId: CLASS_PEDESTRIAN.id,
      isBlack: true,
    });

    expect(op.displayName).to.equal("Create Object Instance");
    expect(op.opName).to.equal("instance-create");
    expect(op.newInstance).to.equal(undefined);

    op.applyIndex(index);
    const newInstance = op.newInstance;
    expect(newInstance).to.not.equal(undefined);
    expect(newInstance?.gtClassId).to.equal(CLASS_PEDESTRIAN.id);
    expect(newInstance?.isBlack).to.equal(true);
    expect(index.hasLabelInstance(newInstance!.id)).to.equal(true);

    op.undoIndex(index);
    expect(op.newInstance).to.equal(undefined);
    expect(index.hasLabelInstance(newInstance!.id)).to.equal(false);
  });

  it("reassigns a selection, restores it on undo, and protects related instances from deletion", () => {
    const { index, instance, selection } = makeIndex();
    const other = index.addLabelInstance({
      id: "other-instance",
      gtClassId: CLASS_PEDESTRIAN.id,
      isBlack: false,
    });
    const reassign = SelectionOps.AssignEntity.fromParams(selection, other);

    reassign.applyIndex(index);
    expect(selection.entityId).to.equal(other.id);
    expect(() =>
      InstanceOps.Delete.fromParams(other).applyIndex(index),
    ).to.throw(/used by the selection/);

    reassign.undoIndex(index);
    expect(selection.entityId).to.equal(instance.id);

    const deletion = InstanceOps.Delete.fromParams(other);
    deletion.applyIndex(index);
    expect(index.hasLabelInstance(other.id)).to.equal(false);
    deletion.undoIndex(index);
    expect(index.hasLabelInstance(other.id)).to.equal(true);
  });
});

describe("segmentation selection update operations", () => {
  it("AssignClass applies, undoes, and names the perceived-class change", () => {
    const { index, selection } = makeIndex();
    const op = SelectionOps.AssignClass.fromParams(selection, {
      id: CLASS_PEDESTRIAN.id,
    } as never);

    expect(op.displayName).to.equal("Assign Ground Truth");
    expect(op.opName).to.equal("selection-assign-class");

    op.applyIndex(index);
    expect(selection.perceivedClassId).to.equal(CLASS_PEDESTRIAN.id);

    op.undoIndex(index);
    expect(selection.perceivedClassId).to.equal(CLASS_CAR.id);
  });

  it("AssignDistinctiveLv applies, undoes, and names the descriptor change", () => {
    const { index, selection } = makeIndex();
    const op = SelectionOps.AssignDistinctiveLv.fromParams(
      selection,
      DistinctiveLevel.Poor,
    );

    expect(op.displayName).to.equal("Set Distinctiveness Level");
    expect(op.opName).to.equal("selection-assign-distinctive-level");

    op.applyIndex(index);
    expect(selection.distinctiveLv.value).to.equal(DistinctiveLevel.Poor.value);

    op.undoIndex(index);
    expect(selection.distinctiveLv.value).to.equal(
      DistinctiveLevel.Excellent.value,
    );
  });

  it("AssignOcclusionLv applies, undoes, and names the descriptor change", () => {
    const { index, selection } = makeIndex();
    const op = SelectionOps.AssignOcclusionLv.fromParams(
      selection,
      OcclusionLevel.Satisfactory,
    );

    expect(op.displayName).to.equal("Set Occlusion Level");
    expect(op.opName).to.equal("selection-assign-occlusion-level");

    op.applyIndex(index);
    expect(selection.occlusionLv.value).to.equal(
      OcclusionLevel.Satisfactory.value,
    );

    op.undoIndex(index);
    expect(selection.occlusionLv.value).to.equal(OcclusionLevel.Unknown.value);
  });

  it("AssignEntity applies, undoes, and names the parent-instance change", () => {
    const { index, selection } = makeIndex();
    const op = SelectionOps.AssignEntity.fromParams(selection, null);

    expect(op.displayName).to.equal("Assign Object Instance");

    op.applyIndex(index);
    expect(selection.entityId).to.equal(null);

    op.undoIndex(index);
    expect(selection.entityId).to.equal("test-instance");
  });
});

describe("segmentation stale-target operation policy (delete versus edit)", () => {
  it("rejects selection edits whose target was deleted before the op applied", () => {
    const { index, selection } = makeIndex();
    SelectionOps.Delete.fromParams(selection).applyIndex(index);

    expect(() =>
      SelectionOps.AssignClass.fromParams(selection, {
        id: CLASS_PEDESTRIAN.id,
      } as never).applyIndex(index),
    ).to.throw(StaleTargetError);
    expect(() =>
      SelectionOps.EditPointSelection.fromParams(selection, "inspector", {
        points: [new THREE.Vector3(9, 9, 9)],
      }).applyIndex(index),
    ).to.throw(StaleTargetError);
    // Deleting an already-deleted selection is likewise rejected, not applied twice.
    expect(() =>
      SelectionOps.Delete.fromParams(selection).applyIndex(index),
    ).to.throw(StaleTargetError);
  });

  it("rejects instance edits whose target was deleted before the op applied", () => {
    const { index } = makeIndex();
    const unused = index.addLabelInstance({
      id: "unused-instance",
      gtClassId: CLASS_CAR.id,
      isBlack: false,
    }) as ReadonlyLabelInstance;
    InstanceOps.Delete.fromParams(unused).applyIndex(index);

    expect(() =>
      InstanceOps.AssignClass.fromParams(unused, {
        id: CLASS_PEDESTRIAN.id,
      } as never).applyIndex(index),
    ).to.throw(StaleTargetError);
    expect(() =>
      InstanceOps.Delete.fromParams(unused).applyIndex(index),
    ).to.throw(StaleTargetError);
  });

  it("rejects reassigning a selection to an instance deleted before the op applied (no dangling reference)", () => {
    const { index, selection } = makeIndex();
    const other = index.addLabelInstance({
      id: "other-instance",
      gtClassId: CLASS_PEDESTRIAN.id,
      isBlack: false,
    }) as ReadonlyLabelInstance;
    InstanceOps.Delete.fromParams(other).applyIndex(index);

    expect(() =>
      SelectionOps.AssignEntity.fromParams(selection, other).applyIndex(index),
    ).to.throw(StaleTargetError);
    // The selection keeps its original parent; no dangling reference is written.
    expect(selection.entityId).to.equal("test-instance");
    expect(selection.entity?.id).to.equal("test-instance");
  });

  it("undo of a delete restores the label under its id as a fresh instance", () => {
    const { index, selection } = makeIndex();
    const deletion = SelectionOps.Delete.fromParams(selection);
    deletion.applyIndex(index);
    expect(index.hasLabelSelection(selection.id)).to.equal(false);

    deletion.undoIndex(index);
    expect(index.hasLabelSelection(selection.id)).to.equal(true);
    expect(index.getLabelSelection(selection.id)).to.not.equal(selection);
    expect(index.getLabelSelection(selection.id).entityId).to.equal(
      "test-instance",
    );
  });
});
