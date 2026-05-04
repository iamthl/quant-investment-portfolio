import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  // 30 s covers integration tests that wait on a live server + DB.
  // Unit tests finish in < 1 s so the extra headroom is harmless.
  testTimeout: 30_000,
};

export default createJestConfig(config);
