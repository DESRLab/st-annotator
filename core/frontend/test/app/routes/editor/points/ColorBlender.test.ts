import { Color } from "three";
import { describe, expect, it } from "vitest";

import { Colormap } from "../../../../../app/routes/editor/colors/data/Colormap";
import { CoordinateFormat } from "../../../../../app/routes/editor/config/CoordinateFormat";
import {
  ApplyColormap,
  ComposeRGB,
} from "../../../../../app/routes/editor/points/data/ColorBlender";
import { NormalizedValueFunc } from "../../../../../app/routes/editor/points/data/ValueFunc";
import { PointBuffer } from "../../../../../app/routes/editor/points/data/PointBuffer";

// The unused fourth channel exposes incorrect assumptions about point strides.
const buffer = new PointBuffer(
  new Float32Array([0, 10, 20, 1000, 10, 20, 0, 2000, 20, 0, 10, 3000]),
  CoordinateFormat.XYZ,
  4,
);
const channels = [0, 1, 2].map(
  (channel) => new NormalizedValueFunc(channel, 0, 20),
);

describe("point color blending", () => {
  it("maps each channel to a complete, ordered color array", () => {
    const map = new Colormap("test", ["blue", "pink", "green"]);
    const expected = [
      ["blue", "pink", "green"],
      ["pink", "green", "blue"],
      ["green", "blue", "pink"],
    ];
    for (const [index, channel] of channels.entries()) {
      expect(new ApplyColormap(map, channel).getColors(buffer)).toEqual(
        expected[index].map((color) => new Color(color)),
      );
    }
    const uniform = new PointBuffer(
      new Float32Array([10, 10, 10, 10, 10, 10]),
      CoordinateFormat.XYZ,
      3,
    );
    for (const channel of channels) {
      expect(new ApplyColormap(map, channel).getColors(uniform)).toEqual([
        new Color("pink"),
        new Color("pink"),
      ]);
    }
  });

  it("composes RGB channels without dropping or reordering points", () => {
    expect(
      new ComposeRGB(channels[0], channels[1], channels[2]).getColors(buffer),
    ).toEqual([
      new Color(0, 0.5, 1),
      new Color(0.5, 1, 0),
      new Color(1, 0, 0.5),
    ]);
  });
});
