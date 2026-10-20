import { Color, SRGBColorSpace } from "three";
import { sameLabelElement } from "sta/app/editor";
import type { RelationClass, RelationGroup } from "./RelationIndex";
import type { RelationTooltipPart } from "./RelationVisual";

// Golden-angle spacing keeps successive category IDs visually separated.
const DEFAULT_PALETTE_HUE_STEP = 0.3819660112501051;

/** Groups class labels and duplicate counts independently for each direction. */
export function getRelationTooltipParts(
  group: RelationGroup,
  classes: ReadonlyMap<number, RelationClass>,
): readonly RelationTooltipPart[] {
  // Imported categories can all carry the model's white default. Give that
  // unconfigured set stable colors without changing the saved definitions.
  const usePalette = [...classes.values()].every(
    (item) => item.color_rgb === 0xffffff,
  );
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
            color: usePalette
              ? new Color()
                  .setHSL(
                    (id * DEFAULT_PALETTE_HUE_STEP) % 1,
                    0.8,
                    0.65,
                    SRGBColorSpace,
                  )
                  .getHex()
              : definition.color_rgb,
          },
        ];
      }),
      { text: ")", color: 0xffffff },
    ];
  });
}
