import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

import {
  createConfig,
  threeBoundaryPatterns,
} from "../../config/js/eslint.config.mjs";

// Plugin loading seam: the main frontend imports plugin packages
// (sta-*) only in sta.config.ts. See docs/dev/conventions.md,
// "Plugin loading seam".
const seamPatterns = [
  {
    // Exempt the local generated config shims, whose `sta-*` names would
    // otherwise match the plugin-package pattern.
    group: ["sta-*", "sta-*/**", "!sta-config.shim", "!sta-routes-config.shim"],
    message:
      "The main frontend imports plugin packages (sta-*) only in sta.config.ts (docs/dev/conventions.md: 'Plugin loading seam').",
  },
];

export default createConfig(
  globalIgnores(["client/**", "vite.config.ts"]),
  {
    settings: {
      "import/internal-regex": "^sta(?:/|$)",
    },
  },
  {
    // The tsconfig covers only app/, client/ and lib/; the test tree and
    // the root config modules are not type-checked, so they cannot be
    // linted with type information. Lint them without it instead.
    files: [
      "test/**",
      "sta.config.ts",
      "sta.routes.ts",
      "react-router.config.ts",
      "openapi-ts.config.ts",
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["sta.config.ts", "sta.routes.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: seamPatterns }],
    },
  },
  {
    // `no-restricted-imports` options are replaced rather than merged by the
    // block above, so React modules restate both restrictions: without this
    // the shared three.js boundary would vanish from the main frontend.
    files: ["**/*.react.ts", "**/*.react.tsx"],
    ignores: ["sta.config.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...threeBoundaryPatterns, ...seamPatterns] },
      ],
    },
  },
);
