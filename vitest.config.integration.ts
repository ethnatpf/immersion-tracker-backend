import { defineConfig, mergeConfig } from "vitest/config";
import httpConfig from "./vitest.config.http.js";

export default mergeConfig(
  httpConfig,
  defineConfig({
    test: {
      include: ["src/**/*.integration-spec.ts"],
      exclude: ["**/*.http-spec.ts"],
      hookTimeout: 20_000,
      testTimeout: 10_000,
    },
  }),
);
