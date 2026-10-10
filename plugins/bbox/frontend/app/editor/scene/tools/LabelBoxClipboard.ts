import { Clipboard } from "sta/app/editor";

import type { BoxParams, ReadonlyLabelBox } from "../data";

export type BoxClipboardData = Omit<
  BoxParams,
  | "id"
  | "timestamp"
  | "opacity"
  | "showForwardIndicator"
  | "showFrame"
  | "showPerceivedClass"
  | "showColor"
>;

/**
 * Contains a user interface for copy and pasting bounding boxes in the scene.
 */
export class LabelBoxClipboard extends Clipboard<
  ReadonlyLabelBox,
  BoxClipboardData
> {
  /**
   * Creates a new clipboard for copy/pasting in a scene.
   */
  constructor() {
    super({
      objToData: (box: ReadonlyLabelBox) => ({
        boxType: box.boxType,
        center: box.center.clone(),
        angle: box.angle,
        size: box.size.clone(),
        qualityRank: box.qualityRank,
        distinctiveLv: box.distinctiveLv,
        occlusionLv: box.occlusionLv,
        perceivedClassId: box.perceivedClassId,
        entityId: box.entityId,
      }),
    });
  }
}
