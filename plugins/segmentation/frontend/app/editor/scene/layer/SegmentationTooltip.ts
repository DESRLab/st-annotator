import { ShortUUID } from "../data";
import type { UUID } from "../data";

/** The Date-like timestamp surface the tooltip formatting needs. */
interface TooltipTimestamp {
  getTime(): number;
  toISOString(): string;
}

/**
 * The plain inputs of the selection tooltip content: label data and settings
 * flags only, with no scene or model dependencies, so the formatting is
 * unit-testable in isolation.
 */
export interface SegmentationTooltipContentInput {
  readonly selectionId: UUID | null;
  readonly instanceId: UUID | null;
  readonly timestamp: TooltipTimestamp | null;
  readonly currentTimestamp: TooltipTimestamp | null;
  /** Whether the selection timestamp falls inside the current frame's range. */
  readonly isInCurrentFrame: boolean;
  readonly displayClassName: string | null;
  readonly occlusionName: string;
  readonly distinctivenessName: string;
  readonly showTooltips: boolean;
  readonly showTrackSegId: boolean;
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
 * Formats the timestamp line: the absolute timestamp when the selection
 * belongs to the current frame (or either timestamp is unknown), otherwise
 * the signed offset from the frame center.
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
 * Builds the class name, lines, and visibility of a selection tooltip from
 * plain label data and settings flags. The on-screen position is computed by
 * the layer, which owns the scene projection.
 */
export function getSegmentationTooltipContent(
  input: SegmentationTooltipContentInput,
): TooltipContent {
  const instanceIdStr =
    input.instanceId == null || !input.showTrackSegId
      ? ""
      : `T{${new ShortUUID(input.instanceId)}}`;
  const selectionIdStr =
    input.selectionId == null || !input.showTrackSegId
      ? ""
      : `B{${new ShortUUID(input.selectionId)}}`;
  const idText = [instanceIdStr, selectionIdStr]
    .filter((s) => s.length > 0)
    .join(" | ");

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
    className: "selection-tooltip",
    lines: [idText, tsText, classText, descriptorText].filter(
      (s) => s.length > 0,
    ),
    visible: input.showTooltips,
  };
}
