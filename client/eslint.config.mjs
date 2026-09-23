import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { boundaryConfigs } from "./eslint.boundaries.mjs";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "*.config.js",
      "*.config.ts",
      "*.config.mjs",
      "eslint.boundaries.mjs",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
        ecmaFeatures: { jsx: true },
      },
      globals: {
        __DEV__: "readonly",
        // Metro inlines process.env at build time; Buffer is polyfilled by
        // the React Native runtime.
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // React Native resolves static assets through require(), e.g.
      // require("../../assets/puck.png"). There is no import equivalent that
      // Metro can bundle.
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Build tooling: babel/metro/tailwind configs and Expo config plugins are
  // CommonJS running under Node, not app code.
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs", "plugins/**", "scripts/**"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  ...boundaryConfigs,
);
