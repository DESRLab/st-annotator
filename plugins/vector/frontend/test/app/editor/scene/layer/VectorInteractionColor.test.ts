import { describe, expect, it } from "vitest";

import { getVectorInteractionColor } from "../../../../../app/editor/scene/layer/VectorLayer";

describe("vector interaction color", () => {
  it("prioritizes selection over hover and restores the default color otherwise", () => {
    const vector = {} as never;
    const other = {} as never;
    const selected = { r: 0, g: 0.25, b: 1 };
    const hovered = { r: 1, g: 0.5, b: 0 };

    expect(
      getVectorInteractionColor(
        vector,
        vector,
        vector,
        selected,
        hovered,
      )?.toArray(),
    ).toEqual([0, 0.25, 1]);
    expect(
      getVectorInteractionColor(
        vector,
        other,
        vector,
        selected,
        hovered,
      )?.toArray(),
    ).toEqual([1, 0.5, 0]);
    expect(
      getVectorInteractionColor(vector, other, other, selected, hovered),
    ).toBeNull();
  });
});
