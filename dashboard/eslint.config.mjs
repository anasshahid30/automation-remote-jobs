import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([".next/**", "next-env.d.ts", "coverage/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ["**/*.ts", "**/*.tsx"], plugins: { "@next/next": next }, rules: {
    ...next.configs.recommended.rules,
    ...next.configs["core-web-vitals"].rules,
  } },
]);
