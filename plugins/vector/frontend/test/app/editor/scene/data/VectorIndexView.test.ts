import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, Placeholder, ProjectConfig } from "sta/app/editor";

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
