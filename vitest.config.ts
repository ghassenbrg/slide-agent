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
      // `src/index.ts` is a re-export barrel with nothing to execute, and
      // `src/cli.ts` is driven eighteen times by `cli-contract.test.ts` — but
      // through `execFile`, in a subprocess v8 cannot instrument, so including
      // it would report 0% for code that is well covered. The CLI's real check
      // is that integration suite, not this number.
      exclude: ["src/types/**", "src/**/*.d.ts", "src/index.ts", "src/cli.ts"],
      /**
       * Floors, not targets. Raise them as coverage improves; never lower them
       * to make a red build green.
       *
       * They sit a few points under what is actually achieved, so ordinary
       * churn does not break the build while a real regression still does.
       * 100% is deliberately not the goal: v8 counts every `??`, `?.`, and
       * `.catch()` as a branch, and reaching them all would mean tests that
       * simulate filesystem and network failures to assert nothing. The number
       * is useful for finding code nobody exercised — which is how the
       * `p:blipFill` crop bug and the symbol id collision were found — not as a
       * score to maximise.
       *
       * A floor also has to hold on the runners that have no LibreOffice — CI
       * installs the preview tools on Linux only. Code reachable solely through
       * a real render is dead on the other two, so every number here is the one
       * the *least* equipped machine can reach, not the one this laptop reports.
       */
      thresholds: {
        lines: 85,
        functions: 84,
        statements: 82,
        branches: 69,
        "src/validation/**": { lines: 92, functions: 95, statements: 89, branches: 78 },
        "src/export/**": { lines: 89, functions: 91, statements: 86, branches: 74 },
        "src/design/**": { lines: 92, functions: 92, statements: 90, branches: 80 },
        "src/contract/**": { lines: 96, functions: 89, statements: 94, branches: 80 },
        "src/layouts/**": { lines: 90, functions: 89, statements: 86, branches: 68 },
        "src/components/**": { lines: 91, functions: 92, statements: 90, branches: 75 },
        "src/evaluation/**": { lines: 96, functions: 96, statements: 94, branches: 69 },
        // Two of the packet's 21 functions read the per-slide fidelity
        // comparison, which `compareRenderedText` leaves empty when no text
        // extractor exists — so 19/21 is the ceiling without LibreOffice.
        "src/review/**": { lines: 90, functions: 88, statements: 88, branches: 62 },
      },
    },
  },
});
