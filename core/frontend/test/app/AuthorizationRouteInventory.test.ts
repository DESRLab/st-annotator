import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import routes from "../../app/routes";

interface RouteEntry {
  children?: RouteEntry[];
  file?: string;
  index?: boolean;
  path?: string;
}

interface ClassifiedRoute {
  classification: "protected" | "public";
  module: string;
  path: string;
}

const joinPath = (parent: string, child?: string) => {
  const joined = [parent, child]
    .filter(Boolean)
    .join("/")
    .replaceAll("//", "/");
  return joined === "" ? "/" : `/${joined.replace(/^\//, "")}`;
};

const collectRoutes = (
  entries: RouteEntry[],
  parent = "",
  inheritedClassification?: "protected" | "public",
): ClassifiedRoute[] =>
  entries.flatMap((entry) => {
    const path = joinPath(parent, entry.path);
    const classification =
      entry.file === "./layouts/protected.tsx"
        ? "protected"
        : entry.file === "./layouts/public.tsx"
          ? "public"
          : inheritedClassification;
    if (entry.children) {
      return collectRoutes(entry.children, path, classification);
    }
    if (!entry.file) return [];
    if (!classification) {
      return [
        {
          classification:
            entry.file === "./routes/backend-proxy.ts" ? "public" : "protected",
          module: entry.file,
          path,
        },
      ];
    }
    return [{ classification, module: entry.file, path }];
  });

const readManifest = (): ClassifiedRoute[] =>
  readFileSync(
    resolve(
      process.cwd(),
      "../../tests/backend/frontend_authorization_routes.tsv",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [classification, path, module] = line.split("\t");
      if (
        (classification !== "protected" && classification !== "public") ||
        !path ||
        !module
      ) {
        throw new Error(`Invalid frontend authorization manifest row: ${line}`);
      }
      return { classification, path, module };
    });

describe("frontend authorization route inventory", () => {
  it("classifies every core route from the actual React Router configuration", () => {
    const actual = collectRoutes(routes as RouteEntry[]).sort((a, b) =>
      `${a.path}\t${a.module}`.localeCompare(`${b.path}\t${b.module}`),
    );
    const expected = readManifest()
      .filter(({ module }) => module.startsWith("."))
      .sort((a, b) =>
        `${a.path}\t${a.module}`.localeCompare(`${b.path}\t${b.module}`),
      );

    expect(actual).toEqual(expected);
  });
});
