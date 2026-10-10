import { createPluginSliceSelectorHook } from "sta/app/editor";

import type { VectorSlice } from "./VectorSlice";

/** Reads a value from the vector slice of the editor state snapshot. */
export const useVectorSelector = createPluginSliceSelectorHook<
  "vector",
  VectorSlice
>("vector");
