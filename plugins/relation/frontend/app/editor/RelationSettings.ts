import type { ColorRGB, EditorConfig } from "sta/app/editor";
import { TypeUtils } from "sta/common";

export interface RelationSettings {
  hoverColor: Readonly<ColorRGB>;
  selectColor: Readonly<ColorRGB>;
  lineWidth: number;
  showTooltips: boolean;
}

export const defaultRelationSettings: Readonly<RelationSettings> = {
  hoverColor: { r: 1, g: 0, b: 0 },
  selectColor: { r: 0, g: 0, b: 1 },
  lineWidth: 2,
  showTooltips: false,
};

export function getRelationSettings(config: EditorConfig): RelationSettings {
  return TypeUtils.mergeObjects(
    config.forLayer("relation"),
    defaultRelationSettings,
  );
}
