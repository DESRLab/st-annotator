import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../release/set-version.mjs", import.meta.url));

test("version CLI supports partial plugins and preserves third-party locks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sta-version-"));
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  try {
    mkdirSync(path.join(root, "plugins/empty"), { recursive: true });
    mkdirSync(path.join(root, "distributions/empty"), { recursive: true });
    const packages = {};
    for (const [directory, name] of [
      ["", "workspace"],
      ["config/js", "sta-config"],
      ["core/frontend", "sta"],
      ["tests/frontend", "tests"],
      ["plugins/frontend-only/frontend", "sta-frontend-only"],
      ["distributions/full/frontend", "sta-full"],
    ]) {
      const manifest = {
        name,
        version: "1.0.0",
        dependencies: { sta: "^1.0.0", external: "2.0.0" },
      };
      write(path.join(directory, "package.json"), JSON.stringify(manifest));
      packages[directory] = manifest;
    }
    packages["node_modules/external"] = {
      version: "2.0.0",
      integrity: "unchanged",
    };
    write("package-lock.json", JSON.stringify({ version: "1.0.0", packages }));
    const backendNames = ["sta", "sta-tests", "sta-backend-only"];
    for (const [index, directory] of [
      "core/backend",
      "tests/backend",
      "plugins/backend-only/backend",
    ].entries()) {
      write(
        `${directory}/pyproject.toml`,
        `[project]\nname = "${backendNames[index]}"\nversion = "1.0.0"\n`,
      );
    }
    const externalLock = '[[package]]\nname = "external"\nversion = "2.0.0"\n';
    write(
      "uv.lock",
      backendNames
        .map((name) => `[[package]]\nname = "${name}"\nversion = "1.0.0"\n`)
        .join("") + externalLock,
    );
    const before = read("package-lock.json");
    execFileSync(process.execPath, [script, "1.1.0", "--dry-run"], {
      cwd: root,
    });
    assert.equal(read("package-lock.json"), before);
    execFileSync(process.execPath, [script, "1.1.0"], { cwd: root });
    const lock = JSON.parse(read("package-lock.json"));
    for (const directory of Object.keys(packages).filter(
      (key) => !key.startsWith("node_modules/"),
    )) {
      const manifest = JSON.parse(read(path.join(directory, "package.json")));
      assert.equal(manifest.version, "1.1.0");
      assert.equal(manifest.dependencies.sta, "^1.1.0");
      assert.deepEqual(lock.packages[directory], manifest);
    }
    assert.deepEqual(
      lock.packages["node_modules/external"],
      packages["node_modules/external"],
    );
    assert.ok(read("uv.lock").endsWith(externalLock));
    for (const name of backendNames) {
      assert.ok(
        read("uv.lock").includes(`name = "${name}"\nversion = "1.1.0"`),
      );
    }
    assert.match(
      execFileSync(process.execPath, [script, "1.1.0", "--dry-run"], {
        cwd: root,
        encoding: "utf8",
      }),
      /0 files/,
    );
    rmSync(path.join(root, "core/frontend/package.json"));
    assert.notEqual(
      spawnSync(process.execPath, [script, "1.2.0"], { cwd: root }).status,
      0,
    );
    assert.equal(
      read("package-lock.json"),
      JSON.stringify(lock, null, 2) + "\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
