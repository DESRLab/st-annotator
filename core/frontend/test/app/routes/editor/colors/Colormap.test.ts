import { Color } from "three";
import { describe, expect, it } from "vitest";

import { Colormap } from "../../../../../app/routes/editor/colors/data/Colormap";

describe("Colormap", () => {
  it("maps endpoints and rounding boundaries in input order", () => {
    const cmap = new Colormap("primary", ["red", "green", "blue"]);
    expect(Object.isFrozen(cmap)).toBe(true);
    expect(cmap.name).toBe("primary");
    const colors = cmap.apply([1, 0, 0.249, 0.25, 0.5, 0.749, 0.75]);
    expect(colors).toEqual(
      ["blue", "red", "red", "green", "green", "green", "blue"].map(
        (color) => new Color(color),
      ),
    );
    expect(colors.every(Object.isFrozen)).toBe(true);
    expect(cmap.apply([])).toEqual([]);
  });

  it("uses the fallback for invalid values and for an empty palette", () => {
    const invalid = [NaN, -Infinity, Infinity, -0.001, 1.001];
    for (const palette of [[], ["red"], ["red", "blue"]]) {
      const cmap = new Colormap("", palette);
      const values = palette.length ? invalid : [...invalid, 0, 0.5, 1];
      expect(cmap.apply(values, "magenta")).toEqual(
        values.map(() => new Color("magenta")),
      );
      expect(cmap.apply(values)).toEqual(values.map(() => new Color("black")));
    }
  });

  it("uses a single palette color throughout the valid range", () => {
    expect(new Colormap("", ["red"]).apply([0, 0.5, 1])).toEqual([
      new Color("red"),
      new Color("red"),
      new Color("red"),
    ]);
  });
});
