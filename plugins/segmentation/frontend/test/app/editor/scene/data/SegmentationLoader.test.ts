import { describe, expect, it, vi } from "vitest";

import { SegmentationLoader } from "../../../../../app/editor/scene/data/SegmentationView";

const EMPTY_DATA = { classes: [], instances: [], selections: [] };

describe("SegmentationLoader", () => {
  it("resolves the requested frame before publishing neighboring frames", async () => {
    const current = { id: 2 };
    const previous = { id: 1 };
    const next = { id: 3 };
    const lookup = {
      receiver: { config: {} },
      bulkGetData: vi
        .fn()
        .mockImplementation((frames: { id: number }[]) =>
          Promise.resolve(frames.map(() => EMPTY_DATA)),
        ),
      getData: vi.fn().mockResolvedValue(EMPTY_DATA),
    };
    const context = {
      frames: {
        elements: [previous, current, next],
        axes: {
          xb: { getValue: ({ id }: { id: number }) => ({ center: id }) },
          yb: { getValue: ({ id }: { id: number }) => ({ center: id }) },
          tb: { getValue: ({ id }: { id: number }) => ({ center: id }) },
        },
      },
    };
    const loader = new SegmentationLoader(lookup as never, context as never, 5);
    const onBackground = vi.fn();
    loader.addBackgroundLoadListener(onBackground);

    const result = await loader.getData(current as never);

    expect(result.numLabelSelections).toBe(0);
    expect(lookup.bulkGetData).toHaveBeenCalledWith(
      [current],
      true,
      undefined,
      undefined,
    );
    expect(lookup.bulkGetData).toHaveBeenCalledTimes(2);
    expect(lookup.bulkGetData).toHaveBeenLastCalledWith(
      [previous, next],
      true,
      undefined,
    );
    await vi.waitFor(() => expect(onBackground).toHaveBeenCalledTimes(2));
    expect(onBackground.mock.calls.every(([frame]) => frame === current)).toBe(
      true,
    );
  });
});
