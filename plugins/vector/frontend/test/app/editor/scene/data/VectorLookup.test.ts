import { describe, expect, it } from "vitest";

import {
  VectorLabelData,
  VectorReceiver,
} from "../../../../../app/editor/scene/data/VectorLookup";

/**
 * The wire shape returned by `POST /editor/label/data/bulk` for the vector
 * plugin. The reduced `LabelVectorBulkPublic` model carries the persisted class
 * assignment as a scalar id, and the editor must reload a classified frame with
 * that class intact.
 */
const WIRE_PAYLOAD = {
  frame_id: 1,
  branch_id: 2,
  head_hash: "head",
  vectors: [
    {
      id: "v1",
      timestamp: "2026-08-15T12:00:00Z",
      type: "Point",
      vertices: [{ x: 1, y: 2, z: 3 }],
      gt_class_id: 7,
    },
  ],
};

const CLASS_SELECTION = {
  id: 1,
  name: "vector",
  description: "",
  groups: [{ id: 1, name: "labels", description: "" }],
  objclasses: [
    {
      id: 7,
      name: "car",
      description: "",
      color_rgb: 0xff0000,
      is_deleted: false,
    },
  ],
};

function makeReceiver(payload: unknown): VectorReceiver {
  const views = {
    getClassSelectionForBranch: async () => CLASS_SELECTION,
    bulkGetLabelData: async () =>
      new Response(JSON.stringify([payload]), {
        headers: { "content-type": "application/json" },
      }),
  };

  return new VectorReceiver({} as never, views as never);
}

describe("VectorReceiver bulk payload round-trip", () => {
  it("parses the scalar class id out of the compact bulk payload", () => {
    const data = VectorLabelData.fromJSON(WIRE_PAYLOAD);

    expect(data.vectors[0].gt_class_id).to.equal(7);
  });

  it("keeps a saved class assignment non-null when loading a frame", async () => {
    const receiver = makeReceiver(WIRE_PAYLOAD);
    const [data] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);

    expect(data.vectors[0].gtClassId).not.to.equal(null);
    expect(data.vectors[0].gtClassId).to.equal(7);
  });

  it("loads an explicitly unclassified label as null", async () => {
    const receiver = makeReceiver({
      ...WIRE_PAYLOAD,
      vectors: [{ ...WIRE_PAYLOAD.vectors[0], gt_class_id: null }],
    });
    const [data] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);

    expect(data.vectors[0].gtClassId).to.equal(null);
  });
});
