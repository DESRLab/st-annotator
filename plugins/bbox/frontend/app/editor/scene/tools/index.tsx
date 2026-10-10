export type { BoxClipboardData } from "./LabelBoxClipboard";
export type {
  LabelBoxCreatorEventMap,
  LabelBoxDrawMode,
} from "./LabelBoxCreator";

export interface LabelBoxClipboardEventMap<D> {
  change: {};
  copy: { clipboard: D };
  paste: { clipboard: D };
}

export { LabelBoxClipboard } from "./LabelBoxClipboard";
export { LabelBoxCreator } from "./LabelBoxCreator";
