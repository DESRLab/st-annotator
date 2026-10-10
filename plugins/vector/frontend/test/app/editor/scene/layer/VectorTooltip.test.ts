import { describe, expect, it } from "vitest";

import { getVectorTooltipContent } from "../../../../../app/editor/scene/layer/VectorTooltip";
import type { VectorTooltipContentInput } from "../../../../../app/editor/scene/layer/VectorTooltip";

const VECTOR_ID = "00000000-0000-0000-0000-000000000001";

function createInput(
  overrides: Partial<VectorTooltipContentInput> = {},
): VectorTooltipContentInput {
  return {
    vectorId: VECTOR_ID,
    displayClassName: "Car",
    showTooltips: true,
    showVectorId: true,
    ...overrides,
  };
}

describe("getVectorTooltipContent", () => {
  it("formats the vector id and class line", () => {
    const content = getVectorTooltipContent(createInput());

    expect(content.className).toBe("vector-tooltip");
    expect(content.visible).toBe(true);
    // ShortUUID shows the last 6 characters of the id.
    expect(content.lines).toEqual(["P{000001}", "[Car]"]);
  });

  it("omits the id line when the id display is disabled or the id is missing", () => {
    const hidden = getVectorTooltipContent(
      createInput({ showVectorId: false }),
    );
    expect(hidden.lines).toEqual(["[Car]"]);

    const noId = getVectorTooltipContent(createInput({ vectorId: null }));
    expect(noId.lines).toEqual(["[Car]"]);
  });

  it("formats the class line for unclassified vectors", () => {
    const content = getVectorTooltipContent(
      createInput({ displayClassName: null }),
    );

    expect(content.lines).toEqual(["P{000001}", "<Unclassified>"]);
  });

  it("hides the tooltip when the tooltips setting is off", () => {
    expect(
      getVectorTooltipContent(createInput({ showTooltips: false })).visible,
    ).toBe(false);
  });
});
