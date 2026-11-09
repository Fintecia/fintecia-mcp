/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { useESM: true, diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testMatch: ["**/test/**/*.test.ts"],
};
