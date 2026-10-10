import { describe, expect, it } from "vitest";

import { getBBoxTooltipContent } from "../../../../../app/editor/scene/layer/BBoxTooltip";
import type { BBoxTooltipContentInput } from "../../../../../app/editor/scene/layer/BBoxTooltip";

const TRACK_ID = "00000000-0000-0000-0000-0000000000a1";
const BOX_ID = "00000000-0000-0000-0000-000000000001";

function createInput(
  overrides: Partial<BBoxTooltipContentInput> = {},
): BBoxTooltipContentInput {
  return {
    boxId: BOX_ID,
    trackId: TRACK_ID,
    timestamp: null,
    currentTimestamp: null,
    isInCurrentFrame: false,
    displayClassName: "Car",
    occlusionName: "Excellent",
    distinctivenessName: "Satisfactory",
    showTooltips: true,
    showTrackBoxId: true,
    showTimestampDiff: true,
    showOcclusion: true,
    showDistinctiveness: true,
    ...overrides,
  };
}

describe("getBBoxTooltipContent", () => {
  it("formats the track and box ids with the settings display flags", () => {
    const content = getBBoxTooltipContent(createInput());

    expect(content.className).toBe("bbox-tooltip");
    expect(content.visible).toBe(true);
    // ShortUUID shows the last 6 characters of each id.
    expect(content.lines[0]).toBe("T{0000a1} | B{000001}");
  });

  it("omits the id line when the id display is disabled or both ids are missing", () => {
    const hidden = getBBoxTooltipContent(
      createInput({ showTrackBoxId: false }),
    );
    expect(
      hidden.lines.some((line) => line.includes("T{") || line.includes("B{")),
    ).toBe(false);

    const noIds = getBBoxTooltipContent(
      createInput({ boxId: null, trackId: null }),
    );
    expect(
      noIds.lines.some((line) => line.includes("T{") || line.includes("B{")),
    ).toBe(false);
  });

  it("shows only the box id for a trackless box", () => {
    const content = getBBoxTooltipContent(createInput({ trackId: null }));

    expect(content.lines[0]).toBe("B{000001}");
  });

  it("shows the absolute timestamp when the box belongs to the current frame", () => {
    const timestamp = new Date("2026-08-12T00:00:05.000Z");
    const currentTimestamp = new Date("2026-08-12T00:00:04.000Z");

    const content = getBBoxTooltipContent(
      createInput({
        timestamp,
        currentTimestamp,
        isInCurrentFrame: true,
      }),
    );

    expect(content.lines).toContain("(t = 2026-08-12T00:00:05.000Z)");
  });

  it("shows the signed offset from the frame center for out-of-frame boxes", () => {
    const timestamp = new Date("2026-08-12T00:00:07.500Z");
    const currentTimestamp = new Date("2026-08-12T00:00:04.000Z");

    const after = getBBoxTooltipContent(
      createInput({ timestamp, currentTimestamp }),
    );
    expect(after.lines).toContain("(t + 3.50s)");

    const before = getBBoxTooltipContent(
      createInput({
        timestamp: new Date("2026-08-12T00:00:01.000Z"),
        currentTimestamp,
      }),
    );
    expect(before.lines).toContain("(t - 3.00s)");
  });

  it("falls back to a null timestamp text and omits the line when disabled", () => {
    const unknown = getBBoxTooltipContent(createInput({ timestamp: null }));
    expect(unknown.lines).toContain("(t = null)");

    const disabled = getBBoxTooltipContent(
      createInput({ showTimestampDiff: false }),
    );
    expect(disabled.lines.some((line) => line.startsWith("(t "))).toBe(false);
  });

  it("formats the class line for classified and unclassified boxes", () => {
    expect(getBBoxTooltipContent(createInput()).lines).toContain("[Car]");
    expect(
      getBBoxTooltipContent(createInput({ displayClassName: null })).lines,
    ).toContain("<Unclassified>");
  });

  it("joins the enabled descriptor levels and omits the line when all are hidden", () => {
    const both = getBBoxTooltipContent(createInput());
    expect(both.lines).toContain("O: Excellent | D: Satisfactory");

    const occlusionOnly = getBBoxTooltipContent(
      createInput({ showDistinctiveness: false }),
    );
    expect(occlusionOnly.lines).toContain("O: Excellent");

    const none = getBBoxTooltipContent(
      createInput({ showOcclusion: false, showDistinctiveness: false }),
    );
    expect(
      none.lines.some((line) => line.includes("O:") || line.includes("D:")),
    ).toBe(false);
  });

  it("hides the tooltip when the tooltips setting is off", () => {
    expect(
      getBBoxTooltipContent(createInput({ showTooltips: false })).visible,
    ).toBe(false);
  });
});
