/** Rebuild changed development packages and verify production build inputs. */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  ["sta", "core/frontend"],
  ["sta-pcd", "plugins/pcd/frontend"],
  ["sta-gmesh", "plugins/gmesh/frontend"],
  ["sta-bbox", "plugins/bbox/frontend"],
  ["sta-segmentation", "plugins/segmentation/frontend"],
  ["sta-vector", "plugins/vector/frontend"],
];
const sharedPaths = [
  "package-lock.json",
  "config/js",
  "scripts/clean-frontend-dist.mjs",
  "scripts/copy-frontend-assets.mjs",
  "scripts/select-frontend-config.mjs",
];
function sourceFiles(relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [relative];
  if (!statSync(absolute).isDirectory()) return [relative];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith(".env") ||
      [
        "dist",
        "build",
        "node_modules",
        ".react-router",
        "coverage",
        ".git",
      ].includes(entry.name)
    )
      return [];
    const file = `${relative}/${entry.name}`;
    if (
      file === "core/frontend/app/sta-config.shim.ts" ||
      file === "core/frontend/app/sta-routes-config.shim.ts" ||
      file === "core/frontend/public/build-hash.txt" ||
      file.startsWith("core/frontend/client/")
    )
      return [];
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function generatedClientFiles() {
  const base = path.join(root, "core/frontend/client");
  if (!existsSync(base)) return [];
  const visit = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(dir, entry.name);
      return entry.isDirectory()
        ? visit(target)
        : [path.relative(root, target)];
    });
  return visit(base);
}

function fingerprint(paths) {
  const hash = createHash("sha256");
  for (const file of [...new Set(paths)].sort()) {
    hash.update(file);
    const absolute = path.join(root, file);
    hash.update(existsSync(absolute) ? readFileSync(absolute) : "<missing>");
  }
  return hash.digest("hex");
}

function inputs(directory) {
  return [directory, ...sharedPaths]
    .flatMap(sourceFiles)
    .concat(directory === "core/frontend" ? generatedClientFiles() : []);
}

function stampPath(directory) {
  return path.join(root, directory, "dist/.source-fingerprint");
}

function buildChangedPackages({ preserveDist = false } = {}) {
  const rebuilt = new Set();
  for (const [name, directory] of packages) {
    const manifest = JSON.parse(
      readFileSync(path.join(root, directory, "package.json"), "utf8"),
    );
    const dependencies = Object.keys(manifest.dependencies ?? {});
    const current = fingerprint(inputs(directory));
    const stamp = stampPath(directory);
    const stale =
      !existsSync(stamp) || readFileSync(stamp, "utf8").trim() !== current;
    if (!stale && !dependencies.some((dependency) => rebuilt.has(dependency)))
      continue;
    process.stdout.write(`Rebuilding ${name} for the development server...\n`);
    const result = spawnSync(
      "npm",
      ["run", "build:package", `--workspace=${name}`],
      {
        cwd: root,
        env: {
          ...process.env,
          ...(preserveDist ? { STA_PRESERVE_FRONTEND_DIST: "1" } : {}),
        },
        stdio: "inherit",
      },
    );
    if (result.status !== 0) throw new Error(`${name} package build failed`);
    if (name === "sta") {
      const config = path.join(
        root,
        "distributions/full/frontend/sta.config.ts",
      );
      const select = spawnSync(
        "node",
        [
          path.join(root, "scripts/select-frontend-config.mjs"),
          path.join(root, directory),
          config,
        ],
        { cwd: root, stdio: "inherit" },
      );
      if (select.status !== 0)
        throw new Error("Cannot restore the development composition");
    }
    writeFileSync(stamp, `${current}\n`);
    rebuilt.add(name);
  }
}

function productionFingerprint() {
  const relevant = [
    ...packages.map(([, directory]) => directory),
    "distributions/full/frontend",
    "config/js",
    "scripts/build-dev.sh",
    "scripts/build-prod.sh",
    "scripts/frontend-build-freshness.mjs",
    "scripts/generate-frontend-build-hash.mjs",
    "scripts/generate-openapi-client.sh",
    "scripts/export-openapi-client-types.mjs",
    "scripts/clean-frontend-dist.mjs",
    "scripts/copy-frontend-assets.mjs",
    "scripts/select-frontend-config.mjs",
    "package-lock.json",
  ];
  return fingerprint(
    relevant.flatMap(sourceFiles).concat(generatedClientFiles()),
  );
}

const mode = process.argv[2];
const productionStamp = path.join(
  root,
  "core/frontend/build/source-fingerprint",
);
if (mode === "dev-once") buildChangedPackages();
else if (mode === "dev-watch") {
  buildChangedPackages({ preserveDist: true });
  setInterval(() => {
    try {
      buildChangedPackages({ preserveDist: true });
    } catch (error) {
      process.stderr.write(`${error}\n`);
    }
  }, 2000);
} else if (mode === "prod-record")
  writeFileSync(productionStamp, `${productionFingerprint()}\n`);
else if (mode === "prod-check") {
  if (
    !existsSync(productionStamp) ||
    readFileSync(productionStamp, "utf8").trim() !== productionFingerprint()
  ) {
    process.stderr.write(
      "Production frontend build is outdated; run 'bash scripts/build-prod.sh' first.\n",
    );
    process.exitCode = 1;
  }
} else
  throw new Error("Expected dev-once, dev-watch, prod-record, or prod-check");
