import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/types/**", "src/**/*.d.ts"],
      // Floors, not targets. Raise them as coverage improves; never lower them
      // to make a red build green.
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60,
        "src/validation/**": { lines: 85, functions: 85, statements: 85, branches: 70 },
        "src/export/**": { lines: 85, functions: 85, statements: 85, branches: 70 },
      },
    },
  },
});
