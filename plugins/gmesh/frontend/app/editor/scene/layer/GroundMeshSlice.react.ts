import { createPluginSliceSelectorHook } from "sta/app/editor";

import type { GroundMeshSlice } from "./GroundMeshSlice";

/** Reads a value from the ground mesh slice of the editor state snapshot. */
export const useGmeshSelector = createPluginSliceSelectorHook<
  "gmesh",
  GroundMeshSlice
>("gmesh");
