import { describe, expect, it } from "vitest";

import {
  SegmentationLabelData,
  SegmentationReceiver,
} from "../../../../../app/editor/scene/data/SegmentationLookup";

/**
 * The wire shape returned by `POST /editor/label/data/bulk` for the
 * segmentation plugin. The reduced `*BulkPublic` models carry the persisted
 * class assignments as scalar ids, and the editor must reload a classified
 * frame with those classes intact.
 */
const WIRE_PAYLOAD = {
  frame_id: 1,
  branch_id: 2,
  head_hash: "head",
  instances: [{ id: "i1", is_black: false, gt_class_id: 7 }],
  selections: [
    {
      id: "s1",
      entity_id: "i1",
      timestamp: "2026-08-15T12:00:00Z",
      points: [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, z: 6 },
      ],
      perceived_class_id: 9,
    },
  ],
};

const CLASS_SELECTION = {
  id: 1,
  name: "segmentation",
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
    {
      id: 9,
      name: "truck",
      description: "",
      color_rgb: 0x00ff00,
      is_deleted: false,
    },
  ],
};

function makeReceiver(payload: unknown): SegmentationReceiver {
  const views = {
    getClassSelectionForBranch: async () => CLASS_SELECTION,
    bulkGetLabelData: async () =>
      new Response(JSON.stringify([payload]), {
        headers: { "content-type": "application/json" },
      }),
  };

  return new SegmentationReceiver({} as never, views as never);
}

describe("SegmentationReceiver bulk payload round-trip", () => {
  it("parses the scalar class ids out of the compact bulk payload", () => {
    const data = SegmentationLabelData.fromJSON(WIRE_PAYLOAD);

    expect(data.instances[0].gt_class_id).to.equal(7);
    expect(data.selections[0].perceived_class_id).to.equal(9);
  });

  it("keeps a saved class assignment non-null when loading a frame", async () => {
    const receiver = makeReceiver(WIRE_PAYLOAD);
    const [data] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);

    expect(data.instances[0].gtClassId).not.to.equal(null);
    expect(data.instances[0].gtClassId).to.equal(7);
    expect(data.selections[0].perceivedClassId).not.to.equal(null);
    expect(data.selections[0].perceivedClassId).to.equal(9);
  });

  it("loads an explicitly unclassified label as null", async () => {
    const receiver = makeReceiver({
      ...WIRE_PAYLOAD,
      instances: [{ id: "i1", is_black: false, gt_class_id: null }],
      selections: [{ ...WIRE_PAYLOAD.selections[0], perceived_class_id: null }],
    });
    const [data] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);

    expect(data.instances[0].gtClassId).to.equal(null);
    expect(data.selections[0].perceivedClassId).to.equal(null);
  });

  it("rejects a null frame instance list at the wire boundary", () => {
    expect(() =>
      SegmentationLabelData.fromJSON({ ...WIRE_PAYLOAD, instances: null }),
    ).to.throw();
  });

  it("uses the shared class selection across frames and branch heads", async () => {
    const requests: object[] = [];
    const payloads = [
      WIRE_PAYLOAD,
      { ...WIRE_PAYLOAD, frame_id: 2 },
      {
        ...WIRE_PAYLOAD,
        frame_id: 3,
        head_hash: "next-head",
      },
    ];
    const views = {
      getClassSelectionForBranch: async () => CLASS_SELECTION,
      bulkGetLabelData: async (
        _key: string,
        _frameIds: number[],
        otherArgs: object,
      ) => {
        requests.push(otherArgs);
        return new Response(JSON.stringify([payloads.shift()]));
      },
    };
    const receiver = new SegmentationReceiver({} as never, views as never);

    const [first] = await receiver.bulkGetDataNoCache([{ id: 1 } as never]);
    const [second] = await receiver.bulkGetDataNoCache([{ id: 2 } as never]);
    const [third] = await receiver.bulkGetDataNoCache([{ id: 3 } as never]);

    expect(first.classes[0].name).to.equal("car");
    expect(second.classes[0].name).to.equal("car");
    expect(second.instances[0].id).to.equal("i1");
    expect(third.classes[0].name).to.equal("car");
    expect(requests[1]).to.deep.equal({});
    expect(requests[2]).to.deep.equal({});
  });
});
