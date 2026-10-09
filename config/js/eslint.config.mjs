import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import chaiFriendly from "eslint-plugin-chai-friendly";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";

const sharedConfig = [
    js.configs.recommended,
    chaiFriendly.configs.recommendedFlat,
    importPlugin.flatConfigs.recommended,
    jsdoc.configs["flat/recommended-typescript-flavor"],
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
        },

        rules: {
            camelcase: ["error", {
                properties: "never",
                ignoreDestructuring: true,
            }],

            "class-methods-use-this": "off",

            "import/no-extraneous-dependencies": ["error", {
                devDependencies: ["vite.config.js", "**/test/**/*.js"],
            }],

            "import/no-unresolved": ["error", {
                ignore: ["^sta-"],
            }],

            "import/prefer-default-export": "off",
            "max-classes-per-file": "off",
            "no-alert": "off",
            "no-console": "off",
            "no-empty-function": "off",
            "no-labels": "off",
            "no-lone-blocks": "off",
            "no-lonely-if": "off",

            "no-multi-assign": ["error", {
                ignoreNonDeclaration: true,
            }],

            "no-param-reassign": ["error", {
                props: false,
            }],

            "no-plusplus": ["error", {
                allowForLoopAfterthoughts: true,
            }],

            "no-restricted-globals": ["error", "isNaN", "isFinite"],
            "no-restricted-syntax": "off",
            "no-underscore-dangle": "off",

            "no-unused-vars": ["error", {
                args: "none",
            }],

            "no-use-before-define": ["error", "nofunc"],
            "no-useless-constructor": "off",
            "object-shorthand": ["error", "consistent-as-needed"],
            "prefer-destructuring": "off",

            yoda: ["error", "never", {
                exceptRange: true,
            }],

            "function-call-argument-newline": "off",
            "function-paren-newline": "off",

            indent: ["error", 4, {
                SwitchCase: 1,
            }],

            "no-multi-spaces": ["error", {
                ignoreEOLComments: true,
            }],

            "no-trailing-spaces": ["error", {
                ignoreComments: true,
            }],

            "object-curly-newline": ["error", {
                ObjectPattern: {
                    multiline: true,
                },
            }],

            "padded-blocks": ["error", {
                blocks: "never",
                switches: "never",
            }],

            "jsdoc/tag-lines": ["warn", "never", {
                startLines: 1,
            }],
        },
    },
];

export function createConfig(...configs) {
    return defineConfig([
        globalIgnores(["dist/*"]),
        ...sharedConfig,
        ...configs,
    ]);
}

export default createConfig();