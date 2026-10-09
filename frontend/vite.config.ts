import { findUp } from "find-up";
import fs from "node:fs";
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { type UserConfig, defineConfig } from "vite";

import { libConfig } from 'sta-config/vite';

export const CONFIG_FILENAMES = [
  "sta.config.ts",
  "sta.config.mts",
  "sta.config.cts",
  "sta.config.js",
  "sta.config.mjs",
  "sta.config.cjs",
];

/**
 * Creates a Vite config for the react-router app.
 */
async function createAppConfig(): Promise<UserConfig> {
  const shimDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "app",
  );
  const shimPath = path.join(shimDir, "sta-config.shim.ts");

  const configPath = await findUp(CONFIG_FILENAMES);
  if (!configPath) {
    throw new Error("Cannot find STA configuration file (sta.config.ts/js).");
  }

  // Write a shim with a relative import so the internal vite-node runner used
  // by @react-router/dev (configFile:false, plugins:[]) resolves it normally.
  const relPath = path.relative(shimDir, configPath).replace(/\\/g, "/").replace(/\.(ts|mts|cts)$/, "");
  fs.writeFileSync(
    shimPath,
    `// AUTO-GENERATED — do not edit\nexport { default } from "./${relPath}";\n`,
  );

  return defineConfig({
    plugins: [reactRouter()],
  }) as UserConfig;
}

export default defineConfig(({ mode }) => {
    if (mode === 'development') {
        return createAppConfig();
    }

    if (mode === 'lib' || mode === 'test') {
        return libConfig({
            name: 'sta',
            entry: {
                'client': './client/index.ts',
                'common/spatial': './lib/common/lib/spatial/index.js',
                'common/widgets': './lib/common/lib/widgets/index.js',
                'common/utils': './lib/common/lib/utils/index.js',
                'common/testing': './lib/common/lib/testing/index.js',
                'services/account': './lib/services/account/lib/index.js',
                'services/auth': './lib/services/auth/lib/index.js',
                'services/editor/base': './lib/services/editor/lib/base/index.js',
                'services/editor/core': './lib/services/editor/lib/core/index.js',
                'services/editor/testing': './lib/services/editor/lib/testing/index.js',
                'services/editor/static': './lib/services/editor/static/index.js',
                'services/label': './lib/services/label/lib/index.js',
                'services/project': './lib/services/project/lib/index.js',
                'services/source': './lib/services/source/lib/index.js',
            },
        });
    }

    throw new Error(`Invalid mode: ${mode}`);
});
