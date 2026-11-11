// ESLint v9 flat config (mirrors mvp `functions/eslint.config.mjs`).
// Minimal typescript-eslint setup enforcing the parts of the project style
// that are already consistent: semicolons and 2-space indent.
//
// Quote style is DELIBERATELY not enforced: the codebase is mixed — the large
// majority is double-quoted, but a few files (src/auth/firebaseConfig.ts,
// src/fiel/decode.ts, a handful of strings in src/onboard/server.ts) use single
// quotes. Enforcing either direction fails on the existing code, and the lint
// gate must pass without a mass reformat. Standardize with a formatter (e.g.
// prettier) or `npx eslint src --fix` once a single convention is chosen.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "test/fixtures/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      semi: ["error", "always"],
      indent: ["error", 2, { SwitchCase: 1 }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
