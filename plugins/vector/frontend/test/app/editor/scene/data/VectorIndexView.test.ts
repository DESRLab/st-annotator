import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import {
  EditableFrame,
  EditorConfig,
  FrameState,
  Placeholder,
  ProjectConfig,
  TaskState,
} from "sta/app/editor";
import type { EditorViews } from "sta/app/editor";
import { Timestamp } from "sta/common";

import {
  BaseVectorIndex,
  VectorIndexView,
} from "../../../../../app/editor/scene/data/VectorIndex";

/** A frame stub that accepts every vector. */
const frame = {
  containsPoint: () => true,
  containsTimestamp: () => true,
} as never;

function makeView() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseVectorIndex(config, {});
  const view = new VectorIndexView(index, [frame]);

  return { index, view };
}

describe("VectorIndexView", () => {
  it("shows timeless labels across dated frames while preserving spatial and dated filtering", () => {
    const { index } = makeView();
    const add = (
      id: string,
      x: number,
      timestamp: Timestamp | null,
      vectorType: "Point" | "LineString" | "Polygon" = "Point",
    ) =>
      index.addLabelVector({
        id,
        timestamp,
        vectorType,
        vertices:
          vectorType === "Point"
            ? [new THREE.Vector3(x, 0, 0)]
            : [
                new THREE.Vector3(x, 0, 0),
                new THREE.Vector3(x + 0.1, 0, 0),
                new THREE.Vector3(x, 0.1, 0),
              ],
      });
    add("static-point", 0, null);
    add("static-line", 0, null, "LineString");
    add("static-polygon", 0, null, "Polygon");
    add("outside-space", 10, null);
    add("dated", 0, new Timestamp(10_000));
    const expected = ["static-point", "static-line", "static-polygon"];
    for (const time of [10_000, 20_000]) {
      const boundedFrame = new EditableFrame(
        {} as EditorViews,
        FrameState.fromJSON({
          id: time,
          task: TaskState.fromJSON({ id: 1, project_id: 1, name: "task" }),
          account_id: 1,
          source_group_id: 2,
          label_branch_id: 3,
          work_type: "annotate",
          min_x: -1,
          min_y: -1,
          min_z: -1,
          max_x: 1,
          max_y: 1,
          max_z: 1,
          min_timestamp: new Date(time).toISOString(),
          max_timestamp: new Date(time).toISOString(),
        }),
      );
      const filtered = new VectorIndexView(index, [boundedFrame]);
      expect(
        [...filtered.iterLabelVectors()].map((label) => label.id),
      ).to.deep.equal(time === 10_000 ? [...expected, "dated"] : expected);
      filtered.dispose();
    }
  });

  it("reconciles a bulk-loaded vector when its placeholder resolves", async () => {
    const { index, view } = makeView();
    const placeholder = new Placeholder<string>();
    const localVector = index.addLabelVector({
      id: placeholder,
      vectorType: "Point",
      vertices: [new THREE.Vector3(1, 2, 3)],
    } as never);
    const resolved: unknown[] = [];
    view.addEventListener("vector-resolveId", (event) =>
      resolved.push(event.obj),
    );

    index.addBulk({
      vectors: [
        {
          id: "server-vector",
          vectorType: "Point",
          vertices: [new THREE.Vector3(1, 2, 3)],
        } as never,
      ],
    });
    expect(index.numLabelVectors).to.equal(2);

    placeholder.put("server-vector");
    await Promise.resolve();

    expect(index.numLabelVectors).to.equal(1);
    expect(index.getLabelVector(placeholder)).to.equal(localVector);
    expect(index.getLabelVector("server-vector")).to.equal(localVector);
    expect(resolved).to.deep.equal([localVector]);

    index.updateLabelVector(localVector, {
      vertices: [new THREE.Vector3(4, 5, 6)],
    });
    expect(index.getLabelVector("server-vector").vertices[0]).to.deep.equal(
      new THREE.Vector3(4, 5, 6),
    );
    index.deleteLabelVector(localVector);
    expect(index.hasLabelVector("server-vector")).to.equal(false);
  });

  it("renders transient vector color without publishing a label update", () => {
    const { index } = makeView();
    const vector = index.addLabelVector({
      id: "display-vector",
      vectorType: "Point",
      vertices: [new THREE.Vector3(0, 0, 0)],
    } as never);
    const updates: string[] = [];
    index.addEventListener("vector-update", () => updates.push("vector"));

    vector.setDisplayColor(new THREE.Color("blue"));

    const colors: string[] = [];
    vector.asObject3D().traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material & {
        color?: THREE.Color;
      };
      if (material?.color != null) colors.push(material.color.getHexString());
    });
    expect(updates).to.deep.equal([]);
    expect(vector.showColor?.getHexString()).to.equal("0000ff");
    expect(colors).to.include("0000ff");
  });

  describe("wrapped event forwarding", () => {
    it("forwards vector-delete events for vectors shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("vector-add", () => events.push("vector-add"));
      view.addEventListener("vector-delete", () =>
        events.push("vector-delete"),
      );

      const vector = index.addLabelVector({
        id: "test-vector",
        vectorType: "Point",
        vertices: [new THREE.Vector3(0, 0, 0)],
      } as never);
      index.deleteLabelVector(vector);

      expect(events).to.deep.equal(["vector-add", "vector-delete"]);
    });

    it("forwards class-delete events for classes shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("class-add", () => events.push("class-add"));
      view.addEventListener("class-delete", () => events.push("class-delete"));

      const labelClass = index.addLabelClass({
        id: 1,
        name: "test-class",
        vectorColor: new THREE.Color("red"),
      });
      index.deleteLabelClass(labelClass);

      expect(events).to.deep.equal(["class-add", "class-delete"]);
    });
  });
});
