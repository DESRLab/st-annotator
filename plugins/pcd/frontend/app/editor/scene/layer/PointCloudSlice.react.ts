import { createPluginSliceSelectorHook } from "sta/app/editor";

import type { PointCloudSlice } from "./PointCloudSlice";

/** Reads a value from the point cloud slice of the editor state snapshot. */
export const usePcdSelector = createPluginSliceSelectorHook<
  "pcd",
  PointCloudSlice
>("pcd");
