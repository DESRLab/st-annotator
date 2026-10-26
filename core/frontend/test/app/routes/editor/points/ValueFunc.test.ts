import { describe, expect, it } from "vitest";

import { CoordinateFormat } from "../../../../../app/routes/editor/config/CoordinateFormat";
import { NormalizedValueFunc } from "../../../../../app/routes/editor/points/data/ValueFunc";
import { PointBuffer } from "../../../../../app/routes/editor/points/data/PointBuffer";

const buffer = new PointBuffer(
  new Float32Array([-10, 0, 10, 0, 10, 20, 10, 20, 30]),
  CoordinateFormat.XYZ,
  3,
);

describe("NormalizedValueFunc", () => {
  it("normalizes every channel in point order and clamps both ends", () => {
    for (const [channel, expected] of [
      [0, [0, 0, 0.5]],
      [1, [0, 0.5, 1]],
      [2, [0.5, 1, 1]],
    ] as const) {
      expect(new NormalizedValueFunc(channel, 0, 20).getValues(buffer)).toEqual(
        expected,
      );
    }
    // Preserve the existing runtime null-channel fallback.
    // @ts-expect-error - deliberately exercise the null-channel fallback.
    expect(new NormalizedValueFunc(null, 0, 20).getValues(buffer)).toEqual([
      0, 0, 0.5,
    ]);
  });

  it("retains output cardinality for degenerate and infinite bounds", () => {
    for (const threshold of [0, 4]) {
      const input = new PointBuffer(
        new Float32Array([
          threshold - 1,
          0,
          0,
          threshold,
          0,
          0,
          threshold + 1,
          0,
          0,
        ]),
        CoordinateFormat.XYZ,
        3,
      );
      expect(
        new NormalizedValueFunc(0, threshold, threshold).getValues(input),
      ).toEqual([0, NaN, 1]);
    }
    expect(
      new NormalizedValueFunc(0, -Infinity, Infinity).getValues(buffer),
    ).toEqual([NaN, NaN, NaN]);
  });

  it("derives bounds from population standard scores", () => {
    const min = NormalizedValueFunc.fromStdScore(-1);
    const max = NormalizedValueFunc.fromStdScore(1);
    expect(min([-1, 0, 1])).toBeCloseTo(-Math.sqrt(2 / 3), 12);
    expect(max([-1, 0, 1])).toBeCloseTo(Math.sqrt(2 / 3), 12);
    for (const channel of [0, 1, 2]) {
      const values = new NormalizedValueFunc(channel, min, max).getValues(
        buffer,
      );
      expect(values).toHaveLength(3);
      expect(values[0]).toBe(0);
      expect(values[1]).toBeCloseTo(0.5, 12);
      expect(values[2]).toBe(1);
    }
  });
});
