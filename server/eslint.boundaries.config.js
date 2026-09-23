import tseslint from "typescript-eslint";
import { boundaryConfigs } from "./eslint.boundaries.js";

/**
 * Boundaries only — no style or correctness rules.
 *
 * `npm run lint:boundaries` uses this so an architecture violation fails on
 * its own, without being buried in unrelated lint output.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.config.js", "eslint.boundaries.js"] },
  {
    files: ["**/*.ts"],
    languageOptions: {
      // The full config gets this from tseslint.configs.recommended; this
      // config carries no rule presets, so it supplies the parser itself.
      parser: tseslint.parser,
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
    },
  },
  ...boundaryConfigs,
);
