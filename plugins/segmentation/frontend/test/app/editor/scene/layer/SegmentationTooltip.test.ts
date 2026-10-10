import { describe, expect, it } from "vitest";

import { getSegmentationTooltipContent } from "../../../../../app/editor/scene/layer/SegmentationTooltip";
import type { SegmentationTooltipContentInput } from "../../../../../app/editor/scene/layer/SegmentationTooltip";

const INSTANCE_ID = "00000000-0000-0000-0000-0000000000a1";
const SELECTION_ID = "00000000-0000-0000-0000-000000000001";

function createInput(
  overrides: Partial<SegmentationTooltipContentInput> = {},
): SegmentationTooltipContentInput {
  return {
    selectionId: SELECTION_ID,
    instanceId: INSTANCE_ID,
    timestamp: null,
    currentTimestamp: null,
    isInCurrentFrame: false,
    displayClassName: "Car",
    occlusionName: "Excellent",
    distinctivenessName: "Satisfactory",
    showTooltips: true,
    showTrackSegId: true,
    showTimestampDiff: true,
    showOcclusion: true,
    showDistinctiveness: true,
    ...overrides,
  };
}

describe("getSegmentationTooltipContent", () => {
  it("formats the instance and selection ids with the settings display flags", () => {
    const content = getSegmentationTooltipContent(createInput());

    expect(content.className).toBe("selection-tooltip");
    expect(content.visible).toBe(true);
    // ShortUUID shows the last 6 characters of each id.
    expect(content.lines[0]).toBe("T{0000a1} | B{000001}");
  });

  it("omits the id line when the id display is disabled or both ids are missing", () => {
    const hidden = getSegmentationTooltipContent(
      createInput({ showTrackSegId: false }),
    );
    expect(
      hidden.lines.some((line) => line.includes("T{") || line.includes("B{")),
    ).toBe(false);

    const noIds = getSegmentationTooltipContent(
      createInput({ selectionId: null, instanceId: null }),
    );
    expect(
      noIds.lines.some((line) => line.includes("T{") || line.includes("B{")),
    ).toBe(false);
  });

  it("shows the absolute timestamp when the selection belongs to the current frame", () => {
    const content = getSegmentationTooltipContent(
      createInput({
        timestamp: new Date("2026-08-12T00:00:05.000Z"),
        currentTimestamp: new Date("2026-08-12T00:00:04.000Z"),
        isInCurrentFrame: true,
      }),
    );

    expect(content.lines).toContain("(t = 2026-08-12T00:00:05.000Z)");
  });

  it("shows the signed offset from the frame center for out-of-frame selections", () => {
    const currentTimestamp = new Date("2026-08-12T00:00:04.000Z");

    const after = getSegmentationTooltipContent(
      createInput({
        timestamp: new Date("2026-08-12T00:00:07.500Z"),
        currentTimestamp,
      }),
    );
    expect(after.lines).toContain("(t + 3.50s)");

    const before = getSegmentationTooltipContent(
      createInput({
        timestamp: new Date("2026-08-12T00:00:01.000Z"),
        currentTimestamp,
      }),
    );
    expect(before.lines).toContain("(t - 3.00s)");
  });

  it("falls back to a null timestamp text and omits the line when disabled", () => {
    const unknown = getSegmentationTooltipContent(
      createInput({ timestamp: null }),
    );
    expect(unknown.lines).toContain("(t = null)");

    const disabled = getSegmentationTooltipContent(
      createInput({ showTimestampDiff: false }),
    );
    expect(disabled.lines.some((line) => line.startsWith("(t "))).toBe(false);
  });

  it("formats the class line for classified and unclassified selections", () => {
    expect(getSegmentationTooltipContent(createInput()).lines).toContain(
      "[Car]",
    );
    expect(
      getSegmentationTooltipContent(createInput({ displayClassName: null }))
        .lines,
    ).toContain("<Unclassified>");
  });

  it("joins the enabled descriptor levels and omits the line when all are hidden", () => {
    const both = getSegmentationTooltipContent(createInput());
    expect(both.lines).toContain("O: Excellent | D: Satisfactory");

    const occlusionOnly = getSegmentationTooltipContent(
      createInput({ showDistinctiveness: false }),
    );
    expect(occlusionOnly.lines).toContain("O: Excellent");

    const none = getSegmentationTooltipContent(
      createInput({ showOcclusion: false, showDistinctiveness: false }),
    );
    expect(
      none.lines.some((line) => line.includes("O:") || line.includes("D:")),
    ).toBe(false);
  });

  it("hides the tooltip when the tooltips setting is off", () => {
    expect(
      getSegmentationTooltipContent(createInput({ showTooltips: false }))
        .visible,
    ).toBe(false);
  });
});
