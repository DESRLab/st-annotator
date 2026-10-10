import { findUp } from "find-up";
import fs from "node:fs";
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { type UserConfig, defineConfig, mergeConfig } from "vite";

import { STA_CONFIG_PATH, VITE_STA_API_BASE_URL } from "./app/envs";
import {
  baseConfig,
  packageAliases,
  resolvePackageRoot,
} from "sta-config/vite";

const frontendDir = path.dirname(new URL(import.meta.url).pathname);
const buildHashPath = path.join(frontendDir, "public", "build-hash.txt");
const BUILD_HASH = fs.existsSync(buildHashPath)
  ? fs.readFileSync(buildHashPath, "utf8").trim()
  : undefined;

export const CONFIG_FILENAMES = [
  "sta.config.ts",
  "sta.config.mts",
  "sta.config.cts",
  "sta.config.js",
  "sta.config.mjs",
  "sta.config.cjs",
];

/**
 * React Router's internal config loader disables this Vite config, so it cannot
 * resolve sta.config.ts through aliases. The shim keeps that import relative.
 */
function writeConfigShim(
  shimDir: string,
  shimPath: string,
  configPath: string,
) {
  const relPath = path
    .relative(shimDir, configPath)
    .replace(/\\/g, "/")
    .replace(/\.(ts|mts|cts)$/, "");
  fs.writeFileSync(
    shimPath,
    `// AUTO-GENERATED - do not commit\nexport { default } from "./${relPath}";\n`,
  );
}

async function createAppConfig(): Promise<UserConfig> {
  const repoRoot = path.resolve(frontendDir, "../..");
  const reactBootstrapDir = resolvePackageRoot(frontendDir, "react-bootstrap");
  const restartHooksDir = resolvePackageRoot(frontendDir, "@restart/hooks");
  const restartUiDir = resolvePackageRoot(frontendDir, "@restart/ui");
  const domHelpersDir = resolvePackageRoot(frontendDir, "dom-helpers");
  const reactTransitionGroupDir = resolvePackageRoot(
    frontendDir,
    "react-transition-group",
  );
  const uncontrollableDir = resolvePackageRoot(frontendDir, "uncontrollable");
  const aliases = packageAliases(frontendDir);
  const shimDir = path.join(frontendDir, "app");
  const shimPath = path.join(shimDir, "sta-config.shim.ts");
  const routesShimPath = path.join(shimDir, "sta-routes-config.shim.ts");

  const configuredPath = process.env[STA_CONFIG_PATH];
  const configPath = configuredPath
    ? path.resolve(configuredPath)
    : await findUp(CONFIG_FILENAMES);
  if (!configPath) {
    throw new Error("Cannot find STA configuration file (sta.config.ts/js).");
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`Cannot find STA configuration file: ${configPath}`);
  }

  const routesConfigPath = configPath.replace(
    /\.config(\.[^.]+)$/,
    ".routes$1",
  );
  if (routesConfigPath === configPath || !fs.existsSync(routesConfigPath)) {
    throw new Error(
      `Cannot find STA routes configuration file: ${routesConfigPath}`,
    );
  }

  writeConfigShim(shimDir, shimPath, configPath);
  writeConfigShim(shimDir, routesShimPath, routesConfigPath);
  const compositionCacheKey = path
    .relative(repoRoot, configPath)
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  return defineConfig({
    cacheDir: path.join(
      repoRoot,
      "node_modules/.vite-sta",
      compositionCacheKey,
    ),
    define: {
      "import.meta.env.VITE_STA_BUILD_HASH": JSON.stringify(BUILD_HASH ?? ""),
      [`import.meta.env.${VITE_STA_API_BASE_URL}`]: JSON.stringify(
        process.env[VITE_STA_API_BASE_URL] ?? "",
      ),
    },
    plugins: [
      reactRouter(),
      {
        name: "sta-drop-disabled-e2e-probe",
        generateBundle(_options, bundle) {
          if (process.env.VITE_STA_E2E_PROBE === "1") return;
          for (const [fileName, output] of Object.entries(bundle)) {
            if (
              output.type === "chunk" &&
              output.moduleIds.some((id) => id.endsWith("/e2eProbe.ts"))
            ) {
              delete bundle[fileName];
            }
          }
        },
      },
    ],
    optimizeDeps: {
      // React Router discovers plugin route modules only after navigation.
      // Scan the repository's potential route sources up front so late route
      // discovery cannot invalidate chunks already loaded by the browser.
      entries: [
        path.join(frontendDir, "app/**/*.{ts,tsx}"),
        path.join(repoRoot, "plugins/*/frontend/app/**/*.{ts,tsx}"),
        configPath,
      ],
    },
    resolve: {
      dedupe: ["react", "react-dom", "react-router"],
      alias: [
        // Plugin packages are built artifacts in the workspace, but their API
        // calls must share core's configured client singleton while bundled
        // into a host application.
        {
          find: /^sta\/client$/,
          replacement: path.join(frontendDir, "lib/client-plugin.ts"),
        },
        {
          find: /^sta\/client-instance$/,
          replacement: path.join(frontendDir, "client/client.gen.ts"),
        },
        {
          find: /^sta\/app$/,
          replacement: path.join(frontendDir, "app/plugin.ts"),
        },
        {
          find: /^sta\/app\/editor$/,
          replacement: path.join(frontendDir, "app/routes/editor/public.ts"),
        },
        // Test helpers are exported from their own subpaths rather than the
        // app-facing barrels, so fast-check/chai never reach a production build.
        {
          find: /^sta\/app\/editor\/testing$/,
          replacement: path.join(
            frontendDir,
            "app/routes/editor/testing/index.tsx",
          ),
        },
        {
          find: /^sta\/app\/(components|models|plugins)$/,
          replacement: path.join(frontendDir, "app/$1/index.ts"),
        },
        {
          find: /^sta\/app\/(.+)$/,
          replacement: path.join(frontendDir, "app/$1"),
        },
        {
          find: /^sta\/common$/,
          replacement: path.join(frontendDir, "lib/common/lib/index.ts"),
        },
        {
          find: /^sta\/common\/testing$/,
          replacement: path.join(
            frontendDir,
            "lib/common/lib/testing/index.ts",
          ),
        },
        {
          find: /^sta\/common\/(.+)$/,
          replacement: path.join(frontendDir, "lib/common/lib/$1"),
        },
        // These packages ship dual CJS/ESM builds whose package metadata lets
        // SSR dev resolution pick the CJS file ("exports is not defined" at
        // runtime), so their imports are forced to the ESM entries.
        {
          find: /^react-bootstrap$/,
          replacement: path.join(reactBootstrapDir, "esm/index.js"),
        },
        {
          find: /^react-bootstrap\/(.+)$/,
          replacement: path.join(reactBootstrapDir, "esm/$1.js"),
        },
        {
          find: /^@restart\/hooks$/,
          replacement: path.join(restartHooksDir, "esm/index.js"),
        },
        {
          find: /^@restart\/hooks\/(.+)$/,
          replacement: path.join(restartHooksDir, "esm/$1.js"),
        },
        {
          find: /^@restart\/ui$/,
          replacement: path.join(restartUiDir, "esm/index.js"),
        },
        {
          find: /^@restart\/ui\/(.+)$/,
          replacement: path.join(restartUiDir, "esm/$1.js"),
        },
        {
          find: /^dom-helpers$/,
          replacement: path.join(domHelpersDir, "esm/index.js"),
        },
        {
          find: /^dom-helpers\/(.+)$/,
          replacement: path.join(domHelpersDir, "esm/$1.js"),
        },
        {
          find: /^react-transition-group$/,
          replacement: path.join(reactTransitionGroupDir, "esm/index.js"),
        },
        {
          find: /^react-transition-group\/(.+)$/,
          replacement: path.join(reactTransitionGroupDir, "esm/$1.js"),
        },
        {
          find: /^uncontrollable$/,
          replacement: path.join(uncontrollableDir, "lib/esm/index.js"),
        },
        // tweakpane-table declares neither "type" nor an "exports" map, so Node
        // resolves it to its UMD/CJS `main`, which require()s the ESM-only
        // @tweakpane/core and aborts SSR with ERR_REQUIRE_CYCLE_MODULE. Its
        // `module` build is genuine ESM, so pin resolution to that instead.
        {
          find: /^tweakpane-table$/,
          replacement: path.join(
            resolvePackageRoot(frontendDir, "tweakpane-table"),
            "dist/tweakpane-table.mjs",
          ),
        },
        {
          find: "slickgrid-react",
          replacement: resolvePackageRoot(frontendDir, "slickgrid-react"),
        },
        ...Object.entries(aliases).map(([find, replacement]) => ({
          find,
          replacement,
        })),
      ],
    },
    ssr: {
      optimizeDeps: {
        include: [
          "@popperjs/core",
          "lodash",
          "ts-bidirectional-map",
          "typescript-collections",
        ],
      },
      noExternal: [
        // Bundle dependencies whose published module shape Node cannot load
        // directly in this SSR graph. This also gives Lodash default-import
        // interop matching the browser build.
        "@popperjs/core",
        "lodash",
        "ts-bidirectional-map",
        "typescript-collections",
        "react-bootstrap",
        "@restart/hooks",
        "@restart/ui",
        "dom-helpers",
        "react-transition-group",
        "uncontrollable",
        // Bundled so the ESM alias above survives into the server build; left
        // external, Vite emits the bare specifier and Node picks the CJS main.
        "tweakpane-table",
      ],
    },
    server: {
      // The backend's default CORS allowlist expects this exact origin, so
      // the port is pinned and auto-assigning another one is an error.
      port: 5173,
      strictPort: true,
      fs: {
        allow: [repoRoot],
      },
    },
  }) as UserConfig;
}

export default defineConfig(({ mode }) => {
  if (mode === "development" || mode === "production") {
    return createAppConfig();
  }

  if (mode === "test") {
    const frontendDir = path.dirname(new URL(import.meta.url).pathname);
    return mergeConfig(baseConfig(), {
      resolve: {
        alias: packageAliases(frontendDir, {
          includeReactAliases: true,
        }),
      },
    });
  }

  throw new Error(`Invalid mode: ${mode}`);
});
