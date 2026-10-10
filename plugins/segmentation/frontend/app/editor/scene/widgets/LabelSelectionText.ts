import { ShortUUID } from "../data";
import type { UUID } from "../data";

/**
 * The members of a label instance needed to compute its display text in
 * selection lists.
 */
export interface LabelInstanceSelectionItemSource {
  readonly id: UUID;
  readonly gtClass: { readonly name: string } | null;
}

/**
 * The members of a label selection needed to compute its display text in
 * selection lists.
 */
export interface LabelSelectionSelectionItemSource {
  readonly id: UUID;
  readonly perceivedClass: { readonly name: string } | null;
  readonly gtClass: { readonly name: string } | null;
}

/**
 * The display text of an object instance in selection lists.
 *
 * Relationally derived: it depends on the ground truth class, so it can
 * change when the linked class changes even though the instance itself
 * did not.
 */
export function getLabelInstanceSelectionItemText(
  item: LabelInstanceSelectionItemSource,
): string {
  const { id, gtClass } = item;
  const shortId = new ShortUUID(id);

  if (gtClass == null) return `T{${shortId}} <Unclassified>`;

  return `T{${shortId}} [${gtClass.name}]`;
}

/**
 * The display text of a label selection in selection lists.
 *
 * Relationally derived: it depends on the perceived (or inherited ground
 * truth) class, so it can change when the linked class or instance changes
 * even though the selection itself did not.
 */
export function getLabelSelectionSelectionItemText(
  item: LabelSelectionSelectionItemSource,
): string {
  const { id, perceivedClass, gtClass } = item;
  const shortId = new ShortUUID(id);

  if (perceivedClass == null) {
    if (gtClass == null) return `B{${shortId}} <Unclassified>`;

    return `B{${shortId}} <Inherited>`;
  }

  return `B{${shortId}} [${perceivedClass.name}]`;
}
