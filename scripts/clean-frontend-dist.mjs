import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageDir = path.resolve(process.argv[2] ?? ".");
const allowedPackageDirs = new Set([
  path.join(repoRoot, "core/frontend"),
  path.join(repoRoot, "plugins/bbox/frontend"),
  path.join(repoRoot, "plugins/gmesh/frontend"),
  path.join(repoRoot, "plugins/pcd/frontend"),
  path.join(repoRoot, "plugins/segmentation/frontend"),
  path.join(repoRoot, "plugins/vector/frontend"),
]);

if (!allowedPackageDirs.has(packageDir)) {
  throw new Error(
    `Refusing to clean an unknown frontend package: ${packageDir}`,
  );
}

// The live development watcher must keep package entry points available to Vite
// while TypeScript recompiles them. Explicit package builds still clean dist.
if (process.env.STA_PRESERVE_FRONTEND_DIST === "1") process.exit(0);

await rm(path.join(packageDir, "dist"), { recursive: true, force: true });
