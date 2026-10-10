import { ShortUUID } from "../data";
import type { UUID } from "../data";

/**
 * The members of a vector object needed to build a selection item; model
 * instances satisfy this structurally at projection time.
 */
export interface LabelVectorSelectionItemSource {
  readonly id: UUID;
  readonly gtClass: Readonly<{ name: string }> | null;
}

/**
 * The display text of a vector in selection lists.
 *
 * Relationally derived: it depends on the ground truth class, so it can
 * change when the linked class changes even though the vector itself did
 * not.
 */
export function getLabelVectorSelectionItemText(
  item: LabelVectorSelectionItemSource,
): string {
  const { id, gtClass } = item;
  const shortId = new ShortUUID(id);

  if (gtClass == null) return `P{${shortId}} <Unclassified>`;

  return `P{${shortId}} [${gtClass.name}]`;
}
