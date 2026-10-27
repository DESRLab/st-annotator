/** Compile plugins off the live dist tree, then publish only changed files. */
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript/bin/tsc");
const assets = fileURLToPath(
  new URL("./copy-frontend-assets.mjs", import.meta.url),
);
const packageDir = path.resolve(process.argv[2] ?? ".");

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: packageDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(script)} failed`);
}

async function publish(directory, destination) {
  let changed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    const target = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      changed += await publish(source, target);
      continue;
    }
    const content = await readFile(source);
    let previous;
    try {
      previous = await readFile(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (previous?.equals(content)) continue;
    await mkdir(destination, { recursive: true });
    // Rename a complete file into place so Vite cannot read a partial write.
    const temporary = `${target}.${path.basename(staging)}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, target);
    changed++;
  }
  return changed;
}

// A sibling of dist keeps source/declaration map paths identical after publishing.
const staging = await mkdtemp(path.join(packageDir, ".sta-dev-dist-"));
try {
  run(compiler, [
    "-p",
    "tsconfig.build.json",
    "--outDir",
    staging,
    "--noEmitOnError",
  ]);
  run(assets, [packageDir, staging]);
  const changed = await publish(staging, path.join(packageDir, "dist"));
  process.stdout.write(
    `Development package build complete (${changed} changed files).\n`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
