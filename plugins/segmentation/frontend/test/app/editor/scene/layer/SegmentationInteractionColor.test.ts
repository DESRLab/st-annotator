import { describe, expect, it } from "vitest";

import {
  getSegmentationInteractionColor,
  getSelectionDisplayOpacity,
} from "../../../../../app/editor/scene/layer/SegmentationLayer";

describe("segmentation interaction color", () => {
  it("uses configured opacity only while transparency is enabled", () => {
    expect(getSelectionDisplayOpacity(true, 0)).toBe(0);
    expect(getSelectionDisplayOpacity(true, 0.5)).toBe(0.5);
    expect(getSelectionDisplayOpacity(false, 0)).toBe(1);
  });

  it("prioritizes selection over hover and restores the default color otherwise", () => {
    const selection = {} as never;
    const other = {} as never;
    const selected = { r: 0, g: 0.25, b: 1 };
    const hovered = { r: 1, g: 0.5, b: 0 };

    expect(
      getSegmentationInteractionColor(
        selection,
        selection,
        selection,
        selected,
        hovered,
      )?.toArray(),
    ).toEqual([0, 0.25, 1]);
    expect(
      getSegmentationInteractionColor(
        selection,
        other,
        selection,
        selected,
        hovered,
      )?.toArray(),
    ).toEqual([1, 0.5, 0]);
    expect(
      getSegmentationInteractionColor(
        selection,
        other,
        other,
        selected,
        hovered,
      ),
    ).toBeNull();
  });
});
