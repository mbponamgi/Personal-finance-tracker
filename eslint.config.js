import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        console: "readonly",
        alert: "readonly",
        fetch: "readonly",
        FileReader: "readonly",
        Date: "readonly",
        Math: "readonly",
        JSON: "readonly",
        Set: "readonly",
        Object: "readonly",
        Array: "readonly",
        String: "readonly",
        Number: "readonly",
        Promise: "readonly",
        TextDecoder: "readonly",
        // Third-party libs loaded via CDN
        XLSX: "readonly",
        pdfjsLib: "readonly",
        // App globals defined inline in index.html
        D: "writable",
        currentMember: "writable",
        selectedBank: "writable",
        parsedRows: "writable",
        BANK_CONFIGS: "readonly",
        MEMBER_NAMES: "readonly",
        KEY: "readonly",
      },
    },
    rules: {
      // Security
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      // Common bugs
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "warn",
      // Code quality
      "no-console": "warn",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
    },
  },
];
