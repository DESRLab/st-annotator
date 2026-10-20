import {
  ArrowHelper,
  BufferGeometry,
  CanvasTexture,
  Group,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { defaultRelationSettings } from "./RelationSettings";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export interface RelationTooltipPart {
  readonly text: string;
  readonly color: number;
}

/** Owns the thick directed line, arrowhead and class-name label. */
export class RelationVisual {
  readonly objects = new Group();
  readonly line: Line2;
  readonly #arrow: ArrowHelper;
  readonly #reverseArrow: ArrowHelper | null;
  readonly #text: Points<BufferGeometry, PointsMaterial> | null;
  constructor(
    source: Readonly<Vector3>,
    target: Readonly<Vector3>,
    color: number,
    name: string,
    width = defaultRelationSettings.lineWidth,
    baseWidth = width,
    bidirectional = false,
    tooltip: readonly RelationTooltipPart[] = [{ text: name, color }],
  ) {
    const geometry = new LineGeometry();
    geometry.setPositions([
      source.x,
      source.y,
      source.z,
      target.x,
      target.y,
      target.z,
    ]);
    this.line = new Line2(
      geometry,
      new LineMaterial({ color, linewidth: width, worldUnits: false }),
    );
    const direction = new Vector3().subVectors(target, source);
    const length = direction.length();
    // Scale with the configured width, independently of highlight thickening.
    const headScale = baseWidth / 5;
    this.#arrow = new ArrowHelper(
      direction.normalize(),
      new Vector3().copy(source),
      length,
      color,
      length * 0.12 * headScale,
      length * 0.06 * headScale,
    );
    this.#arrow.line.visible = false;
    this.#reverseArrow = bidirectional
      ? new ArrowHelper(
          direction.clone().negate(),
          new Vector3().copy(target),
          length,
          color,
          length * 0.12 * headScale,
          length * 0.06 * headScale,
        )
      : null;
    if (this.#reverseArrow != null) {
      this.#reverseArrow.line.visible = false;
      this.objects.add(this.#reverseArrow);
    }
    this.#text = name === "" ? null : RelationVisual.#label(tooltip);
    if (this.#text != null) {
      this.#text.position.copy(source).add(target).multiplyScalar(0.5);
      this.objects.add(this.#text);
    }
    this.objects.add(this.line, this.#arrow);
  }
  static #label(
    parts: readonly RelationTooltipPart[],
  ): Points<BufferGeometry, PointsMaterial> {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (context == null) throw new Error("Cannot create relation label canvas");
    context.font = "bold 28px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(0, 224, 512, 64);
    const widths = parts.map((part) => context.measureText(part.text).width);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const scale = totalWidth > 500 ? 500 / totalWidth : 1;
    let x = (512 - totalWidth * scale) / 2;
    for (const [index, part] of parts.entries()) {
      const width = widths[index] * scale;
      context.fillStyle = `#${part.color.toString(16).padStart(6, "0")}`;
      context.fillText(part.text, x, 256, width);
      x += width;
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    // Point sprites keep text at a fixed pixel size in both camera modes.
    return new Points(
      new BufferGeometry().setFromPoints([new Vector3()]),
      new PointsMaterial({
        map: texture,
        size: 256,
        sizeAttenuation: false,
        transparent: true,
        alphaTest: 0.01,
        depthTest: false,
      }),
    );
  }
  setResolution(width: number, height: number): void {
    this.line.material.resolution.set(width, height);
  }
  dispose(): void {
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.#arrow.dispose();
    this.#reverseArrow?.dispose();
    this.#text?.geometry.dispose();
    this.#text?.material.map?.dispose();
    this.#text?.material.dispose();
  }
}

/** A screen-sized marker highlights the first endpoint without mutating it. */
export function endpointMarker(
  center: Readonly<Vector3>,
): Points<BufferGeometry, PointsMaterial> {
  return new Points(
    new BufferGeometry().setFromPoints([new Vector3().copy(center)]),
    new PointsMaterial({
      color: 0xffff00,
      size: 14,
      sizeAttenuation: false,
      depthTest: false,
    }),
  );
}
