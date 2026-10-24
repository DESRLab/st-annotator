import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/sta-routes-config.shim", () => {
  const entries = [
    {
      path: "example",
      module: "example.tsx",
      title: "Example",
      children: [
        {
          path: "details",
          module: "details.tsx",
          title: "Details",
          children: [{ path: "edit", module: "edit.tsx", title: "Edit" }],
        },
      ],
    },
  ];
  return {
    default: {
      plugins: {
        example: {
          routes: {
            source: { data: entries, specs: entries },
            label: { data: entries, specs: entries },
          },
        },
      },
    },
  };
});

import routes from "../../app/routes";

// Build-time route entries share the runtime path/index/children structure.
const routeObjects = routes as RouteObject[];

describe("plugin subpages", () => {
  it.each(["source/data", "source/specs", "label/data", "label/specs"])(
    "resolves independent pages and recursive URL prefixes under %s",
    (section) => {
      for (const [subpath, file] of [
        ["example", "example.tsx"],
        ["example/details", "details.tsx"],
        ["example/details/edit", "edit.tsx"],
      ]) {
        const matches = matchRoutes(routeObjects, `/${section}/${subpath}`);
        expect(matches?.at(-1)?.route).toMatchObject({ file });
        // Parent pages are index routes, not layouts that must render Outlet.
        expect(matches?.slice(0, -1).map(({ route }) => route)).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ file: "example.tsx" }),
          ]),
        );
      }
      expect(matchRoutes(routeObjects, `/${section}/details`)).toBeNull();
    },
  );
});
