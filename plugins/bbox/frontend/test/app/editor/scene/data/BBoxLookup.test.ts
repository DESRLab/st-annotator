import { describe, expect, it } from "vitest";

import {
  BBoxLabelData,
  BBoxReceiver,
} from "../../../../../app/editor/scene/data/BBoxLookup";

/**
 * The wire shape returned by `POST /editor/label/data/bulk` for the bbox
 * plugin. The reduced `*BulkPublic` models carry the persisted class
 * assignments as scalar ids, and the editor must reload a classified frame with
 * those classes intact.
 */
const WIRE_PAYLOAD = {
  frame_id: 1,
  branch_id: 2,
  head_hash: "head",
  tracks: [{ id: "t1", is_black: false, gt_class_id: 7 }],
  boxes: [
    {
      id: "b1",
      entity_id: "t1",
      timestamp: "2026-08-15T12:00:00Z",
      type: "cuboid",
      center: { x: 1, y: 2, z: 3 },
      angle: 0,
      size: { x: 4, y: 5, z: 6 },
      perceived_class_id: 9,
    },
  ],
};

const CLASS_SELECTION = {
  id: 1,
  name: "bbox",
  description: "",
  groups: [{ id: 1, name: "labels", description: "" }],
  objclasses: [
    {
      id: 7,
      name: "car",
      description: "",
      color_rgb: 0xff0000,
      is_deleted: false,
      default_size_x: 1,
      default_size_y: 2,
      default_size_z: 3,
    },
    {
      id: 9,
      name: "truck",
      description: "",
      color_rgb: 0x00ff00,
      is_deleted: false,
      default_size_x: 1,
      default_size_y: 2,
      default_size_z: 3,
    },
  ],
};

function makeReceiver(payload: unknown): BBoxReceiver {
  const views = {
    getClassSelectionForBranch: async () => CLASS_SELECTION,
    bulkGetLabelData: async () =>
      new Response(JSON.stringify([payload]), {
        headers: { "content-type": "application/json" },
      }),
  };

  return new BBoxReceiver({} as never, views as never);
}

describe("BBoxReceiver bulk payload round-trip", () => {
  it("parses the scalar class ids out of the compact bulk payload", () => {
    const data = BBoxLabelData.fromJSON(WIRE_PAYLOAD);

    expect(data.tracks[0].gt_class_id).to.equal(7);
    expect(data.boxes[0].perceived_class_id).to.equal(9);
  });

  it("keeps a saved class assignment non-null when loading a frame", async () => {
    const receiver = makeReceiver(WIRE_PAYLOAD);
    const [data] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);

    expect(data.tracks[0].gtClassId).not.to.equal(null);
    expect(data.tracks[0].gtClassId).to.equal(7);
    expect(data.boxes[0].perceivedClassId).not.to.equal(null);
    expect(data.boxes[0].perceivedClassId).to.equal(9);
  });

  it("loads an explicitly unclassified label as null", async () => {
    const receiver = makeReceiver({
      ...WIRE_PAYLOAD,
      tracks: [{ id: "t1", is_black: false, gt_class_id: null }],
      boxes: [{ ...WIRE_PAYLOAD.boxes[0], perceived_class_id: null }],
    });
    const [data] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);

    expect(data.tracks[0].gtClassId).to.equal(null);
    expect(data.boxes[0].perceivedClassId).to.equal(null);
  });
});
