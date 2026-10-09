import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import ts from "typescript";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    {
      name: "nestjs-decorator-metadata",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith(".ts") || id.includes("/node_modules/")) return;

        // Match Nest's build: global validation relies on DTO parameter metadata.
        return {
          code: ts.transpileModule(code, {
            compilerOptions: {
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
              target: ts.ScriptTarget.ES2023,
              module: ts.ModuleKind.ESNext,
              inlineSourceMap: true,
              inlineSources: true,
            },
            fileName: id,
          }).outputText,
          map: null,
        };
      },
    },
  ],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.e2e-spec.ts"],
  },
});
