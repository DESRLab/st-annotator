import * as THREE from "three";

/**
 * Represents a mapping from real numbers to colors.
 *
 * This is a value-based class.
 */
export class Colormap {
  /**
   * The name of the colormap.
   */
  readonly name: string;

  /**
   * A dense array containing the colors used for values within the interval `[0, 1]`, where
   * the first color is mapped from `0` and the last color is mapped from `1`.
   */
  readonly #colors: readonly Readonly<THREE.Color>[];

  /**
   * Creates a new colormap.
   *
   * @param colors
   * The colors used for values within the interval `[0, 1]`, where the
   * first color is mapped from `0` and the last color is mapped from `1`.
   * All of its elements are extracted and converted to {@link THREE.Color}
   * objects to form the color map.
   */
  constructor(name: string, colors: Iterable<THREE.ColorRepresentation>) {
    this.name = name;
    this.#colors = Array.from(colors, (c: THREE.ColorRepresentation) =>
      Object.freeze(new THREE.Color(c)),
    );

    Object.freeze(this);
  }

  /**
   * Applies the colormap to a set of values within the interval `[0, 1]`.
   *
   * @param badColor The color used for values outside the interval.
   * It is converted to a {@link THREE.Color} through its constructor.
   * @returns The `i`th element is the color of the `i`th value.
   */
  apply(
    values: number[],
    badColor: THREE.ColorRepresentation = "black",
  ): THREE.Color[] {
    const colors = this.#colors;
    const maxIdx = colors.length - 1;

    // No available colors
    if (maxIdx < 0) return values.map(() => new THREE.Color(badColor));

    return values.map((v: number) =>
      Number.isFinite(v) && 0 <= v && v <= 1
        ? colors[Math.round(v * maxIdx)]
        : new THREE.Color(badColor),
    );
  }
}
