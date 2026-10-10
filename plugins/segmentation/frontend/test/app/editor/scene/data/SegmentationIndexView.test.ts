import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { EditorConfig, Placeholder, ProjectConfig } from "sta/app/editor";
import { Timestamp } from "sta/common";

import {
  BaseSegmentationIndex,
  SegmentationIndexView,
} from "../../../../../app/editor/scene/data/SegmentationIndex";

/** A frame stub that accepts every label. */
const frame = {
  containsPoint: () => true,
  containsTimestamp: () => true,
} as never;

function makeView(frames = [frame]) {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseSegmentationIndex(config, {});
  const view = new SegmentationIndexView(index, frames);

  return { index, view };
}

describe("SegmentationIndexView", () => {
  it("reconciles a server-loaded instance and its selection relationships", async () => {
    const { index, view } = makeView();
    const instanceId = new Placeholder<string>();
    const localInstance = index.addLabelInstance({ id: instanceId });
    const localSelection = index.addLabelSelection({
      id: "local-selection",
      entityId: instanceId,
      points: [new THREE.Vector3(0, 0, 0)],
    });
    const resolved: unknown[] = [];
    view.addEventListener("instance-resolveId", (event) =>
      resolved.push(event.obj),
    );

    index.addBulk({
      instances: [{ id: "server-instance" }],
      selections: [
        {
          id: "server-selection",
          entityId: "server-instance",
          points: [new THREE.Vector3(1, 1, 1)],
        },
      ],
    });
    expect(index.numLabelInstances).to.equal(2);

    instanceId.put("server-instance");
    await Promise.resolve();

    expect(index.numLabelInstances).to.equal(1);
    expect(index.getLabelInstance("server-instance")).to.equal(localInstance);
    expect([
      ...index.getLabelInstanceElements("server-instance"),
    ]).to.have.members([
      localSelection,
      index.getLabelSelection("server-selection"),
    ]);
    expect(resolved).to.deep.equal([localInstance]);
  });

  it("reconciles a server bulk load that wins the race with placeholder resolution", async () => {
    const { index, view } = makeView();
    index.addLabelInstance({ id: "instance" });
    const placeholder = new Placeholder<string>();
    const localSelection = index.addLabelSelection({
      id: placeholder,
      entityId: "instance",
      points: [new THREE.Vector3(1, 2, 3)],
    });
    const resolvedEvents: unknown[] = [];
    view.addEventListener("selection-resolveId", (event) =>
      resolvedEvents.push(event.obj),
    );

    // The background request observes the committed row before the create
    // response reaches the client and resolves the operation placeholder.
    index.addBulk({
      selections: [
        {
          id: "server-selection",
          entityId: "instance",
          points: [new THREE.Vector3(1, 2, 3)],
        },
      ],
    });
    expect(index.numLabelSelections).to.equal(2);

    placeholder.put("server-selection");
    await Promise.resolve();

    expect(index.numLabelSelections).to.equal(1);
    expect(index.getLabelSelection(placeholder)).to.equal(localSelection);
    expect(index.getLabelSelection("server-selection")).to.equal(
      localSelection,
    );
    expect([...index.getLabelInstanceElements("instance")]).to.deep.equal([
      localSelection,
    ]);
    expect(resolvedEvents).to.deep.equal([localSelection]);

    // The reconciled object remains the live mutation target.
    index.updateLabelSelection(localSelection, {
      points: [new THREE.Vector3(4, 5, 6)],
    });
    expect(index.getLabelSelection("server-selection").points[0]).to.deep.equal(
      new THREE.Vector3(4, 5, 6),
    );
    index.deleteLabelSelection(localSelection);
    expect(index.hasLabelSelection("server-selection")).to.equal(false);
    expect([...view.iterLabelInstanceIdsWithElements()]).to.deep.equal([]);
  });

  it("does not publish label-data events for transient display updates", () => {
    const { index } = makeView();
    const instance = index.addLabelInstance({ id: "display-instance" });
    const selection = index.addLabelSelection({
      id: "display-selection",
      entityId: instance.id,
      points: [new THREE.Vector3(0, 0, 0)],
    });
    const updates: string[] = [];
    index.addEventListener("instance-update", () => updates.push("instance"));
    index.addEventListener("selection-update", () => updates.push("selection"));
    const minTimestamp = new Timestamp("2026-08-15T12:00:00Z");
    const maxTimestamp = new Timestamp("2026-08-15T12:01:00Z");

    instance.setDisplayRange(minTimestamp, maxTimestamp);
    selection.setDisplayOptions({
      showPointSize: 2,
      showColor: new THREE.Color("blue"),
      showCenter: true,
      showPerceivedClass: false,
    });

    expect(updates).to.deep.equal([]);
    expect(instance.minTimestamp).to.equal(minTimestamp);
    expect(instance.maxTimestamp).to.equal(maxTimestamp);
    expect(selection.showPointSize).to.equal(2);
    expect(selection.showCenter).to.equal(true);
    expect(selection.showPerceivedClass).to.equal(false);
    expect(selection.showColor?.getHexString()).to.equal("0000ff");
  });

  it("precomputes instance IDs referenced by visible selections and keeps them current", () => {
    const { index, view } = makeView();
    index.addLabelInstance({ id: "first-instance" });
    index.addLabelInstance({ id: "second-instance" });
    const first = index.addLabelSelection({
      id: "first-selection",
      entityId: "first-instance",
      points: [new THREE.Vector3(0, 0, 0)],
    });
    index.addLabelSelection({
      id: "same-instance-selection",
      entityId: "first-instance",
      points: [new THREE.Vector3(0, 0, 0)],
    });

    expect([...view.iterLabelInstanceIdsWithElements()]).to.deep.equal([
      "first-instance",
    ]);

    index.updateLabelSelection(first, { entityId: "second-instance" });
    expect([...view.iterLabelInstanceIdsWithElements()]).to.have.members([
      "first-instance",
      "second-instance",
    ]);

    index.deleteLabelSelection(
      index.getLabelSelection("same-instance-selection"),
    );
    expect([...view.iterLabelInstanceIdsWithElements()]).to.deep.equal([
      "second-instance",
    ]);
  });

  it("excludes instance IDs referenced only outside the frame window", () => {
    const rangedFrame = {
      containsPoint: (point: THREE.Vector3) => point.x >= 0,
      containsTimestamp: () => true,
    } as never;
    const { index, view } = makeView([rangedFrame]);
    index.addLabelInstance({ id: "visible-instance" });
    index.addLabelInstance({ id: "hidden-instance" });
    const visible = index.addLabelSelection({
      id: "visible-selection",
      entityId: "visible-instance",
      points: [new THREE.Vector3(1, 0, 0)],
    });
    const hidden = index.addLabelSelection({
      id: "hidden-selection",
      entityId: "hidden-instance",
      points: [new THREE.Vector3(-1, 0, 0)],
    });

    expect([...view.iterLabelInstanceIdsWithElements()]).to.deep.equal([
      "visible-instance",
    ]);

    index.updateLabelSelection(visible, {
      points: [new THREE.Vector3(-1, 0, 0)],
    });
    index.updateLabelSelection(hidden, {
      points: [new THREE.Vector3(1, 0, 0)],
    });
    expect([...view.iterLabelInstanceIdsWithElements()]).to.deep.equal([
      "hidden-instance",
    ]);
  });

  it("filters selections by both the configured frame time range and spatial bounds", () => {
    const includedTimestamp = new Timestamp("2026-08-15T12:00:00Z");
    const rangedFrame = {
      containsPoint: (point: THREE.Vector3) => point.x >= 0,
      containsTimestamp: (timestamp: Timestamp | null) =>
        timestamp?.equals(includedTimestamp) ?? false,
    } as never;
    const { index, view } = makeView([rangedFrame]);
    const add = (id: string, pointX: number, timestamp: Timestamp) =>
      index.addLabelSelection({
        id,
        points: [new THREE.Vector3(pointX, 0, 0)],
        timestamp,
      });

    const visible = add("visible", 1, includedTimestamp);
    add("outside-space", -1, includedTimestamp);
    add("outside-time", 1, new Timestamp("2026-08-15T12:01:00Z"));

    expect(
      [...view.iterLabelSelections()].map((selection) => selection.id),
    ).to.deep.equal(["visible"]);
    expect(view.hasLabelSelection(visible.id)).to.equal(true);
    expect(view.hasLabelSelection("outside-space")).to.equal(false);
    expect(view.hasLabelSelection("outside-time")).to.equal(false);
  });

  describe("wrapped event forwarding", () => {
    it("forwards selection-delete events for selections shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("selection-add", () =>
        events.push("selection-add"),
      );
      view.addEventListener("selection-delete", () =>
        events.push("selection-delete"),
      );

      const selection = index.addLabelSelection({
        id: "test-selection",
        points: [new THREE.Vector3(0, 0, 0)],
        timestamp: null,
      });
      index.deleteLabelSelection(selection);

      expect(events).to.deep.equal(["selection-add", "selection-delete"]);
    });

    it("forwards instance-delete events for instances shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("instance-add", () => events.push("instance-add"));
      view.addEventListener("instance-delete", () =>
        events.push("instance-delete"),
      );

      const instance = index.addLabelInstance({ id: "test-instance" });
      index.deleteLabelInstance(instance);

      expect(events).to.deep.equal(["instance-add", "instance-delete"]);
    });
  });
});
