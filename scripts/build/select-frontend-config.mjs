/**
 * Generates application and route-config shims for a selected frontend
 * composition.
 *
 * Application code imports this stable shim while builds pass the frontend
 * directory and desired `sta.config.*` file as command-line arguments. The
 * generated, untracked re-export lets core-only and distribution builds select
 * different plugin configurations without rewriting application imports.
 */

import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const frontendDir = path.resolve(process.argv[2]);
const configPath = path.resolve(process.argv[3]);
const routesConfigPath = configPath.replace(/\.config(\.[^.]+)$/, ".routes$1");
if (routesConfigPath === configPath) {
  throw new Error(`Cannot derive routes configuration path from ${configPath}`);
}
await access(routesConfigPath);

for (const [shimName, selectedPath] of [
  ["sta-config.shim.ts", configPath],
  ["sta-routes-config.shim.ts", routesConfigPath],
]) {
  const shimPath = path.join(frontendDir, "app", shimName);
  const relativePath = path
    .relative(path.dirname(shimPath), selectedPath)
    .replaceAll(path.sep, "/")
    .replace(/\.(ts|mts|cts)$/, "");

  await writeFile(
    shimPath,
    `// AUTO-GENERATED - do not commit\nexport { default } from "./${relativePath}";\n`,
  );
}
