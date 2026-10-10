import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import type { ReadonlyLabelVector } from "../../../../../../app/editor/scene/data";
import { BaseVectorIndex } from "../../../../../../app/editor/scene/data/VectorIndex";
import {
  VectorOps,
  StaleTargetError,
} from "../../../../../../app/editor/scene/data/labelset";

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };

function makeIndex() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseVectorIndex(config, {});

  for (const labelClass of [CLASS_CAR, CLASS_PEDESTRIAN]) {
    index.addLabelClass({
      id: labelClass.id,
      name: labelClass.name,
      vectorColor: new THREE.Color("red"),
    });
  }

  const vector = index.addLabelVector({
    id: "test-vector",
    vectorType: "LineString",
    vertices: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)],
    gtClassId: CLASS_CAR.id,
  } as never) as ReadonlyLabelVector;

  return { index, vector };
}

describe("vector update operations", () => {
  it("Create uses a placeholder ID and undo removes the pasted-style vector", () => {
    const { index } = makeIndex();
    const op = VectorOps.Create.fromParams({
      vectorType: "LineString",
      vertices: [new THREE.Vector3(2, 3, 4), new THREE.Vector3(5, 6, 7)],
      timestamp: null,
      gtClassId: CLASS_CAR.id,
    });
    op.applyIndex(index);
    expect(op.newVector.id).to.equal(op.opResult);
    expect(op.newVector.vectorType).to.equal("LineString");
    expect(op.newVector.gtClassId).to.equal(CLASS_CAR.id);
    expect(
      op.newVector.vertices.map((vertex: THREE.Vector3) => vertex.toArray()),
    ).to.deep.equal([
      [2, 3, 4],
      [5, 6, 7],
    ]);
    expect(index.hasLabelVector(op.opResult)).to.equal(true);
    op.undoIndex(index);
    expect(index.hasLabelVector(op.opResult)).to.equal(false);
  });

  it("AssignClass applies, undoes, and names the ground-truth class change", () => {
    const { index, vector } = makeIndex();
    const op = VectorOps.AssignClass.fromParams(vector, {
      id: CLASS_PEDESTRIAN.id,
    });

    expect(op.displayName).to.equal("Assign Ground Truth Class");
    expect(op.opName).to.equal("vector-assign-class");

    op.applyIndex(index);
    expect(vector.gtClassId).to.equal(CLASS_PEDESTRIAN.id);

    op.undoIndex(index);
    expect(vector.gtClassId).to.equal(CLASS_CAR.id);
  });

  it("AssignClass clears the ground-truth class when given no class", () => {
    const { index, vector } = makeIndex();
    const op = VectorOps.AssignClass.fromParams(vector, null);

    op.applyIndex(index);
    expect(vector.gtClassId).to.equal(null);

    op.undoIndex(index);
    expect(vector.gtClassId).to.equal(CLASS_CAR.id);
  });

  it("EditVectorGeometry applies, undoes, and names the geometry change", () => {
    const { index, vector } = makeIndex();
    const op = VectorOps.EditVectorGeometry.fromParams(vector, "vertex", {
      type: "Polygon",
      vertices: [
        { x: 5, y: 6, z: 7 },
        { x: 8, y: 9, z: 10 },
        { x: 11, y: 12, z: 13 },
      ],
    });

    expect(op.displayName).to.equal("Edit Vector Geometry");
    expect(op.opName).to.equal("vector-edit");

    op.applyIndex(index);
    expect(vector.vectorType).to.equal("Polygon");
    expect(
      vector.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z })),
    ).to.deep.equal([
      { x: 5, y: 6, z: 7 },
      { x: 8, y: 9, z: 10 },
      { x: 11, y: 12, z: 13 },
    ]);

    op.undoIndex(index);
    expect(vector.vectorType).to.equal("LineString");
    expect(
      vector.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z })),
    ).to.deep.equal([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]);
  });

  it("EditVectorGeometry honors explicit prevVertices when the vector already shows the new geometry", () => {
    const { index, vector } = makeIndex();
    // The gizmo moves the vertices before the operation commits; the
    // snapshot taken before the drag must be the undo state.
    const newVertices = [
      { x: 5, y: 6, z: 7 },
      { x: 8, y: 9, z: 10 },
    ];
    const op = VectorOps.EditVectorGeometry.fromParams(
      vector,
      "vertex",
      {
        type: "LineString",
        vertices: newVertices,
      },
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      ],
    );

    op.applyIndex(index);
    op.undoIndex(index);

    expect(
      vector.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z })),
    ).to.deep.equal([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]);
  });

  it("rejects undo before apply and double apply", () => {
    const { index, vector } = makeIndex();
    const op = VectorOps.AssignClass.fromParams(vector, {
      id: CLASS_PEDESTRIAN.id,
    });

    expect(() => op.undoIndex(index)).to.throw();
    op.applyIndex(index);
    expect(() => op.applyIndex(index)).to.throw();
  });
});

describe("vector stale-target operation policy (delete versus edit)", () => {
  it("rejects edits whose target vector was deleted before the op applied", () => {
    const { index, vector } = makeIndex();
    VectorOps.Delete.fromParams(vector).applyIndex(index);

    expect(() =>
      VectorOps.AssignClass.fromParams(vector, {
        id: CLASS_PEDESTRIAN.id,
      }).applyIndex(index),
    ).to.throw(StaleTargetError);
    expect(() =>
      VectorOps.EditVectorGeometry.fromParams(vector, "vertex", {
        type: "LineString",
        vertices: [{ x: 5, y: 6, z: 7 }],
      }).applyIndex(index),
    ).to.throw(StaleTargetError);
    // Deleting an already-deleted vector is likewise rejected, not applied twice.
    expect(() =>
      VectorOps.Delete.fromParams(vector).applyIndex(index),
    ).to.throw(StaleTargetError);
  });

  it("undo of a delete restores the vector under its id as a fresh instance", () => {
    const { index, vector } = makeIndex();
    const deletion = VectorOps.Delete.fromParams(vector);
    deletion.applyIndex(index);
    expect(index.hasLabelVector(vector.id)).to.equal(false);

    deletion.undoIndex(index);
    expect(index.hasLabelVector(vector.id)).to.equal(true);
    expect(index.getLabelVector(vector.id)).to.not.equal(vector);
    expect(index.getLabelVector(vector.id).gtClassId).to.equal(CLASS_CAR.id);
  });

  it("a placeholder-created vector survives delete + undo and edits of stale instances are rejected", () => {
    const { index } = makeIndex();
    const create = VectorOps.Create.fromParams({
      vectorType: "LineString",
      vertices: [new THREE.Vector3(2, 3, 4), new THREE.Vector3(5, 6, 7)],
      timestamp: null,
      gtClassId: CLASS_CAR.id,
    });
    create.applyIndex(index);
    const created = create.newVector;

    const deletion = VectorOps.Delete.fromParams(created);
    deletion.applyIndex(index);

    // A stale control holding the deleted instance cannot edit it.
    expect(() =>
      VectorOps.AssignClass.fromParams(created, {
        id: CLASS_PEDESTRIAN.id,
      }).applyIndex(index),
    ).to.throw(StaleTargetError);

    deletion.undoIndex(index);
    expect(index.hasLabelVector(created.id)).to.equal(true);
    expect(index.getLabelVector(created.id).gtClassId).to.equal(CLASS_CAR.id);
  });
});
