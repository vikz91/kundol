import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "eslint.config.mjs"],
  extends: [js.configs.recommended, tseslint.configs.recommended],
});
