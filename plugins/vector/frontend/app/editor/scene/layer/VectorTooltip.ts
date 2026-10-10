import { ShortUUID } from "../data";
import type { UUID } from "../data";

/**
 * The plain inputs of the vector tooltip content: label data and settings
 * flags only, with no scene or model dependencies, so the formatting is
 * unit-testable in isolation.
 */
export interface VectorTooltipContentInput {
  readonly vectorId: UUID | null;
  readonly displayClassName: string | null;
  readonly showTooltips: boolean;
  readonly showVectorId: boolean;
}

/** The scene-independent part of a tooltip model. */
export interface TooltipContent {
  readonly className: string;
  readonly lines: readonly string[];
  readonly visible: boolean;
}

/**
 * Builds the class name, lines, and visibility of a vector tooltip from
 * plain label data and settings flags. The on-screen position is computed by
 * the layer, which owns the scene projection.
 */
export function getVectorTooltipContent(
  input: VectorTooltipContentInput,
): TooltipContent {
  const idText =
    input.vectorId == null || !input.showVectorId
      ? ""
      : `P{${new ShortUUID(input.vectorId)}}`;

  const classText =
    input.displayClassName == null
      ? "<Unclassified>"
      : `[${input.displayClassName}]`;

  return {
    className: "vector-tooltip",
    lines: [idText, classText].filter((s) => s.length > 0),
    visible: input.showTooltips,
  };
}
