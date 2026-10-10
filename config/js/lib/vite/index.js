/**
 * Contains configurations for Vite and Vitest.
 *
 * @module sta-config/vite
 */

/// <reference types="vitest" />
import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import autoprefixer from "autoprefixer";
import { defineConfig, mergeConfig } from "vite";

/**
 * Generates the base configuration.
 *
 * @returns {import('vite').UserConfig} The base configuration.
 */
export function baseConfig() {
  return defineConfig({
    base: "",
    build: {
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    test: {
      coverage: {
        provider: "istanbul",
        reporter: ["text", "html"],
      },
      environment: "jsdom",
    },
    css: {
      postcss: {
        plugins: [autoprefixer({})],
      },
    },
  });
}

/**
 * Creates aliases for package-level imports that need custom Vite entries.
 * The pinned packages resolve to core/frontend/node_modules so that every
 * workspace member shares single instances.
 *
 * @param {string} frontendDir The absolute path of the main frontend package.
 * @param {object} [options]
 * @param {boolean} [options.includeReactAliases] Also pin react and react-dom.
 * @returns {Record<string, string>} The alias map.
 */
export function packageAliases(
  frontendDir,
  { includeReactAliases = false } = {},
) {
  /** @type {Record<string, string>} */
  const aliases = {
    "@slickgrid-universal/common": resolvePackageRoot(
      frontendDir,
      "@slickgrid-universal/common",
    ),
    lodash: resolvePackageRoot(frontendDir, "lodash"),
    mathjs: resolvePackageRoot(frontendDir, "mathjs"),
    three: resolvePackageRoot(frontendDir, "three"),
    tweakpane: resolvePackageRoot(frontendDir, "tweakpane"),
    zod: resolvePackageRoot(frontendDir, "zod"),
  };

  if (includeReactAliases) {
    aliases.react = resolvePackageRoot(frontendDir, "react");
    aliases["react-dom"] = resolvePackageRoot(frontendDir, "react-dom");
  }

  return aliases;
}

/**
 * Resolve a dependency directory using the host frontend's package context.
 *
 * @param {string} frontendDir
 * @param {string} packageName
 * @returns {string}
 */
export function resolvePackageRoot(frontendDir, packageName) {
  const require = createRequire(path.join(frontendDir, "package.json"));
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (
      typeof code !== "string" ||
      !["ERR_PACKAGE_PATH_NOT_EXPORTED", "MODULE_NOT_FOUND"].includes(code)
    )
      throw error;
  }

  let currentDir = path.dirname(require.resolve(packageName));
  while (currentDir !== path.dirname(currentDir)) {
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(currentDir, "package.json"), "utf8"),
      );
      if (manifest.name === packageName) return currentDir;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      if (code !== "ENOENT") throw error;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error(`Cannot resolve package root: ${packageName}`);
}

/**
 * Generates the Vite configuration shared by the plugin frontends. Only the
 * test mode is configured: plugin sources are consumed through package
 * exports everywhere else, so no build mode is needed.
 *
 * @param {object} options
 * @param {string} options.frontendDir The absolute path of the main frontend package.
 * @param {boolean} [options.includeReactAliases] Pin React to the host copy.
 * @param {boolean} [options.includeSlickgridReactAlias] Pin Slickgrid React to the host copy.
 * @returns {import('vite').UserConfigFnObject} The plugin configuration.
 */
export function pluginViteConfig({
  frontendDir,
  includeReactAliases = true,
  includeSlickgridReactAlias = true,
}) {
  return ({ mode }) => {
    if (mode === "test") {
      const alias = packageAliases(frontendDir, { includeReactAliases });
      if (includeSlickgridReactAlias) {
        alias["slickgrid-react"] = resolvePackageRoot(
          frontendDir,
          "slickgrid-react",
        );
      }

      return mergeConfig(
        baseConfig(),
        defineConfig({
          resolve: {
            alias,
          },
        }),
      );
    }

    throw new Error(`Invalid mode: ${mode}`);
  };
}
