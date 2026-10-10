import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import semver from "semver";

const root = process.cwd();
const packagePaths = {
  sta: "core/frontend/package.json",
  "sta-bbox": "plugins/bbox/frontend/package.json",
  "sta-gmesh": "plugins/gmesh/frontend/package.json",
  "sta-pcd": "plugins/pcd/frontend/package.json",
  "sta-segmentation": "plugins/segmentation/frontend/package.json",
  "sta-vector": "plugins/vector/frontend/package.json",
};
const manifests = Object.fromEntries(
  await Promise.all(
    Object.entries(packagePaths).map(async ([name, file]) => [
      name,
      JSON.parse(await readFile(path.join(root, file), "utf8")),
    ]),
  ),
);
const failures = [];
const core = manifests.sta;

for (const [name, plugin] of Object.entries(manifests).filter(
  ([name]) => name !== "sta",
)) {
  if (core.dependencies?.[name])
    failures.push(`core must not depend on optional plugin ${name}`);
  if (plugin.peerDependencies?.sta !== `^${core.version}`)
    failures.push(`${name} must peer-depend on sta@^${core.version}`);
  if (plugin.devDependencies?.sta !== `^${core.version}`)
    failures.push(`${name} must use sta@^${core.version} for development`);
  const range = plugin.peerDependencies?.["@slickgrid-universal/common"];
  if (
    range &&
    !semver.satisfies(core.dependencies["@slickgrid-universal/common"], range)
  ) {
    failures.push(
      `${name} has Slickgrid peer ${range}; core declares ${core.dependencies["@slickgrid-universal/common"]}`,
    );
  }
}

for (const [name, manifest] of Object.entries(manifests)) {
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ]) {
    for (const [dependency, specifier] of Object.entries(
      manifest[section] ?? {},
    )) {
      if (String(specifier).startsWith("file:"))
        failures.push(`${name} ${section}.${dependency} uses a local path`);
    }
  }
  for (const target of Object.values(manifest.exports ?? {})) {
    if (typeof target === "string" || !target.import) continue;
    for (const relativeTarget of [target.import, target.types].filter(
      Boolean,
    )) {
      try {
        await access(
          path.join(root, path.dirname(packagePaths[name]), relativeTarget),
        );
      } catch {
        failures.push(`${name} export target is missing: ${relativeTarget}`);
      }
    }
  }
}

const prerequisites = {
  "sta-bbox": ["sta-gmesh", "sta-pcd"],
  "sta-gmesh": [],
  "sta-pcd": [],
  "sta-segmentation": ["sta-pcd"],
  "sta-vector": ["sta-gmesh", "sta-pcd"],
};
for (const [plugin, dependencies] of Object.entries(prerequisites)) {
  for (const dependency of dependencies) {
    if (manifests[plugin].dependencies?.[dependency] !== `^${manifests[dependency].version}`)
      failures.push(`${plugin} must install ${dependency}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Frontend dependency contracts and built exports are valid.");
}
