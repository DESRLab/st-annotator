import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageDir = path.resolve(process.argv[2] ?? ".");
const assetExtensions = new Set([
  ".css",
  ".glsl",
  ".json",
  ".png",
  ".scss",
  ".svg",
  ".wasm",
]);

async function copyAssets(sourceDir) {
  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      await copyAssets(sourcePath);
      continue;
    }
    if (!assetExtensions.has(path.extname(entry.name))) continue;

    const relativePath = path.relative(packageDir, sourcePath);
    const destinationPath = path.join(packageDir, "dist", relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
  }
}

await Promise.all([
  copyAssets(path.join(packageDir, "app")),
  copyAssets(path.join(packageDir, "client")),
  copyAssets(path.join(packageDir, "lib")),
  copyAssets(path.join(packageDir, "models")),
]);

async function listJavaScript(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listJavaScript(entryPath)));
    else if (entry.name.endsWith(".js")) files.push(entryPath);
  }
  return files;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function rewriteRelativeImports(file) {
  const source = await readFile(file, "utf8");
  const pattern =
    /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(["'])(\.\.?\/[^"']+)\2/g;
  const replacements = [];
  for (const match of source.matchAll(pattern)) {
    const specifier = match[3];
    const target = path.resolve(path.dirname(file), specifier);
    const hasJavaScriptExtension = /\.(?:[cm]?js|json|node)$/.test(specifier);
    let replacement;
    if (!hasJavaScriptExtension && (await exists(`${target}.js`)))
      replacement = `${specifier}.js`;
    else if (
      !hasJavaScriptExtension &&
      (await exists(path.join(target, "index.js")))
    )
      replacement = `${specifier}/index.js`;
    if (replacement)
      replacements.push({
        end: match.index + match[1].length + 1 + specifier.length,
        start: match.index + match[1].length + 1,
        value: replacement,
      });
  }
  if (!replacements.length) return;
  let rewritten = source;
  for (const replacement of replacements.reverse()) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      replacement.value +
      rewritten.slice(replacement.end);
  }
  await writeFile(file, rewritten);
}

await Promise.all(
  (await listJavaScript(path.join(packageDir, "dist"))).map(
    rewriteRelativeImports,
  ),
);
