import { ShortUUID } from "../data";
import type { UUID } from "../data";

/** The Date-like timestamp surface the tooltip formatting needs. */
interface TooltipTimestamp {
  getTime(): number;
  toISOString(): string;
}

/**
 * The plain inputs of the bbox tooltip content: label data and settings
 * flags only, with no scene or model dependencies, so the formatting is
 * unit-testable in isolation.
 */
export interface BBoxTooltipContentInput {
  readonly boxId: UUID | null;
  readonly trackId: UUID | null;
  readonly timestamp: TooltipTimestamp | null;
  readonly currentTimestamp: TooltipTimestamp | null;
  /** Whether the box timestamp falls inside the current frame's range. */
  readonly isInCurrentFrame: boolean;
  readonly displayClassName: string | null;
  readonly occlusionName: string;
  readonly distinctivenessName: string;
  readonly showTooltips: boolean;
  readonly showTrackBoxId: boolean;
  readonly showTimestampDiff: boolean;
  readonly showOcclusion: boolean;
  readonly showDistinctiveness: boolean;
}

/** The scene-independent part of a tooltip model. */
export interface TooltipContent {
  readonly className: string;
  readonly lines: readonly string[];
  readonly visible: boolean;
}

/**
 * Formats the timestamp line: the absolute timestamp when the box belongs to
 * the current frame (or either timestamp is unknown), otherwise the signed
 * offset from the frame center.
 */
function formatTimestampText(
  timestamp: TooltipTimestamp | null,
  currentTimestamp: TooltipTimestamp | null,
  isInCurrentFrame: boolean,
): string {
  if (currentTimestamp == null || timestamp == null || isInCurrentFrame) {
    return `(t = ${timestamp?.toISOString() ?? null})`;
  }

  const timeDiffTotalSecs =
    (timestamp.getTime() - currentTimestamp.getTime()) / 1000;
  const timeDiffSign = timeDiffTotalSecs >= 0 ? "+" : "-";

  return `(t ${timeDiffSign} ${Math.abs(timeDiffTotalSecs).toFixed(2)}s)`;
}

/**
 * Builds the class name, lines, and visibility of a box tooltip from plain
 * label data and settings flags. The on-screen position is computed by the
 * layer, which owns the scene projection.
 */
export function getBBoxTooltipContent(
  input: BBoxTooltipContentInput,
): TooltipContent {
  const trackIdStr =
    input.trackId == null || !input.showTrackBoxId
      ? ""
      : `T{${new ShortUUID(input.trackId)}}`;
  const boxIdStr =
    input.boxId == null || !input.showTrackBoxId
      ? ""
      : `B{${new ShortUUID(input.boxId)}}`;
  const idText = [trackIdStr, boxIdStr].filter((s) => s.length > 0).join(" | ");

  const tsText = input.showTimestampDiff
    ? formatTimestampText(
        input.timestamp,
        input.currentTimestamp,
        input.isInCurrentFrame,
      )
    : "";

  const classText =
    input.displayClassName == null
      ? "<Unclassified>"
      : `[${input.displayClassName}]`;

  const occlusionText = input.showOcclusion ? `O: ${input.occlusionName}` : "";
  const distinctivenessText = input.showDistinctiveness
    ? `D: ${input.distinctivenessName}`
    : "";
  const descriptorText = [occlusionText, distinctivenessText]
    .filter((s) => s.length > 0)
    .join(" | ");

  return {
    className: "bbox-tooltip",
    lines: [idText, tsText, classText, descriptorText].filter(
      (s) => s.length > 0,
    ),
    visible: input.showTooltips,
  };
}
