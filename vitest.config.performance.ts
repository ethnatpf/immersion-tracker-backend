import { defineConfig, mergeConfig } from "vitest/config";
import httpConfig from "./vitest.config.http.js";

export default mergeConfig(
  httpConfig,
  defineConfig({
    test: {
      include: ["src/**/*.performance-spec.ts"],
      exclude: ["**/*.http-spec.ts", "**/*.integration-spec.ts"],
      // Avoid competing performance suites distorting the latency measurements.
      fileParallelism: false,
      hookTimeout: 20_000,
      testTimeout: 10_000,
    },
  }),
);
