import { ShortUUID } from "../data";
import type { ReadonlyLabelBox, ReadonlyLabelTrack } from "../data";

/**
 * The display text of a bounding box in selection lists.
 *
 * Relationally derived: it depends on the perceived (or inherited ground
 * truth) class, so it can change when the linked class changes even though
 * the box itself did not.
 */
export function getLabelBoxSelectionItemText(item: ReadonlyLabelBox): string {
  const { id, perceivedClass } = item;
  const shortId = new ShortUUID(id);

  if (perceivedClass == null) {
    const { gtClass } = item;
    if (gtClass == null) return `B{${shortId}} <Unclassified>`;

    return `B{${shortId}} <Inherited>`;
  }

  return `B{${shortId}} [${perceivedClass.name}]`;
}

/**
 * The display text of an object track in selection lists.
 *
 * Relationally derived: it depends on the ground truth class, so it can
 * change when the linked class changes even though the track itself did
 * not.
 */
export function getLabelTrackSelectionItemText(
  item: ReadonlyLabelTrack,
): string {
  const { id, gtClass } = item;
  const shortId = new ShortUUID(id);

  if (gtClass == null) return `T{${shortId}} <Unclassified>`;

  return `T{${shortId}} [${gtClass.name}]`;
}
