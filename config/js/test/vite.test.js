import assert from "node:assert/strict";
import test from "node:test";

import { pluginViteConfig, resolvePackageRoot } from "../lib/vite/index.js";

const frontendDir = decodeURIComponent(
  new URL("../../../core/frontend/", import.meta.url).pathname,
);

test("plugin config pins shared UI packages to the host", () => {
  const config = pluginViteConfig({ frontendDir })({
    mode: "test",
    command: "serve",
  });
  const alias = /** @type {Record<string, string>} */ (config.resolve?.alias);
  assert.equal(alias.react, resolvePackageRoot(frontendDir, "react"));
  assert.equal(
    alias["react-dom"],
    resolvePackageRoot(frontendDir, "react-dom"),
  );
  assert.equal(
    alias["slickgrid-react"],
    resolvePackageRoot(frontendDir, "slickgrid-react"),
  );
});

test("plugin config supports disabling UI aliases", () => {
  const config = pluginViteConfig({
    frontendDir,
    includeReactAliases: false,
    includeSlickgridReactAlias: false,
  })({ mode: "test", command: "serve" });
  const alias = /** @type {Record<string, string>} */ (config.resolve?.alias);
  assert.equal(alias.react, undefined);
  assert.equal(alias["react-dom"], undefined);
  assert.equal(alias["slickgrid-react"], undefined);
});

test("plugin config rejects unsupported modes", () => {
  const createConfig = pluginViteConfig({ frontendDir });
  assert.throws(
    () => createConfig({ mode: "production", command: "build" }),
    /Invalid mode: production/,
  );
});
