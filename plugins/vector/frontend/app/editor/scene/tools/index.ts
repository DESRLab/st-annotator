export { VectorCreator } from "./VectorCreator";
export type { VectorCreatorEventMap } from "./VectorCreator";
export { PolylineCreator } from "./Polyline";
export { PolygonCreator } from "./Polygon";
export { PointCreator } from "./Point";
export { LabelVectorClipboard } from "./LabelVectorClipboard";
export type { VectorClipboardData } from "./LabelVectorClipboard";

import type { VectorClipboardData } from "./LabelVectorClipboard";
export interface LabelVectorClipboardEventMap {
  change: {};
  copy: { clipboard: VectorClipboardData };
  paste: { clipboard: VectorClipboardData };
}
