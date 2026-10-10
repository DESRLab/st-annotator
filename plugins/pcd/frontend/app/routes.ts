import type { STAPlugin } from "sta/app";

// Vitest's jsdom transform can replace `import.meta.url` with `self.location`,
// which is a Location object rather than the URL string available in modules.
const routeModule = (path: string) =>
  decodeURIComponent(
    new URL(
      `${path}${String(import.meta.url).endsWith(".ts") ? ".tsx" : ".js"}`,
      String(import.meta.url),
    ).pathname,
  );

export default {
  source: {
    data: [
      {
        path: "pcd",
        module: routeModule("./source/data/metadata"),
        title: "Point Cloud Metadata",
      },
    ],
    specs: [
      {
        path: "pcd",
        module: routeModule("./source/specs/specs"),
        title: "Point Cloud Specifications",
      },
    ],
  },
} satisfies STAPlugin["routes"];
