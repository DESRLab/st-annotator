import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const versions = args.filter((arg) => arg !== "--dry-run");
if (
  versions.length !== 1 ||
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(versions[0])
) {
  console.error("Usage: bash scripts/set-version.sh <major.minor.patch> [--dry-run]");
  process.exit(2);
}
const version = versions[0];
const root = process.cwd();
const changes = new Map();
const read = (file) => readFile(path.join(root, file), "utf8");
const stage = (file, before, after) => {
  if (before !== after) changes.set(file, after);
};
const directories = async (parent) =>
  (await readdir(path.join(root, parent), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parent}/${entry.name}`)
    .sort();

const plugins = await directories("plugins");
const distributions = await directories("distributions");
const frontendFiles = [
  "package.json",
  "config/js/package.json",
  "core/frontend/package.json",
  ...plugins.map((dir) => `${dir}/frontend/package.json`),
  ...distributions.map((dir) => `${dir}/frontend/package.json`),
  "tests/frontend/package.json",
];
const manifests = await Promise.all(
  frontendFiles.map(async (file) => {
    const before = await read(file);
    return { file, before, manifest: JSON.parse(before) };
  }),
);
const names = new Set(manifests.map(({ manifest }) => manifest.name));
const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
function updateManifest(manifest) {
  if (manifest.version !== undefined) manifest.version = version;
  for (const section of dependencySections) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (!names.has(name) || specifier.startsWith("file:")) continue;
      // Preserve the workspace's exact, caret, or tilde range policy.
      if (!/^[~^]?\d+\.\d+\.\d+$/.test(specifier)) {
        throw new Error(`Unsupported internal dependency range: ${name}@${specifier}`);
      }
      manifest[section][name] = specifier.replace(/\d+\.\d+\.\d+$/, version);
    }
  }
}
for (const { file, before, manifest } of manifests) {
  updateManifest(manifest);
  stage(file, before, `${JSON.stringify(manifest, null, 2)}\n`);
}

const backendFiles = [
  "core/backend/pyproject.toml",
  ...plugins.map((dir) => `${dir}/backend/pyproject.toml`),
  "tests/backend/pyproject.toml",
];
const backendNames = new Set();
for (const file of backendFiles) {
  const before = await read(file);
  const project = before.match(/^\[project\]\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
  const name = project?.match(/^name = "([^"]+)"$/m)?.[1];
  if (!name || !/^version = "[^"]+"$/m.test(project)) {
    throw new Error(`Missing project name or version in ${file}`);
  }
  backendNames.add(name);
  stage(
    file,
    before,
    before.replace(project, project.replace(/^version = "[^"]+"$/m, `version = "${version}"`)),
  );
}

// Only workspace metadata changes; third-party resolution stays untouched.
const npmBefore = await read("package-lock.json");
const npmLock = JSON.parse(npmBefore);
npmLock.version = version;
for (const { file } of manifests) {
  const key = file === "package.json" ? "" : path.posix.dirname(file);
  if (!npmLock.packages[key]) throw new Error(`Missing npm lock entry: ${key}`);
  updateManifest(npmLock.packages[key]);
}
stage("package-lock.json", npmBefore, `${JSON.stringify(npmLock, null, 2)}\n`);
const uvBefore = await read("uv.lock");
const uvAfter = uvBefore.replace(
  /^(name = "([^"]+)"\r?\n)version = "[^"]+"/gm,
  (match, prefix, name) =>
    backendNames.has(name) ? `${prefix}version = "${version}"` : match,
);
stage("uv.lock", uvBefore, uvAfter);

// Read and validate every input before writing any file.
for (const [file, content] of changes) {
  if (!dryRun) await writeFile(path.join(root, file), content);
  console.log(`${dryRun ? "Would update" : "Updated"} ${file}`);
}
console.log(`${dryRun ? "Previewed" : "Set"} STA version ${version} (${changes.size} files).`);
