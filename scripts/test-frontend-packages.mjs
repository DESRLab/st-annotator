import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sta-packages-"));
const packageDirectories = {
  sta: "core/frontend",
  "sta-pcd": "plugins/pcd/frontend",
  "sta-gmesh": "plugins/gmesh/frontend",
  "sta-bbox": "plugins/bbox/frontend",
  "sta-segmentation": "plugins/segmentation/frontend",
  "sta-vector": "plugins/vector/frontend",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: path.join(temporaryRoot, "npm-cache"),
    },
    maxBuffer: 20 * 1024 * 1024,
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  return result.stdout;
}

try {
  run("bash", ["scripts/build-dev.sh"]);
  const tarballs = {};
  for (const [name, directory] of Object.entries(packageDirectories)) {
    run(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", temporaryRoot],
      {
        cwd: path.join(root, directory),
        capture: true,
      },
    );
    const manifest = JSON.parse(
      await readFile(path.join(root, directory, "package.json"), "utf8"),
    );
    tarballs[name] = path.join(
      temporaryRoot,
      `${name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`,
    );
  }

  const scenarios = {
    core: ["sta"],
    pcd: ["sta", "sta-pcd"],
    gmesh: ["sta", "sta-gmesh"],
    bbox: ["sta", "sta-pcd", "sta-gmesh", "sta-bbox"],
    segmentation: ["sta", "sta-pcd", "sta-segmentation"],
    vector: ["sta", "sta-pcd", "sta-gmesh", "sta-vector"],
    full: Object.keys(packageDirectories),
  };
  for (const [scenario, names] of Object.entries(scenarios)) {
    const fixture = path.join(temporaryRoot, scenario);
    await mkdir(fixture);
    await writeFile(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: `sta-package-test-${scenario}`, private: true }),
    );
    run(
      "npm",
      [
        "install",
        "--ignore-scripts",
        // Match the repository's committed npm policy. Plugin packages declare
        // host-provided peers and should not make this isolated export check
        // resolve or download a second copy of them.
        "--legacy-peer-deps",
        "--package-lock=false",
        ...names.map((name) => tarballs[name]),
      ],
      { cwd: fixture },
    );
    const imports = names.flatMap((name) =>
      name === "sta" ? ["sta/app", "sta/client"] : [`${name}/app`],
    );
    const check = imports
      .map(
        (specifier) =>
          `console.log(import.meta.resolve(${JSON.stringify(specifier)}));`,
      )
      .concat([
        `const client = await import("sta/client");`,
        `if (typeof client !== "object") throw new Error("sta/client did not load");`,
      ])
      .join("\n");
    run("node", ["--input-type=module", "--eval", check], { cwd: fixture });
  }
  console.log("All isolated frontend package installation scenarios passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
