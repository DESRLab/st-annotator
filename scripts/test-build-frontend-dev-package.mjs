import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const builder = fileURLToPath(
  new URL("./build-frontend-dev-package.mjs", import.meta.url),
);
const fixedTime = new Date("2000-01-01T00:00:00Z");

test("a staged build preserves existing package output when sources are unchanged", () => {
  const { directory, build } = fixture();
  try {
    const compiler = createRequire(import.meta.url).resolve(
      "typescript/bin/tsc",
    );
    const assets = fileURLToPath(
      new URL("./copy-frontend-assets.mjs", import.meta.url),
    );
    for (const args of [
      [compiler, "-p", "tsconfig.build.json"],
      [assets, directory],
    ]) {
      const result = spawnSync(process.execPath, args, {
        cwd: directory,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const files = readdirSync(path.join(directory, "dist/app"));
    for (const file of files)
      utimesSync(path.join(directory, "dist/app", file), fixedTime, fixedTime);
    const result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /0 changed files/);
    for (const file of files)
      assert.equal(
        statSync(path.join(directory, "dist/app", file)).mtimeMs,
        fixedTime.getTime(),
        file,
      );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "sta-dev-package-"));
  const write = (file, content) => {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write(
    "tsconfig.build.json",
    JSON.stringify({
      include: ["app"],
      compilerOptions: {
        rootDir: ".",
        outDir: "dist",
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        types: [],
        skipLibCheck: true,
      },
    }),
  );
  write("app/index.ts", 'export { label } from "./label";\n');
  write("app/label.ts", 'export const label = "Select";\n');
  write("app/style.css", ".action { color: red; }\n");
  const build = () =>
    spawnSync(process.execPath, [builder, directory], { encoding: "utf8" });
  return { directory, write, build };
}

test("live builds leave unchanged modules and assets untouched after a label edit", () => {
  const { directory, write, build } = fixture();
  try {
    let result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const unchanged = [
      "dist/app/index.js",
      "dist/app/style.css",
      "dist/app/index.js.map",
    ];
    for (const file of unchanged)
      utimesSync(path.join(directory, file), fixedTime, fixedTime);
    write("dist/.source-fingerprint", "keep watcher metadata\n");
    write("app/label.ts", 'export const label = "S";\n');
    result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const file of unchanged) {
      assert.equal(
        statSync(path.join(directory, file)).mtimeMs,
        fixedTime.getTime(),
        file,
      );
    }
    assert.match(
      readFileSync(path.join(directory, "dist/app/label.js"), "utf8"),
      /"S"/,
    );
    assert.match(
      readFileSync(path.join(directory, "dist/app/index.js"), "utf8"),
      /"\.\/label\.js"/,
    );
    const map = JSON.parse(
      readFileSync(path.join(directory, "dist/app/index.js.map"), "utf8"),
    );
    assert.equal(
      path.resolve(directory, "dist/app", map.sources[0]),
      path.join(directory, "app/index.ts"),
    );
    assert.equal(
      readFileSync(path.join(directory, "dist/.source-fingerprint"), "utf8"),
      "keep watcher metadata\n",
    );
    assert.equal(
      readdirSync(directory).some((name) => name.startsWith(".sta-dev-dist-")),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a failed compile keeps the live package intact and removes staging output", () => {
  const { directory, write, build } = fixture();
  try {
    let result = build();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const target = path.join(directory, "dist/app/label.js");
    const before = readFileSync(target);
    utimesSync(target, fixedTime, fixedTime);
    write("app/label.ts", 'export const label: number = "invalid";\n');
    result = build();
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(target), before);
    assert.equal(statSync(target).mtimeMs, fixedTime.getTime());
    assert.equal(
      readdirSync(directory).some((name) => name.startsWith(".sta-dev-dist-")),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
