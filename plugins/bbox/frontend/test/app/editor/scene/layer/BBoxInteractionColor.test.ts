import { describe, expect, it } from "vitest";

import { getBBoxInteractionColor } from "../../../../../app/editor/scene/layer/BBoxLayer";

describe("bbox interaction color", () => {
  it("prioritizes selection over hover and restores the default color otherwise", () => {
    const box = {} as never;
    const other = {} as never;
    const selected = { r: 0, g: 0.25, b: 1 };
    const hovered = { r: 1, g: 0.5, b: 0 };

    expect(
      getBBoxInteractionColor(box, box, box, selected, hovered)?.toArray(),
    ).toEqual([0, 0.25, 1]);
    expect(
      getBBoxInteractionColor(box, other, box, selected, hovered)?.toArray(),
    ).toEqual([1, 0.5, 0]);
    expect(
      getBBoxInteractionColor(box, other, other, selected, hovered),
    ).toBeNull();
  });
});
