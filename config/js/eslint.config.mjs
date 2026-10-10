import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import chaiFriendly from "eslint-plugin-chai-friendly";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import process from "node:process";
import tseslint from "typescript-eslint";

const sharedConfig = [
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        // Type-aware linting resolves each file's tsconfig through the
        // TypeScript project service. The project root is inferred as
        // the working directory, which is the linted package (all lint
        // scripts run from the package directory).
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
  },
  // After the type-checked config so that its chai-aware replacement of
  // `no-unused-expressions` wins over `@typescript-eslint/no-unused-expressions`.
  chaiFriendly.configs.recommendedFlat,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },

      ecmaVersion: "latest",
      sourceType: "module",
    },

    settings: {
      jsdoc: {
        mode: "typescript",
      },
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },

    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            "vite.config.js",
            "vite.config.ts",
            "**/test/**/*.js",
            "**/*.ts",
            "**/*.tsx",
          ],
        },
      ],

      "import/no-unresolved": [
        "error",
        {
          ignore: [
            "^sta(?:/|-)",
            "^@slickgrid-universal/common$",
            "^eslint(?:/|$)",
            "^http-status-codes$",
            "^jquery$",
            "^jstree$",
            "^lodash$",
            "^mathjs$",
            "^react$",
            "^react-bootstrap$",
            "^react-dom$",
            "^react-router$",
            "^three$",
            "^ts-bidirectional-map$",
            "^tweakpane$",
            "^typescript-collections$",
            "^typescript-eslint$",
            "^uuid$",
            "^zod$",
            "^@react-router/dev(?:/|$)",
          ],
        },
      ],

      "no-unused-vars": [
        "error",
        {
          args: "none",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "no-unused-private-class-members": "off",
      "import/no-unresolved": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "none",
          varsIgnorePattern: "^_",
        },
      ],

      // The `any`-hygiene and related families are deferred: the codebase
      // predates typed linting and trips them thousands of times, almost
      // entirely at untyped third-party interop (slickgrid, arcgis,
      // tweakpane, ...). They are meant to be re-enabled incrementally, not
      // left off forever.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": "off",

      // Deferred stylistic families from stylisticTypeChecked: empty
      // no-op override hooks and getter-exposed class literals are
      // intentional patterns in the editor layer stack, not defects.
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/class-literal-property-style": "off",
    },
  },
  {
    // Test fixtures routinely destructure object methods and pass method
    // references to assertions/mocks, where the receiver is irrelevant.
    files: ["**/test/**"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    ...jsdoc.configs["flat/recommended-typescript-flavor"],
    files: ["**/*.{js,jsx}"],
    rules: {
      ...jsdoc.configs["flat/recommended-typescript-flavor"].rules,
      // The existing JavaScript sources use TypeScript JSDoc syntax for
      // generic models and event maps. These rules either reject valid
      // project annotations or require prose that is not part of the
      // established documentation convention.
      "jsdoc/check-param-names": "off",
      "jsdoc/reject-any-type": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/tag-lines": [
        "warn",
        "never",
        {
          startLines: 1,
        },
      ],
      "jsdoc/ts-no-empty-object-type": "off",
      "jsdoc/valid-types": "off",
    },
  },
];

// Re-exported for packages that do not depend on typescript-eslint
// themselves but need to opt sources without type information out of the
// type-checked rules (see the file-scoping notes in createConfig consumers).
export const disableTypeChecked = tseslint.configs.disableTypeChecked;

// three.js / React boundary: React components must never import three.js.
// Plain (vanilla) state crosses into components; the imperative layer alone
// updates three.js objects. See docs/dev/conventions.md,
// "three.js / React separation".
//
// Exported because `no-restricted-imports` options are replaced, not merged,
// by a later flat-config block for the same file: a package that adds its own
// restriction for `**/*.{ts,tsx}` must spread this list into its own patterns
// or the boundary silently disappears from its React modules.
export const threeBoundaryPatterns = [
  {
    group: ["three", "three/*"],
    message:
      "React components (*.react.tsx / *.react.ts) must not import three.js. Pass plain state across the boundary and let the imperative layer update three.js (docs/dev/conventions.md: 'three.js / React separation').",
  },
];

export function createConfig(...configs) {
  return defineConfig([
    globalIgnores([
      ".react-router/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "docs/_build/**",
      "playwright-report*/**",
      "test-results/**",
    ]),
    ...sharedConfig,
    {
      // three.js / React boundary: React components must never import
      // three.js. Plain (vanilla) state crosses into components; the
      // imperative layer alone updates three.js objects. See
      // docs/dev/conventions.md, "three.js / React separation".
      files: ["**/*.react.tsx", "**/*.react.ts"],
      rules: {
        "no-restricted-imports": ["error", { patterns: threeBoundaryPatterns }],
      },
    },
    ...configs,
  ]);
}

export default createConfig();
