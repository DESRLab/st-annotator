import { createPluginSliceSelectorHook } from "sta/app/editor";

import type { BBoxSlice } from "./BBoxSlice";

/** Reads a value from the bbox slice of the editor state snapshot. */
export const useBBoxSelector = createPluginSliceSelectorHook<"bbox", BBoxSlice>(
  "bbox",
);
