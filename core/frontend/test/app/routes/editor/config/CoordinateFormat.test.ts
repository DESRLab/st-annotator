import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { CoordinateFormat } from "../../../../../app/routes/editor/config/CoordinateFormat";

describe("CoordinateFormat", () => {
  it("freezes the registry and its formats", () => {
    expect(Object.isFrozen(CoordinateFormat)).toBe(true);
    expect(Object.values(CoordinateFormat).every(Object.isFrozen)).toBe(true);
  });

  // Explicit mappings catch a pair of mutually inverse but incorrect conversions.
  it.each([
    ["XYZ", [1, 2, 3], [1, 2, 3]],
    ["XZY", [1, 3, 2], [1, 3, 2]],
    ["YXZ", [2, 1, 3], [2, 1, 3]],
    ["YZX", [3, 1, 2], [2, 3, 1]],
    ["ZXY", [2, 3, 1], [3, 1, 2]],
    ["ZYX", [3, 2, 1], [3, 2, 1]],
  ] as const)(
    "maps %s in both directions without mutating its input",
    (name, toThree, toDatabase) => {
      const format = CoordinateFormat[name];
      const input = new Vector3(1, 2, 3);
      const three = format.toThreeJSCoords(input);
      const database = format.toDatabaseCoords(input);
      expect(three.toArray()).toEqual(toThree);
      expect(database.toArray()).toEqual(toDatabase);
      expect(format.toDatabaseCoords(three)).toEqual(input);
      expect(format.toThreeJSCoords(database)).toEqual(input);
      expect(input.toArray()).toEqual([1, 2, 3]);
      expect(three).not.toBe(input);
      expect(database).not.toBe(input);
    },
  );
});
