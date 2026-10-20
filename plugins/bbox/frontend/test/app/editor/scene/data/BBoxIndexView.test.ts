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
import { OptionalVector3, Timestamp } from "sta/common";

import {
  BaseBBoxIndex,
  BBoxIndexView,
} from "../../../../../app/editor/scene/data/BBoxIndex";

/** A frame stub that accepts every label. */
const frame = {
  containsPoint: () => true,
  containsTimestamp: () => true,
} as never;

function makeView() {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 1 }),
  );
  const index = new BaseBBoxIndex(config, {});
  const view = new BBoxIndexView(index, [frame]);

  return { index, view };
}

describe("BBoxIndexView", () => {
  it("shows timeless labels across dated frames while preserving spatial and dated filtering", () => {
    const { index } = makeView();
    const add = (id: string, x: number, timestamp: Timestamp | null) =>
      index.addLabelBox({
        id,
        timestamp,
        boxType: "cuboid",
        center: new THREE.Vector3(x, 0, 0),
        angle: 0,
        size: new THREE.Vector3(0.1, 0.1, 0.1),
      });
    add("static", 0, null);
    add("outside-space", 10, null);
    add("dated", 0, new Timestamp(10_000));
    const expected = ["static"];
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
      const filtered = new BBoxIndexView(index, [boundedFrame]);
      expect(
        [...filtered.iterLabelBoxes()].map((label) => label.id),
      ).to.deep.equal(time === 10_000 ? [...expected, "dated"] : expected);
      filtered.dispose();
    }
  });

  it("reconciles bulk-loaded tracks and boxes when placeholders resolve", async () => {
    const { index, view } = makeView();
    const trackId = new Placeholder<string>();
    const boxId = new Placeholder<string>();
    const localTrack = index.addLabelTrack({ id: trackId });
    const boxParams = {
      entityId: trackId,
      boxType: "cuboid",
      center: new THREE.Vector3(0, 0, 0),
      angle: 0,
      size: new THREE.Vector3(1, 1, 1),
      timestamp: null,
    } as const;
    const localBox = index.addLabelBox({ id: boxId, ...boxParams });
    const resolved: string[] = [];
    view.addEventListener("track-resolveId", () => resolved.push("track"));
    view.addEventListener("box-resolveId", () => resolved.push("box"));

    index.addBulk({
      tracks: [{ id: "server-track" }],
      boxes: [
        {
          id: "server-box",
          ...boxParams,
          entityId: "server-track",
        },
      ],
    });
    expect(index.numLabelTracks).to.equal(2);
    expect(index.numLabelBoxes).to.equal(2);

    trackId.put("server-track");
    boxId.put("server-box");
    await Promise.resolve();

    expect(index.numLabelTracks).to.equal(1);
    expect(index.numLabelBoxes).to.equal(1);
    expect(index.getLabelTrack("server-track")).to.equal(localTrack);
    expect(index.getLabelBox("server-box")).to.equal(localBox);
    expect([...index.getLabelTrackElements("server-track")]).to.deep.equal([
      localBox,
    ]);
    expect(resolved).to.deep.equal(["track", "box"]);

    index.updateLabelBox(localBox, { center: new THREE.Vector3(4, 5, 6) });
    expect(index.getLabelBox("server-box").center).to.deep.equal(
      new THREE.Vector3(4, 5, 6),
    );
    index.deleteLabelBox(localBox);
    index.deleteLabelTrack(localTrack);
    expect(index.hasLabelBox("server-box")).to.equal(false);
    expect(index.hasLabelTrack("server-track")).to.equal(false);
  });

  it("renders transient box and track options without publishing label updates", () => {
    const { index } = makeView();
    const track = index.addLabelTrack({ id: "display-track" });
    const firstTimestamp = new Timestamp("2026-08-15T12:00:00Z");
    const secondTimestamp = new Timestamp("2026-08-15T12:01:00Z");
    const addBox = (id: string, timestamp: Timestamp) =>
      index.addLabelBox({
        id,
        entityId: track.id,
        boxType: "cuboid",
        center: new THREE.Vector3(0, 0, 0),
        angle: 0,
        size: new THREE.Vector3(1, 1, 1),
        timestamp,
      } as never);
    const box = addBox("display-box", firstTimestamp);
    addBox("later-box", secondTimestamp);
    const updates: string[] = [];
    index.addEventListener("box-update", () => updates.push("box"));
    index.addEventListener("track-update", () => updates.push("track"));

    expect(
      (
        track.asObject3D() as THREE.Line<THREE.BufferGeometry>
      ).geometry.getAttribute("position").count,
    ).to.equal(2);
    track.setDisplayRange(firstTimestamp, firstTimestamp);
    box.setDisplayOptions({
      opacity: 0.65,
      showForwardIndicator: false,
      showFrame: false,
      showPerceivedClass: false,
      showColor: new THREE.Color("blue"),
    });

    expect(updates).to.deep.equal([]);
    expect(
      (
        track.asObject3D() as THREE.Line<THREE.BufferGeometry>
      ).geometry.getAttribute("position").count,
    ).to.equal(1);
    expect(box.opacity).to.equal(0.65);
    expect(box.showForwardIndicator).to.equal(false);
    expect(box.showFrame).to.equal(false);
    expect(box.showColor?.getHexString()).to.equal("0000ff");
    const renderedMaterials: (THREE.Material & {
      color?: THREE.Color;
      opacity?: number;
    })[] = [];
    box.asObject3D().traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (material != null && !Array.isArray(material))
        renderedMaterials.push(material);
    });
    expect(
      renderedMaterials.some(
        (material) => material.color?.getHexString() === "0000ff",
      ),
    ).to.equal(true);
    expect(
      renderedMaterials.some((material) => material.opacity === 0.65),
    ).to.equal(true);
  });

  describe("wrapped event forwarding", () => {
    it("forwards box-delete events for boxes shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("box-add", () => events.push("box-add"));
      view.addEventListener("box-delete", () => events.push("box-delete"));

      const box = index.addLabelBox({
        id: "test-box",
        entityId: null,
        boxType: "cuboid",
        center: new THREE.Vector3(0, 0, 0),
        angle: 0,
        size: new THREE.Vector3(1, 1, 1),
        timestamp: null,
        qualityRank: null,
        distinctiveLv: null,
        occlusionLv: null,
        perceivedClassId: null,
      } as never);
      index.deleteLabelBox(box);

      expect(events).to.deep.equal(["box-add", "box-delete"]);
    });

    it("forwards track-delete events for tracks shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("track-add", () => events.push("track-add"));
      view.addEventListener("track-delete", () => events.push("track-delete"));

      const track = index.addLabelTrack({ id: "test-track" });
      index.deleteLabelTrack(track);

      expect(events).to.deep.equal(["track-add", "track-delete"]);
    });

    it("forwards class-delete events for classes shown in the view", () => {
      const { index, view } = makeView();

      const events: string[] = [];
      view.addEventListener("class-add", () => events.push("class-add"));
      view.addEventListener("class-delete", () => events.push("class-delete"));

      const labelClass = index.addLabelClass({
        id: 1,
        name: "test-class",
        boxColor: new THREE.Color("red"),
        defaultSizeDatabase: new OptionalVector3(1, 1, 1),
      });
      index.deleteLabelClass(labelClass);

      expect(events).to.deep.equal(["class-add", "class-delete"]);
    });
  });
});
