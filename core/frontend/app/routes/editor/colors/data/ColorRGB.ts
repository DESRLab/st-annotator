/**
 * A plain-data RGB color with float components in the [0, 1] range.
 *
 * This is the state boundary representation of a color: it crosses into
 * React components and pane data, and is converted to a three.js color
 * only at the imperative application points.
 */
export interface ColorRGB {
  /**
   * The red component.
   */
  r: number;

  /**
   * The green component.
   */
  g: number;

  /**
   * The blue component.
   */
  b: number;
}
