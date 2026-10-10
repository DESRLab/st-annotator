import { createPluginSliceSelectorHook } from "sta/app/editor";

import type { SegmentationSlice } from "./SegmentationSlice";

/** Reads a value from the segmentation slice of the editor state snapshot. */
export const useSegmentationSelector = createPluginSliceSelectorHook<
  "segmentation",
  SegmentationSlice
>("segmentation");
