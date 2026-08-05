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
        lines: 80,
        functions: 80,
        statements: 78,
        branches: 65,
        "src/validation/**": { lines: 88, functions: 88, statements: 85, branches: 75 },
        "src/export/**": { lines: 85, functions: 85, statements: 85, branches: 70 },
        "src/design/**": { lines: 90, functions: 90, statements: 90, branches: 80 },
        "src/contract/**": { lines: 85, functions: 80, statements: 85, branches: 70 },
      },
    },
  },
});
