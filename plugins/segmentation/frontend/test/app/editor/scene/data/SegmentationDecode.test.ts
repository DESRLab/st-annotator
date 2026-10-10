import { describe, expect, it } from "vitest";

import {
  decodeSegmentationPayload,
  decodeSegmentationResponse,
} from "../../../../../app/editor/scene/data/SegmentationDecode";
import { Selection } from "../../../../../app/editor/scene/data/views/Selection";
import * as THREE from "three";

describe("decodeSegmentationPayload", () => {
  it("packs flattened numeric coordinates into a typed array", () => {
    const input = new TextEncoder().encode(
      JSON.stringify({ selections: [{ points: [1.25, 2, -3.5, 4, 5, 6] }] }),
    );

    const payload = decodeSegmentationPayload(input.buffer) as {
      selections: { points: Float32Array }[];
    };

    expect([...payload.selections[0].points]).toEqual([1.25, 2, -3.5, 4, 5, 6]);
  });

  it("rejects a truncated flattened coordinate array", () => {
    const input = new TextEncoder().encode(
      JSON.stringify({ selections: [{ points: [1, 2] }] }),
    );

    expect(() => decodeSegmentationPayload(input.buffer)).toThrow(
      "coordinate count is not divisible by three",
    );
  });

  it("rejects non-finite coordinates", () => {
    const input = new TextEncoder().encode(
      JSON.stringify({ selections: [{ points: [1, 2, "not-a-number"] }] }),
    );

    expect(() => decodeSegmentationPayload(input.buffer)).toThrow(
      "non-finite coordinate",
    );
  });

  it("rejects a malformed points field", () => {
    const input = new TextEncoder().encode(
      JSON.stringify({ selections: [{ points: "bad" }] }),
    );
    expect(() => decodeSegmentationPayload(input.buffer)).toThrow(
      "points must be an array",
    );
  });

  it("parses JSON and packs dense coordinates into a flat typed array", () => {
    const input = new TextEncoder().encode(
      JSON.stringify({
        instances: [],
        selections: [
          {
            frame_id: 1,
            branch_id: 2,
            head_hash: "head",
            id: "selection-a",
            points: [
              { x: "1.25", y: 2, z: "-3.5" },
              { x: 4, y: 5, z: 6 },
            ],
          },
        ],
      }),
    );

    const payload = decodeSegmentationPayload(input.buffer) as {
      selections: { points: Float32Array }[];
    };

    expect(payload.selections[0].points).toBeInstanceOf(Float32Array);
    expect([...payload.selections[0].points]).toEqual([1.25, 2, -3.5, 4, 5, 6]);
  });
});

describe("decodeSegmentationResponse", () => {
  it("rejects without decoding when the load was already superseded", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = new TextEncoder().encode(
      JSON.stringify({ selections: [{ points: [1, 2, "not-a-number"] }] }),
    );

    await expect(
      decodeSegmentationResponse(input.buffer, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("decodes on the calling thread when the load is live", async () => {
    const input = new TextEncoder().encode(
      JSON.stringify({ selections: [{ points: [1.25, 2, -3.5] }] }),
    );

    const payload = (await decodeSegmentationResponse(
      input.buffer,
      new AbortController().signal,
    )) as { selections: { points: Float32Array }[] };

    expect([...payload.selections[0].points]).toEqual([1.25, 2, -3.5]);
  });
});

describe("Selection packed point storage", () => {
  it("uses a packed array directly as its geometry position attribute", () => {
    const points = new Float32Array([1, 2, 3, 4, 5, 6]);
    const selection = new Selection({
      pointsCoords: points,
      pointSize: 1,
      color: new THREE.Color("red"),
    });
    const renderedPoints = selection.asObject3D()
      .children[1] as THREE.Points<THREE.BufferGeometry>;
    const position = renderedPoints.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(position.array).toBe(points);
    expect(position.count).toBe(2);
    expect(selection.centerPoint.toArray()).toEqual([2.5, 3.5, 4.5]);
  });
});
