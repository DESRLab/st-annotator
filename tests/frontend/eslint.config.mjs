import { createConfig, disableTypeChecked } from "sta-config/eslint";

export default createConfig({
  // The Playwright sources are not covered by any tsconfig project (only
  // the type-contracts files are type-checked, via tsconfig.type-contracts.json),
  // so they cannot be linted with type information. Lint them without it.
  files: ["**/*.{ts,tsx}"],
  extends: [disableTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: false,
    },
  },
});
