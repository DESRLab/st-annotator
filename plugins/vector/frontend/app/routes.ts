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
  label: {
    data: [
      {
        path: "vector",
        module: routeModule("./label/data/vector"),
        title: "Vector Data",
      },
    ],
  },
} satisfies STAPlugin["routes"];
