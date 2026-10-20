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

it("uses hover color for external highlights while keeping selection priority", () => {
  const element = {} as never;
  const selected = { r: 0, g: 0, b: 1 };
  const hovered = { r: 1, g: 0, b: 0 };
  expect(
    getVectorInteractionColor(
      element,
      null,
      null,
      selected,
      hovered,
      true,
    )?.toArray(),
  ).toEqual([1, 0, 0]);
  expect(
    getVectorInteractionColor(
      element,
      element,
      null,
      selected,
      hovered,
      true,
    )?.toArray(),
  ).toEqual([0, 0, 1]);
});

it("uses the explicit drawing color even for a selected endpoint", () => {
  const element = {} as never;
  expect(
    getVectorInteractionColor(
      element,
      element,
      null,
      { r: 0, g: 0, b: 1 },
      { r: 1, g: 0, b: 0 },
      true,
      { r: 1, g: 1, b: 0 },
    )?.toArray(),
  ).toEqual([1, 1, 0]);
});
