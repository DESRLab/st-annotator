import { Clipboard } from "sta/app/editor";

import type { VectorParams, ReadonlyLabelVector } from "../data";

export type VectorClipboardData = Omit<
  VectorParams,
  "id" | "timestamp" | "showColor"
>;

/**
 * Contains a user interface for copy and pasting vector objects in the scene.
 */
export class LabelVectorClipboard extends Clipboard<
  ReadonlyLabelVector,
  VectorClipboardData
> {
  /**
   * Creates a new clipboard for copy/pasting in a scene.
   */
  constructor() {
    super({
      objToData: (vector) => ({
        vectorType: vector.vectorType,
        // Clipboard contents are a snapshot: later edits or deletion of
        // the source vector must not mutate future pasted geometry.
        vertices: vector.vertices.map((vertex) => vertex.clone()),
        gtClassId: vector.gtClassId,
      }),
    });
  }
}
