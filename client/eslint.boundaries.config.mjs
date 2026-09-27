import tseslint from "typescript-eslint";
import { boundaryConfigs } from "./eslint.boundaries.mjs";

/** Boundaries only — see the server package for the rationale. */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "*.config.js",
      "*.config.ts",
      "*.config.mjs",
      "eslint.boundaries.mjs",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
        ecmaFeatures: { jsx: true },
      },
    },
  },
  ...boundaryConfigs,
);
