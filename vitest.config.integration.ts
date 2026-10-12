import { defineConfig, mergeConfig } from "vitest/config";
import e2eConfig from "./vitest.config.e2e.js";

export default mergeConfig(
  e2eConfig,
  defineConfig({
    test: {
      include: ["src/**/*.integration-spec.ts"],
      exclude: ["**/*.e2e-spec.ts"],
      hookTimeout: 20_000,
      testTimeout: 10_000,
    },
  }),
);
