import type { STAPlugin } from "sta/app";

import routes from "./routes";

const editorLoader = () => import("./editor/index.js");

export default {
  routes,
  editor: {
    loader: editorLoader,
    overlayDoms: [
      {
        key: "canvas",
        kind: "canvas",
        id: "segmentation-canvas",
        testId: "editor-layer-overlay-segmentation",
      },
      { key: "brushCursor", kind: "div" },
    ],
  },
} satisfies STAPlugin;
