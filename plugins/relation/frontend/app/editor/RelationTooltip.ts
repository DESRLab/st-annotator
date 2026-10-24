import { sameLabelElement } from "sta/app/editor";
import type { RelationClass, RelationGroup } from "./RelationIndex";
import type { RelationTooltipPart } from "./RelationVisual";

/** Groups class labels and duplicate counts independently for each direction. */
export function getRelationTooltipParts(
  group: RelationGroup,
  classes: ReadonlyMap<number, RelationClass>,
): readonly RelationTooltipPart[] {
  return [true, false].flatMap((forward) => {
    const counts = new Map<number, number>();
    for (const relation of group.members) {
      if (sameLabelElement(relation.source, group.relation.source) !== forward)
        continue;
      const id = relation.relation_class_id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    return [
      ...(forward ? [] : [{ text: " / ", color: 0xffffff }]),
      { text: "(", color: 0xffffff },
      ...[...counts].flatMap(([id, count], index) => {
        const definition = classes.get(id)!;
        return [
          ...(index === 0 ? [] : [{ text: " / ", color: 0xffffff }]),
          {
            text: `${definition.name}${count > 1 ? ` [x${count}]` : ""}`,
            color: definition.color_rgb,
          },
        ];
      }),
      { text: ")", color: 0xffffff },
    ];
  });
}
