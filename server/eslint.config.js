import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { boundaryConfigs } from "./eslint.boundaries.js";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.config.js", "eslint.boundaries.js"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Augmenting the Express Request type requires `declare global
      // namespace`, which has no ES-module equivalent.
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  ...boundaryConfigs,
);
